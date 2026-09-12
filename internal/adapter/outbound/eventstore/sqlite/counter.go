package sqlite

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.MessageCounter = (*MessageCounter)(nil)

// MessageCounter maintains a gapless, monotonically-increasing message number
// per incident. It must run within a Transactor.WithinTx transaction so that
// the increment and the event INSERT are atomic — if either is rolled back the
// counter returns to its prior value.
type MessageCounter struct{}

func NewMessageCounter() *MessageCounter { return &MessageCounter{} }

func (c *MessageCounter) Next(ctx context.Context, incidentID shared.IncidentID) (int, error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return 0, fmt.Errorf("message counter: %w", err)
	}

	var n int

	err = tx.QueryRowContext(ctx, `
		INSERT INTO eventsourcing_incident_counters (incident_id, next_number)
		VALUES (?, 1)
		ON CONFLICT (incident_id) DO UPDATE
		  SET next_number = eventsourcing_incident_counters.next_number + 1
		RETURNING next_number`,
		uuid.UUID(incidentID).String(),
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("message counter next: %w", err)
	}

	return n, nil
}
