// Package projection contains the SQLite projection handlers and the projector loop.
//
// Each handler applies one event to one read-model table. The projector loop
// reads the global event stream from the checkpoint, applies handlers in
// registration order, and advances the checkpoint after each batch.
//
// All projections are asynchronous — they run outside the write transaction.
// Because SQLite is single-writer and single-process, a buffered channel
// notifier replaces Postgres LISTEN/NOTIFY; there is no leader-election loop.
package projection

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

const batchSize = 100

// errProjectionAhead is returned by initCheckpoints when a stored handler
// version is newer than the current build. On a Pi a downgrade means someone
// reflashed the SD card — refuse to rebuild and log clearly.
var errProjectionAhead = errors.New("stored projection version is ahead of this build")

// Handler applies a single event to a read-model table.
type Handler interface {
	// Name is the stable identifier stored in eventsourcing_projection_checkpoint.
	Name() string
	// Version is bumped whenever the handler's schema or logic changes,
	// triggering a full rebuild on next startup.
	Version() int
	// Handles returns true if the handler is interested in this stream/event type pair.
	Handles(streamType, eventType string) bool
	// Apply writes the event to the read model. It receives a context with a
	// *sql.Tx stashed under projTxKey{}. Must be idempotent.
	Apply(ctx context.Context, e eventsourcing.Event) error
	// Reset truncates all read-model tables owned by this handler.
	// Called automatically when Version() changes between restarts.
	Reset(ctx context.Context) error
}

type haltOnErrorHandler interface{ HaltOnError() bool }

// Compile-time assertion.
var _ outbound.Projector = (*Projector)(nil)

// Option configures a Projector.
type Option func(*Projector)

// WithRetention runs maintenance after each initial catch-up. The callback
// returns true when it removed live event streams and requires a full rebuild.
func WithRetention(run func(context.Context) (bool, error)) Option {
	return func(p *Projector) { p.runRetention = run }
}

// Projector reads the global event stream and applies handlers.
// Unlike the Postgres projector there is no leader-election loop: SQLite is
// single-process and the OS flock in the stack constructor enforces that.
type Projector struct {
	read     *sql.DB
	write    *sql.DB
	store    outbound.EventStore
	notifier outbound.EventNotifier
	handlers []Handler
	log      *slog.Logger
	tracer   trace.Tracer

	runRetention func(context.Context) (bool, error)

	eventsApplied metric.Int64Counter
	catchupDur    metric.Float64Histogram
	handlerErrors metric.Int64Counter
	deadLetters   metric.Int64Counter
}

func NewProjector(
	read, write *sql.DB,
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

	p := &Projector{
		read:          read,
		write:         write,
		store:         store,
		notifier:      notifier,
		handlers:      handlers,
		log:           slog.Default().WithGroup("projector"),
		tracer:        otel.Tracer("sitrep/projector"),
		eventsApplied: eventsApplied,
		catchupDur:    catchupDur,
		handlerErrors: handlerErrors,
		deadLetters:   deadLetters,
	}

	for _, o := range opts {
		o(p)
	}

	return p
}

// Run drives the projection loop. It never steps down — SQLite is
// single-process, so there is nothing to yield to. Transient catch-up failures
// are logged and retried forever: a Pi in a field deployment must not give up.
// Run returns only when ctx is cancelled.
func (p *Projector) Run(ctx context.Context) error {
	names := make([]string, len(p.handlers))
	for i, h := range p.handlers {
		names[i] = h.Name()
	}

	p.log.InfoContext(ctx, "projector starting", slog.String("handlers", strings.Join(names, ",")))

	if err := p.initCheckpoints(ctx); err != nil {
		return fmt.Errorf("projector: init checkpoints: %w", err)
	}

	retentionTicker := time.NewTicker(time.Hour)
	defer retentionTicker.Stop()

	first := true

	for {
		if err := p.catchUp(ctx); err != nil {
			if errors.Is(err, context.Canceled) {
				return ctx.Err()
			}

			p.log.ErrorContext(ctx, "projector catch-up failed, retrying",
				slog.String("error", err.Error()))
		} else if first {
			p.log.InfoContext(ctx, "projector ready — initial catch-up complete")

			if err := p.runRetentionOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				p.log.ErrorContext(ctx, "retention failed on startup", slog.String("error", err.Error()))
			}

			first = false
		}

		if err := p.waitForNotificationOrRetention(ctx, retentionTicker.C); err != nil {
			return err
		}
	}
}

