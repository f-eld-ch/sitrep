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
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// DefaultLockName is the stable advisory-lock key used by NewProjector. It
// covers all handlers in a single projector instance.
//
// STABILITY CONTRACT: changing this value causes two replica builds to use
// different lock names and both win the election simultaneously. It is pinned
// by TestDefaultLockName in the test suite.
const DefaultLockName = "postgres-projector"

const (
	defaultStandbyInterval        = 5 * time.Second
	maxConsecutiveCatchUpFailures = 5
)

// errProjectionAhead is returned by initCheckpoints when a stored handler
// version is newer than the current build, indicating this replica is running
// older code during a rolling deploy. The caller should yield the lock.
var errProjectionAhead = errors.New("stored projection version is ahead of this build")

// errCatchUpStuck is returned by lead when catch-up fails consecutively more
// than maxConsecutiveCatchUpFailures times, so the leader releases and a
// standby can try.
var errCatchUpStuck = errors.New("projector: too many consecutive catch-up failures")

// Option configures a Projector.
type Option func(*Projector)

// WithLock sets the leader-election lock. Without this option a no-op lock is
// used, which means all replicas project concurrently (the pre-lock behaviour).
func WithLock(l outbound.ProjectorLock) Option {
	return func(p *Projector) { p.lock = l }
}

// WithLockName overrides the lock name passed to Acquire (default: DefaultLockName).
// Changing the name between builds causes two builds to use different keys and
// both win the election — only change this in tests.
func WithLockName(name string) Option {
	return func(p *Projector) { p.lockName = name }
}

// WithStandbyInterval overrides the sleep between election retries on standbys
// and after stepping down (default: 5 s). Set to a shorter value in tests.
func WithStandbyInterval(d time.Duration) Option {
	return func(p *Projector) { p.standbyInterval = d }
}

// noopLock is the default lock when WithLock is not provided. It always
// succeeds, preserving the pre-election single-replica behaviour.
type noopLock struct{}

func (noopLock) Acquire(_ context.Context, _ string) (func(), error) { return func() {}, nil }

// Compile-time assertion: Projector satisfies the outbound.Projector port.
var _ outbound.Projector = (*Projector)(nil)

// Handler applies a single event to a read-model table.
type Handler interface {
	// Name is the stable identifier stored in projection_checkpoint.
	Name() string
	// Version is bumped whenever the handler's schema or logic changes,
	// triggering a full rebuild on next startup.
	Version() int
	// Handles returns true if the handler is interested in this stream/event type pair.
	Handles(streamType, eventType string) bool
	// Apply writes the event to the read model. Must be idempotent.
	Apply(ctx context.Context, e eventsourcing.Event) error
	// Reset truncates all read-model tables owned by this handler.
	// Called automatically when Version() changes between restarts.
	Reset(ctx context.Context) error
}

const batchSize = 100

// Projector reads the global event stream and applies handlers.
type Projector struct {
	pool     *pgxpool.Pool
	store    outbound.EventStore
	notifier outbound.EventNotifier
	handlers []Handler
	log      *slog.Logger

	// leader election
	lock            outbound.ProjectorLock
	lockName        string
	standbyInterval time.Duration

	// metrics
	eventsApplied  metric.Int64Counter
	catchupDur     metric.Float64Histogram
	handlerErrors  metric.Int64Counter
	deadLetters    metric.Int64Counter
	leaderAcquired metric.Int64Counter
	lockContended  metric.Int64Counter
}

