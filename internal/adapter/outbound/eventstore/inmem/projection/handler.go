// Package projection provides in-memory projection handlers and a synchronous
// projector for use in tests. It mirrors the Postgres projection package but
// stores read-model state in plain Go maps rather than database tables.
//
// The Handler interface is intentionally identical in shape to the Postgres
// variant so the same projector loop logic applies to both; the difference is
// that Apply here mutates in-memory state under a mutex instead of writing SQL.
package projection

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Handler applies a single event to an in-memory read model.
type Handler interface {
	// Name is the stable identifier used to track the checkpoint.
	Name() string
	// Version is bumped when the handler's logic changes, triggering a full rebuild.
	Version() int
	// Handles returns true if the handler is interested in this stream/event type pair.
	Handles(streamType, eventType string) bool
	// Apply updates the in-memory read model. Must be idempotent.
	Apply(ctx context.Context, e eventsourcing.Event) error
	// Reset clears all in-memory state owned by this handler.
	Reset(ctx context.Context) error
}

// remarshal round-trips data through JSON so handlers can decode it into a
// concrete struct regardless of whether it arrived as a typed value or as
// json.RawMessage (the inmem store round-trips through JSON on Append).
func remarshal(data any, dst any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("remarshal marshal: %w", err)
	}

	if err := json.Unmarshal(b, dst); err != nil {
		return fmt.Errorf("remarshal unmarshal into %T: %w", dst, err)
	}

	return nil
}