func (p *Projector) waitForNotificationOrRetention(ctx context.Context, retentionC <-chan time.Time) error {
	waitCtx, cancel := context.WithCancel(ctx)

	waitDone := make(chan error, 1)
	go func() { waitDone <- p.notifier.Wait(waitCtx) }()

	select {
	case <-ctx.Done():
		cancel()
		<-waitDone

		return ctx.Err()
	case <-retentionC:
		cancel()
		<-waitDone

		return p.runRetentionOnce(ctx)
	case err := <-waitDone:
		cancel()

		if err != nil && !errors.Is(err, context.Canceled) {
			return fmt.Errorf("projector notification wait: %w", err)
		}

		return nil
	}
}

func (p *Projector) runRetentionOnce(ctx context.Context) (err error) {
	ctx, span := p.tracer.Start(ctx, "SQLiteProjector.RunRetention")
	defer func() {
		recordSpanError(span, err)
		span.End()
	}()

	if p.runRetention == nil {
		return nil
	}

	archived, retentionErr := p.runRetention(ctx)
	span.SetAttributes(attribute.Bool("projector.retention.archived", archived))

	if archived {
		p.log.InfoContext(ctx, "retention archived incidents, rebuilding read models")

		for _, handler := range p.handlers {
			if resetErr := p.resetProjection(ctx, handler); resetErr != nil {
				return resetErr
			}
		}

		if err := p.catchUp(ctx); err != nil {
			return err
		}
	}

	if retentionErr != nil {
		return fmt.Errorf("projector retention: %w", retentionErr)
	}

	return nil
}

func (p *Projector) catchUp(ctx context.Context) (err error) {
	ctx, span := p.tracer.Start(ctx, "SQLiteProjector.CatchUp",
		trace.WithAttributes(attribute.Int("projector.handlers", len(p.handlers))))
	defer func() {
		recordSpanError(span, err)
		span.End()
	}()

	start := time.Now()

	var totalApplied int

	for _, h := range p.handlers {
		handlerAttr := attribute.String("handler", h.Name())

		cursor, err := p.loadCheckpoint(ctx, h.Name())
		if err != nil {
			p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "checkpoint")))

			return err
		}

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
					span.RecordError(err,
						trace.WithAttributes(
							attribute.String("projector.handler", h.Name()),
							attribute.String("event.stream_type", e.StreamType),
							attribute.String("event.stream_id", e.StreamID.String()),
							attribute.String("event.type", e.EventType),
							attribute.Int("event.version", e.Version),
						))
					p.log.ErrorContext(ctx, "handler failed after retries",
						slog.String("handler", h.Name()),
						slog.String("error", err.Error()))
					p.handlerErrors.Add(ctx, 1, metric.WithAttributes(handlerAttr, attribute.String("type", "apply")))

					if halt, ok := h.(haltOnErrorHandler); ok && halt.HaltOnError() {
						return fmt.Errorf("projection %s halted on event %s: %w", h.Name(), e.EventType, err)
					}

					if parkErr := p.parkDeadLetter(ctx, h.Name(), next, e, err); parkErr != nil {
						p.log.ErrorContext(ctx, "park dead letter failed",
							slog.String("handler", h.Name()),
							slog.String("error", parkErr.Error()))
					} else {
						p.deadLetters.Add(ctx, 1, metric.WithAttributes(handlerAttr))
					}
				} else {
					totalApplied++

					p.eventsApplied.Add(ctx, 1, metric.WithAttributes(handlerAttr))
				}
			}

			cursor = next

			if err := p.saveCheckpoint(ctx, h.Name(), cursor); err != nil {
				return fmt.Errorf("projector save checkpoint for %s: %w", h.Name(), err)
			}
		}
	}

	elapsed := time.Since(start).Seconds()
	p.catchupDur.Record(ctx, elapsed)
	slog.DebugContext(ctx, "catch-up complete", slog.Int("applied", totalApplied), slog.Float64("elapsed_s", elapsed))

	return nil
}

const maxAttempts = 3