func NewProjector(
	pool *pgxpool.Pool,
	store outbound.EventStore,
	notifier outbound.EventNotifier,
	handlers []Handler,
	opts ...Option,
) *Projector {
	meter := otel.Meter("sitrep/projector")

	eventsApplied, _ := meter.Int64Counter("projector.events.applied",
		metric.WithDescription("Number of events successfully applied by each projection handler"),
		metric.WithUnit("{event}"),
	)
	catchupDur, _ := meter.Float64Histogram("projector.catchup.duration",
		metric.WithDescription("Duration of each catch-up pass"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5),
	)
	handlerErrors, _ := meter.Int64Counter("projector.errors",
		metric.WithDescription("Number of errors encountered during event application"),
		metric.WithUnit("{error}"),
	)
	deadLetters, _ := meter.Int64Counter("projector.dead_letters",
		metric.WithDescription("Number of events parked to the dead-letter table"),
		metric.WithUnit("{event}"),
	)
	leaderAcquired, _ := meter.Int64Counter("projector.leadership.acquired",
		metric.WithDescription("Number of times this instance has been elected projector leader"),
		metric.WithUnit("{election}"),
	)
	lockContended, _ := meter.Int64Counter("projector.lock.contended",
		metric.WithDescription("Number of times lock acquisition was skipped because another instance leads"),
		metric.WithUnit("{skip}"),
	)

	p := &Projector{
		pool:            pool,
		store:           store,
		notifier:        notifier,
		handlers:        handlers,
		log:             slog.Default().WithGroup("projector"),
		lock:            noopLock{},
		lockName:        DefaultLockName,
		standbyInterval: defaultStandbyInterval,
		eventsApplied:   eventsApplied,
		catchupDur:      catchupDur,
		handlerErrors:   handlerErrors,
		deadLetters:     deadLetters,
		leaderAcquired:  leaderAcquired,
		lockContended:   lockContended,
	}
	for _, o := range opts {
		o(p)
	}
	return p
}

// Run drives leader election and, while elected, the projection loop. Only the
// elected instance touches the database; standbys idle. Run returns only when
// ctx is cancelled — transient acquisition and catch-up failures cause a
// step-down and re-election, not a permanent stop.
func (p *Projector) Run(ctx context.Context) error {
	names := make([]string, len(p.handlers))
	for i, h := range p.handlers {
		names[i] = h.Name()
	}
	p.log.InfoContext(ctx, "projector starting", "handlers", names)

	for {
		release, err := p.lock.Acquire(ctx, p.lockName)
		switch {
		case errors.Is(err, outbound.ErrLockHeld):
			p.lockContended.Add(ctx, 1)
			p.log.DebugContext(ctx, "another instance is leading, standing by")
		case err != nil:
			p.log.ErrorContext(ctx, "projector lock acquisition failed", "error", err)
		default:
			p.leaderAcquired.Add(ctx, 1)
			p.log.InfoContext(ctx, "projector elected leader", "lock", p.lockName)
			if leadErr := p.lead(ctx, release); leadErr != nil && !errors.Is(leadErr, context.Canceled) {
				p.log.WarnContext(ctx, "projector stepping down", "error", leadErr)
			}
		}

		if !p.sleep(ctx, p.standbyInterval) {
			p.log.InfoContext(ctx, "projector stopped")
			return ctx.Err()
		}
	}
}

// lead runs the projection loop while this instance holds the lock. It calls
// release (via defer) before returning, guaranteeing the lock is freed before
// pool.Close() in Teardown.
func (p *Projector) lead(ctx context.Context, release func()) error {
	defer release()

	// initCheckpoints runs on every election: a newly elected leader must
	// re-check handler versions, and the check is idempotent.
	if err := p.initCheckpoints(ctx); err != nil {
		if errors.Is(err, errProjectionAhead) {
			// This build is older than the stored projection; yield to the
			// newer replica instead of rebuilding read models backwards.
			p.log.ErrorContext(ctx, "this build is older than the stored projection, yielding leadership",
				"error", err)
		}
		return fmt.Errorf("projector: init checkpoints: %w", err)
	}

	pollTicker := time.NewTicker(500 * time.Millisecond)
	defer pollTicker.Stop()

	consecutiveFailures := 0
	first := true

	for {
		if err := p.catchUp(ctx); err != nil {
			if errors.Is(err, context.Canceled) {
				return ctx.Err()
			}
			consecutiveFailures++
			p.log.ErrorContext(ctx, "projector catch-up failed",
				"error", err, "consecutive_failures", consecutiveFailures)
			if consecutiveFailures >= maxConsecutiveCatchUpFailures {
				return fmt.Errorf("%w after %d failures: %w", errCatchUpStuck, consecutiveFailures, err)
			}
		} else {
			consecutiveFailures = 0
		}

		if first {
			p.log.InfoContext(ctx, "projector ready — initial catch-up complete")
			first = false
		}

		// Check that the advisory lock is still held before the next cycle.
		// This guards against silent split-brain when the lock connection is dropped.
		if checker, ok := p.lock.(outbound.LockLivenessChecker); ok {
			if err := checker.CheckHeld(ctx); err != nil {
				return fmt.Errorf("projector: lock lost: %w", err)
			}
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-pollTicker.C:
		// notifier.Wait blocks until a NOTIFY arrives or ctx is cancelled.
		default:
			waitCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			_ = p.notifier.Wait(waitCtx)
			cancel()
		}
	}
}

