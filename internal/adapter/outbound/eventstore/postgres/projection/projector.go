// Package projection contains the projection handlers and the projector loop.
//
// Each handler applies one event to one read-model table. The projector loop
// reads the global event stream from the checkpoint, applies handlers in
// registration order, and advances the checkpoint.
//
// All projections are asynchronous — they run outside the write transaction.
// NOTIFY wakes the projector on commit; watermark polling guarantees correctness.
package projection

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion: Projector satisfies the outbound.Projector port.
var _ outbound.Projector = (*Projector)(nil)

// Handler applies a single event to a read-model table.
type Handler interface {
	// Name is the stable identifier stored in projection_checkpoint.
	Name() string
	// Version is bumped whenever the handler's schema or logic changes,
	// triggering a full rebuild on next startup.
	Version() int
	// Handles returns true if the handler is interested in this event type.
	Handles(eventType string) bool
	// Apply writes the event to the read model. Must be idempotent.
	Apply(ctx context.Context, e eventsourcing.Event) error
}

const batchSize = 100

// Projector reads the global event stream and applies handlers.
type Projector struct {
	pool     *pgxpool.Pool
	store    outbound.EventStore
	notifier outbound.EventNotifier
	handlers []Handler
	log      *slog.Logger
}

func NewProjector(
	pool *pgxpool.Pool,
	store outbound.EventStore,
	notifier outbound.EventNotifier,
	handlers []Handler,
) *Projector {
	return &Projector{
		pool:     pool,
		store:    store,
		notifier: notifier,
		handlers: handlers,
		log:      slog.Default().WithGroup("projector"),
	}
}

// Run starts the projection loop. It blocks until ctx is cancelled.
// On startup it checks each handler's version and rebuilds stale projections.
func (p *Projector) Run(ctx context.Context) error {
	if err := p.initCheckpoints(ctx); err != nil {
		return fmt.Errorf("projector: init checkpoints: %w", err)
	}

	pollTicker := time.NewTicker(500 * time.Millisecond)
	defer pollTicker.Stop()

	for {
		if err := p.catchUp(ctx); err != nil {
			p.log.Error("projector catch-up failed", "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-pollTicker.C:
		// notifier.Wait blocks until a NOTIFY arrives or ctx is cancelled
		default:
			waitCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			_ = p.notifier.Wait(waitCtx)
			cancel()
		}
	}
}

// catchUp reads all new events from each handler's checkpoint and applies them.
func (p *Projector) catchUp(ctx context.Context) error {
	for _, h := range p.handlers {
		cursor, err := p.loadCheckpoint(ctx, h.Name())
		if err != nil {
			return err
		}
		for {
			events, next, err := p.store.Read(ctx, cursor, batchSize)
			if err != nil {
				return fmt.Errorf("projector read for %s: %w", h.Name(), err)
			}
			if len(events) == 0 {
				break
			}
			for _, e := range events {
				if !h.Handles(e.EventType) {
					continue
				}
				if err := p.applyWithDeadLetter(ctx, h, e); err != nil {
					p.log.Error("handler failed after retries", "handler", h.Name(), "error", err)
					// park the event and continue — the projection is now known-incomplete
					if parkErr := p.parkDeadLetter(ctx, h.Name(), next, e, err); parkErr != nil {
						p.log.Error("failed to park dead letter", "error", parkErr)
					}
				}
			}
			if err := p.saveCheckpoint(ctx, h.Name(), next); err != nil {
				return err
			}
			cursor = next
			if len(events) < batchSize {
				break
			}
		}
	}
	return nil
}

func (p *Projector) applyWithDeadLetter(ctx context.Context, h Handler, e eventsourcing.Event) error {
	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if err := p.applyInTx(ctx, h, e); err != nil {
			lastErr = err
			if attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*attempt) * 50 * time.Millisecond)
			}
			continue
		}
		return nil
	}
	return lastErr
}

