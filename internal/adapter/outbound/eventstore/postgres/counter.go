package postgres

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.MessageCounter = (*MessageCounter)(nil)

// MessageCounter uses a Postgres advisory-locked counter row so that message
// numbers are gapless and monotonic per incident even under concurrent writers.
// It must run within a Transactor.WithinTx transaction — TxFromCtx returns an
// error if called outside one.
type MessageCounter struct{}

func NewMessageCounter() *MessageCounter { return &MessageCounter{} }

func (c *MessageCounter) Next(ctx context.Context, incidentID shared.IncidentID) (int, error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return 0, fmt.Errorf("message counter: %w", err)
	}
	var n int
	err = tx.QueryRow(ctx, `
		INSERT INTO eventsourcing.incident_counters (incident_id, next_number)
		VALUES ($1, 1)
		ON CONFLICT (incident_id) DO UPDATE
		  SET next_number = eventsourcing.incident_counters.next_number + 1
		RETURNING next_number`,
		uuid.UUID(incidentID),
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("message counter next: %w", err)
	}
	return n, nil
}
