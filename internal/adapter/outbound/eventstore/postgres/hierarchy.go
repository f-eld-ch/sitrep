package postgres

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const incidentHierarchyLockID int32 = 1

var _ outbound.IncidentHierarchyGuard = (*IncidentHierarchyGuard)(nil)

type IncidentHierarchyGuard struct{}

func NewIncidentHierarchyGuard() *IncidentHierarchyGuard { return &IncidentHierarchyGuard{} }

func (g *IncidentHierarchyGuard) LockForUpdate(ctx context.Context) (func(), error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return nil, fmt.Errorf("incident hierarchy lock: %w", err)
	}

	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, lockClassID, incidentHierarchyLockID)
	if err != nil {
		return nil, fmt.Errorf("incident hierarchy lock: %w", err)
	}

	return func() {}, nil
}

func (g *IncidentHierarchyGuard) HasChildren(ctx context.Context, incidentID shared.IncidentID) (bool, error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return false, fmt.Errorf("incident hierarchy children: %w", err)
	}

	var exists bool

	err = tx.QueryRow(ctx, `
		WITH latest_parent AS (
			SELECT DISTINCT ON (stream_id) stream_id, event_type, data
			FROM eventsourcing.events
			WHERE stream_type = 'Incident'
			  AND event_type IN ('ParentLinked', 'ParentUnlinked')
			ORDER BY stream_id, version DESC
		), deleted AS (
			SELECT stream_id
			FROM eventsourcing.events
			WHERE stream_type = 'Incident'
			  AND event_type = 'Deleted'
		)
		SELECT EXISTS (
			SELECT 1
			FROM latest_parent lp
			WHERE lp.event_type = 'ParentLinked'
			  AND lp.data->>'parentId' = $1
			  AND NOT EXISTS (SELECT 1 FROM deleted d WHERE d.stream_id = lp.stream_id)
		)`, uuid.UUID(incidentID).String()).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("incident hierarchy children: %w", err)
	}

	return exists, nil
}
