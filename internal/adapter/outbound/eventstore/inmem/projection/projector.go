package projection

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const batchSize = 100

// Projector reads the global event stream from the in-memory store and applies
// handlers synchronously. It is designed for test use:
//
//   - Call CatchUp(ctx) after each write to process all pending events.
//   - Call Run(ctx) to do an initial catch-up and then block until the context
//     is cancelled — this satisfies outbound.Projector as a drop-in.
//
// There are no retries, no dead-letter, and no goroutines; failures surface
// immediately as errors so tests see the exact problem without extra ceremony.
type Projector struct {
	store    outbound.EventStore
	handlers []Handler
	cursors  map[string]outbound.Cursor
	log      *slog.Logger
}

func NewProjector(store outbound.EventStore, handlers []Handler) *Projector {
	cursors := make(map[string]outbound.Cursor, len(handlers))
	for _, h := range handlers {
		cursors[h.Name()] = nil // start from the beginning
	}
	return &Projector{
		store:    store,
		handlers: handlers,
		cursors:  cursors,
		log:      slog.Default().WithGroup("inmem-projector"),
	}
}

// CatchUp reads all events appended since each handler's last cursor and applies
// them. It processes handlers in registration order and returns on the first error.
func (p *Projector) CatchUp(ctx context.Context) error {
	for _, h := range p.handlers {
		cursor := p.cursors[h.Name()]
		for {
			events, next, err := p.store.Read(ctx, cursor, batchSize)
			if err != nil {
				return fmt.Errorf("inmem projector read for %s: %w", h.Name(), err)
			}
			if len(events) == 0 {
				break
			}
			for _, e := range events {
				if !h.Handles(e.StreamType, e.EventType) {
					continue
				}
				if err := h.Apply(ctx, e); err != nil {
					return fmt.Errorf("inmem projector %s apply %s/%s v%d: %w",
						h.Name(), e.StreamType, e.EventType, e.Version, err)
				}
			}
			p.cursors[h.Name()] = next
			cursor = next
			if len(events) < batchSize {
				break
			}
		}
	}
	return nil
}

// Reset rebuilds all handlers from the beginning of the event log. Useful when a
// handler's Version() changes or when tests need a clean read-model mid-run.
func (p *Projector) Reset(ctx context.Context) error {
	for _, h := range p.handlers {
		if err := h.Reset(ctx); err != nil {
			return fmt.Errorf("inmem projector reset %s: %w", h.Name(), err)
		}
		p.cursors[h.Name()] = nil
	}
	return p.CatchUp(ctx)
}

// Run does an initial CatchUp and then blocks until ctx is cancelled.
// It satisfies outbound.Projector so the in-memory stack can be used wherever
// the real projector is expected.
func (p *Projector) Run(ctx context.Context) error {
	if err := p.CatchUp(ctx); err != nil && !errors.Is(err, context.Canceled) {
		p.log.ErrorContext(ctx, "inmem projector initial catch-up failed", "error", err)
		return err
	}
	<-ctx.Done()
	return ctx.Err()
}