func (p *Projector) applyWithDeadLetter(ctx context.Context, h Handler, e eventsourcing.Event) error {
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

func (p *Projector) applyInTx(ctx context.Context, h Handler, e eventsourcing.Event) (err error) {
	ctx, span := p.tracer.Start(ctx, "SQLiteProjector.ApplyEvent",
		trace.WithAttributes(
			attribute.String("projector.handler", h.Name()),
			attribute.String("event.stream_type", e.StreamType),
			attribute.String("event.stream_id", e.StreamID.String()),
			attribute.String("event.type", e.EventType),
			attribute.Int("event.version", e.Version),
		))
	defer func() {
		recordSpanError(span, err)
		span.End()
	}()

	tx, err := p.write.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	txCtx := context.WithValue(ctx, projTxKey{}, tx)
	if err := h.Apply(txCtx, e); err != nil {
		_ = tx.Rollback()

		return err
	}

	return tx.Commit()
}

// ──────────────────────────────────────────────────────────────────────────────
// Checkpoint management
// ──────────────────────────────────────────────────────────────────────────────

func (p *Projector) initCheckpoints(ctx context.Context) (err error) {
	ctx, span := p.tracer.Start(ctx, "SQLiteProjector.InitCheckpoints")
	defer func() {
		recordSpanError(span, err)
		span.End()
	}()

	for _, h := range p.handlers {
		var storedVersion int

		err := p.read.QueryRowContext(ctx,
			`SELECT version FROM eventsourcing_projection_checkpoint WHERE name = ?`,
			h.Name(),
		).Scan(&storedVersion)
		if err != nil {
			// Not found — insert fresh checkpoint.
			_, insertErr := p.write.ExecContext(ctx, `
				INSERT INTO eventsourcing_projection_checkpoint (name, version, cursor)
				VALUES (?, ?, NULL)
				ON CONFLICT (name) DO NOTHING`,
				h.Name(), h.Version())
			if insertErr != nil {
				return fmt.Errorf("init checkpoint %s: %w", h.Name(), insertErr)
			}

			continue
		}

		switch {
		case storedVersion > h.Version():
			p.log.ErrorContext(ctx, "projection is newer than this build, refusing to rebuild",
				slog.String("handler", h.Name()),
				slog.Int("stored", storedVersion),
				slog.Int("build", h.Version()))

			return fmt.Errorf("%w: %s at v%d, build has v%d",
				errProjectionAhead, h.Name(), storedVersion, h.Version())
		case storedVersion < h.Version():
			p.log.InfoContext(ctx, "projection version changed, rebuilding",
				slog.String("handler", h.Name()),
				slog.Int("was", storedVersion),
				slog.Int("now", h.Version()))

			if err := p.resetProjection(ctx, h); err != nil {
				return err
			}
		}
	}

	return nil
}

func (p *Projector) resetProjection(ctx context.Context, h Handler) (err error) {
	ctx, span := p.tracer.Start(ctx, "SQLiteProjector.ResetProjection",
		trace.WithAttributes(
			attribute.String("projector.handler", h.Name()),
			attribute.Int("projector.handler_version", h.Version()),
		))
	defer func() {
		recordSpanError(span, err)
		span.End()
	}()

	if err := h.Reset(ctx); err != nil {
		return fmt.Errorf("reset projection %s: %w", h.Name(), err)
	}

	if _, err := p.write.ExecContext(ctx,
		`DELETE FROM eventsourcing_projection_dead_letter WHERE projection = ?`,
		h.Name()); err != nil {
		return fmt.Errorf("clear dead letters %s: %w", h.Name(), err)
	}

	_, err = p.write.ExecContext(ctx, `
		UPDATE eventsourcing_projection_checkpoint SET version = ?, cursor = NULL WHERE name = ?`,
		h.Version(), h.Name())

	return err
}

func (p *Projector) loadCheckpoint(ctx context.Context, name string) (outbound.Cursor, error) {
	var raw []byte

	err := p.read.QueryRowContext(ctx,
		`SELECT cursor FROM eventsourcing_projection_checkpoint WHERE name = ?`, name,
	).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("load checkpoint %s: %w", name, err)
	}

	return outbound.Cursor(raw), nil
}

func (p *Projector) saveCheckpoint(ctx context.Context, name string, cursor outbound.Cursor) error {
	_, err := p.write.ExecContext(ctx,
		`UPDATE eventsourcing_projection_checkpoint SET cursor = ? WHERE name = ?`,
		[]byte(cursor), name)

	return err
}

func (p *Projector) parkDeadLetter(
	ctx context.Context,
	projection string,
	cursor outbound.Cursor,
	e eventsourcing.Event,
	cause error,
) error {
	data, err := json.Marshal(e.Data)
	if err != nil {
		return fmt.Errorf("marshal dead-letter event data: %w", err)
	}

	_, err = p.write.ExecContext(ctx, `
		INSERT INTO eventsourcing_projection_dead_letter
		  (projection, cursor, stream_type, stream_id, version, error, attempts, parked_at)
		VALUES (?, ?, ?, ?, ?, ?, 3, ?)
		ON CONFLICT (projection, stream_type, stream_id, version) DO UPDATE
		  SET error = excluded.error,
		      attempts = eventsourcing_projection_dead_letter.attempts + 1,
		      parked_at = excluded.parked_at`,
		projection, []byte(cursor), e.StreamType, e.StreamID.String(), e.Version,
		fmt.Sprintf("%v | data: %s", cause, data),
		sqlite.FormatTime(time.Now().UTC()),
	)

	return err
}

func recordSpanError(span trace.Span, err error) {
	if err == nil || errors.Is(err, context.Canceled) {
		return
	}

	span.RecordError(err)
	span.SetStatus(codes.Error, err.Error())
}
