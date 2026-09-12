package sqlite

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.IncidentHierarchyGuard = (*IncidentHierarchyGuard)(nil)

// IncidentHierarchyGuard serialises parent-link validation across concurrent
// service calls. The LockForUpdate method acquires a process-wide mutex;
// MaxOpenConns(1) on the writer ensures no two goroutines can hold an open
// write transaction simultaneously, so the mutex is technically redundant but
// kept for consistency with the Postgres port and as belt-and-suspenders.
//
// See doc.go: MaxOpenConns(1) is the structural guarantee; the mutex mirrors
// what pg_advisory_xact_lock provides in the Postgres adapter.
type IncidentHierarchyGuard struct {
	mu sync.Mutex
}

func NewIncidentHierarchyGuard() *IncidentHierarchyGuard { return &IncidentHierarchyGuard{} }

func (g *IncidentHierarchyGuard) LockForUpdate(ctx context.Context) (func(), error) {
	if _, err := TxFromCtx(ctx); err != nil {
		return nil, fmt.Errorf("incident hierarchy lock: %w", err)
	}

	g.mu.Lock()

	return g.mu.Unlock, nil
}

func (g *IncidentHierarchyGuard) HasChildren(ctx context.Context, incidentID shared.IncidentID) (bool, error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return false, fmt.Errorf("incident hierarchy children: %w", err)
	}

	var exists bool

	// DISTINCT ON is not supported in SQLite; use ROW_NUMBER() OVER instead.
	// This is a structural translation of the Postgres query so divergence
	// between adapters stays visible in review.
	err = tx.QueryRowContext(ctx, `
		WITH latest_parent AS (
			SELECT stream_id, event_type, data FROM (
				SELECT stream_id, event_type, data,
				       ROW_NUMBER() OVER (PARTITION BY stream_id ORDER BY version DESC) AS rn
				FROM eventsourcing_events
				WHERE stream_type = 'Incident'
				  AND event_type IN ('ParentLinked', 'ParentUnlinked')
			) WHERE rn = 1
		)
		SELECT EXISTS (
			SELECT 1 FROM latest_parent lp
			WHERE lp.event_type = 'ParentLinked'
			  AND json_extract(lp.data, '$.parentId') = ?
			  AND NOT EXISTS (
			      SELECT 1 FROM eventsourcing_events d
			      WHERE d.stream_type = 'Incident'
			        AND d.event_type = 'Deleted'
			        AND d.stream_id = lp.stream_id
			  )
		)`,
		uuid.UUID(incidentID).String(),
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("incident hierarchy children: %w", err)
	}

	return exists, nil
}