// sleep waits for d or until ctx is cancelled. Returns false when ctx is done.
func (p *Projector) sleep(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		select {
		case <-ctx.Done():
			return false
		default:
			return true
		}
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// catchUp reads all new events from each handler's checkpoint and applies them.
func (p *Projector) catchUp(ctx context.Context) error {
	start := time.Now()
	var totalApplied int
	for _, h := range p.handlers {
		handlerAttr := attribute.String("handler", h.Name())
		cursor, err := p.loadCheckpoint(ctx, h.Name())
		if err != nil {
			p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "checkpoint")))
			return err
		}
		var handlerApplied int
		for {
			events, next, err := p.store.Read(ctx, cursor, batchSize)
			if err != nil {
				p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "read")))
				return fmt.Errorf("projector read for %s: %w", h.Name(), err)
			}
			if len(events) == 0 {
				break
			}
			for _, e := range events {
				if !h.Handles(e.StreamType, e.EventType) {
					continue
				}
				if err := p.applyWithDeadLetter(ctx, h, e); err != nil {
					p.log.Error("handler failed after retries", "handler", h.Name(), "error", err)
					p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "apply")))
					// park the event and continue — the projection is now known-incomplete
					if parkErr := p.parkDeadLetter(ctx, h.Name(), next, e, err); parkErr != nil {
						p.log.Error("failed to park dead letter", "error", parkErr)
					} else {
						p.deadLetters.Add(ctx, 1, metric.WithAttributes(handlerAttr))
					}
				} else {
					handlerApplied++
					p.eventsApplied.Add(ctx, 1, metric.WithAttributes(handlerAttr))
				}
			}
			if err := p.saveCheckpoint(ctx, h.Name(), next); err != nil {
				p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "checkpoint")))
				return err
			}
			cursor = next
			if len(events) < batchSize {
				break
			}
		}
		if handlerApplied > 0 {
			p.log.Info("projection caught up", "handler", h.Name(), "applied", handlerApplied)
		}
		totalApplied += handlerApplied
	}
	if totalApplied > 0 {
		p.log.Info("catch-up complete", "total_applied", totalApplied)
	}
	p.catchupDur.Record(ctx, time.Since(start).Seconds())
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

		switch {
		case storedVersion > h.Version():
			// Stored version is ahead of this build — a newer replica has already
			// upgraded the projection. Refuse to rebuild it back to an older schema.
			p.log.ErrorContext(ctx, "projection is newer than this build, refusing to rebuild",
				"handler", h.Name(), "stored", storedVersion, "build", h.Version())
			return fmt.Errorf("%w: %s at v%d, build has v%d",
				errProjectionAhead, h.Name(), storedVersion, h.Version())
		case storedVersion < h.Version():
			p.log.InfoContext(ctx, "projection version changed, rebuilding",
				"handler", h.Name(), "was", storedVersion, "now", h.Version())
			if err := p.resetProjection(ctx, h); err != nil {
				return err
			}
		}
	}
	return nil
}

func (p *Projector) resetProjection(ctx context.Context, h Handler) error {
	if err := h.Reset(ctx); err != nil {
		return fmt.Errorf("reset projection %s: %w", h.Name(), err)
	}
	_, err := p.pool.Exec(ctx, `
		DELETE FROM eventsourcing.projection_dead_letter WHERE projection = $1`,
		h.Name())
	if err != nil {
		return fmt.Errorf("clear dead letters %s: %w", h.Name(), err)
	}
	_, err = p.pool.Exec(ctx,
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
