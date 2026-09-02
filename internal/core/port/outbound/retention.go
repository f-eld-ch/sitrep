package outbound

import (
	"context"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// IncidentRetention finds incidents subject to retention and archives all live
// event-store data belonging to one incident within the caller's transaction.
type IncidentRetention interface {
	OpenBefore(ctx context.Context, before time.Time, limit int) ([]shared.IncidentID, error)
	ArchiveBefore(ctx context.Context, closedBefore, deletedBefore time.Time, limit int) ([]shared.IncidentID, error)
	Archive(ctx context.Context, incidentID shared.IncidentID, archivedAt time.Time) error
}