func (p *Projector) applyInTx(ctx context.Context, h Handler, e eventsourcing.Event) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	txCtx := context.WithValue(ctx, txKeyType{}, tx)
	if err := h.Apply(txCtx, e); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

// txKeyType is the key projection handlers use to retrieve the transaction from context.
type txKeyType struct{}

// TxFromCtx returns the transaction the projector opened for this batch, if any.
func TxFromCtx(ctx context.Context) (interface {
	Exec(ctx context.Context, sql string, arguments ...any) (interface{ RowsAffected() int64 }, error)
	QueryRow(ctx context.Context, sql string, args ...any) interface{ Scan(dest ...any) error }
}, bool,
) {
	// Projection handlers use pgxpool.Pool directly to avoid coupling to pgx types.
	// They receive the pool via their constructor instead.
	return nil, false
}

// ──────────────────────────────────────────────────────────────────────────────
// Checkpoint management
// ──────────────────────────────────────────────────────────────────────────────

func (p *Projector) initCheckpoints(ctx context.Context) error {
	for _, h := range p.handlers {
		var storedVersion int
		err := p.pool.QueryRow(ctx,
			`SELECT version FROM eventsourcing.projection_checkpoint WHERE name = $1`,
			h.Name(),
		).Scan(&storedVersion)
		if err != nil {
			// Not found — insert fresh checkpoint at zero.
			_, err = p.pool.Exec(ctx,
				`INSERT INTO eventsourcing.projection_checkpoint (name, version, cursor)
				 VALUES ($1, $2, NULL)
				 ON CONFLICT (name) DO NOTHING`,
				h.Name(), h.Version())
			if err != nil {
				return fmt.Errorf("init checkpoint %s: %w", h.Name(), err)
			}
			continue
		}

		if storedVersion != h.Version() {
			p.log.Info("projection version changed, rebuilding",
				"handler", h.Name(), "was", storedVersion, "now", h.Version())
			if err := p.resetProjection(ctx, h); err != nil {
				return err
			}
		}
	}
	return nil
}

func (p *Projector) resetProjection(ctx context.Context, h Handler) error {
	// Each handler implements a Truncate method or we call a table truncation via
	// the handler's known table name. For now update the checkpoint to zero.
	_, err := p.pool.Exec(ctx,
		`UPDATE eventsourcing.projection_checkpoint
		 SET version = $1, cursor = NULL
		 WHERE name = $2`,
		h.Version(), h.Name())
	return err
}

func (p *Projector) loadCheckpoint(ctx context.Context, name string) (outbound.Cursor, error) {
	var raw []byte
	err := p.pool.QueryRow(ctx,
		`SELECT cursor FROM eventsourcing.projection_checkpoint WHERE name = $1`, name,
	).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("load checkpoint %s: %w", name, err)
	}
	return outbound.Cursor(raw), nil
}

func (p *Projector) saveCheckpoint(ctx context.Context, name string, cursor outbound.Cursor) error {
	_, err := p.pool.Exec(ctx,
		`UPDATE eventsourcing.projection_checkpoint SET cursor = $1 WHERE name = $2`,
		[]byte(cursor), name)
	return err
}

func (p *Projector) parkDeadLetter(ctx context.Context, projection string, cursor outbound.Cursor, e eventsourcing.Event, cause error) error {
	data, _ := json.Marshal(e.Data)
	_, err := p.pool.Exec(ctx, `
		INSERT INTO eventsourcing.projection_dead_letter
		  (projection, cursor, stream_type, stream_id, version, error, attempts, parked_at)
		VALUES ($1, $2, $3, $4, $5, $6, 3, now())
		ON CONFLICT (projection, stream_type, stream_id, version) DO UPDATE
		  SET error = EXCLUDED.error, attempts = eventsourcing.projection_dead_letter.attempts + 1,
		      parked_at = now()`,
		projection, []byte(cursor), e.StreamType, e.StreamID, e.Version,
		fmt.Sprintf("%v | data: %s", cause, data),
	)
	return err
}
