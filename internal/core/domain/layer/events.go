package layer

import (
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

type Created struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	Name       string            `json:"name"`
	// Kind marks system-managed layers; old events lack it and replay as regular.
	Kind shared.LayerKind `json:"kind,omitempty"`
}

// KindAssigned marks an existing layer as system-managed (backfill only).
type KindAssigned struct {
	Kind shared.LayerKind `json:"kind"`
}

type Renamed struct {
	Name string `json:"name"`
}

type Removed struct {
	Reason shared.DeleteReason `json:"reason"`
}

type Imported struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	Name       string            `json:"name"`
	DeletedAt  *time.Time        `json:"deletedAt,omitempty"`
}
