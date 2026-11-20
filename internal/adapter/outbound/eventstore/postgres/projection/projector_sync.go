package projection

import (
	"context"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// The methods below drive the projector synchronously, without leader election or
// LISTEN/NOTIFY. They exist for the conformance suite, which needs to flush the read
// models after each write, and mirror the SQLite projector's methods of the same name.

// CatchUp reads all events appended since each handler's last checkpoint and applies
// them. initCheckpoints runs first so that the checkpoint rows exist; it is idempotent.
func (p *Projector) CatchUp(ctx context.Context) error {
	if err := p.initCheckpoints(ctx); err != nil {
		return err
	}

	return p.catchUp(ctx)
}

// ApplySingle applies one event to the named handler in its own transaction, bypassing
// the checkpoint. It verifies per-event idempotency without advancing the cursor.
func (p *Projector) ApplySingle(ctx context.Context, handlerName string, e eventsourcing.Event) error {
	for _, h := range p.handlers {
		if h.Name() == handlerName {
			return p.applyInTx(ctx, h, e)
		}
	}

	return fmt.Errorf("no handler named %q", handlerName)
}

// ResetAll resets every handler and clears its checkpoint, then runs a full catch-up.
func (p *Projector) ResetAll(ctx context.Context) error {
	if err := p.initCheckpoints(ctx); err != nil {
		return err
	}

	for _, h := range p.handlers {
		if err := p.resetProjection(ctx, h); err != nil {
			return err
		}
	}

	return p.catchUp(ctx)
}
