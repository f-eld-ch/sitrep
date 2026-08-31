package layer

import "github.com/f-eld-ch/sitrep/internal/core/domain/shared"

type Created struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	Name       string            `json:"name"`
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
	DeletedAt  *interface{}      `json:"deletedAt,omitempty"`
}
