package feature

import "github.com/f-eld-ch/sitrep/internal/core/domain/shared"

// Placed is emitted when a feature is first added to a layer.
// The client generates the UUID (Feature.ID) for optimistic UI updates.
type Placed struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	LayerID    shared.LayerID    `json:"layerId"`
	Geometry   map[string]any    `json:"geometry"`
	Properties map[string]any    `json:"properties"`
}

// Moved updates only the geometry (position/shape changed by drag or resize).
type Moved struct {
	Geometry map[string]any `json:"geometry"`
}

// Restyled updates only the properties (label, colour, icon, etc.).
type Restyled struct {
	Properties map[string]any `json:"properties"`
}

// Removed soft-deletes the feature.
type Removed struct {
	Reason shared.DeleteReason `json:"reason"`
}

// Imported is the one-shot event from the goose import migration.
type Imported struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	LayerID    shared.LayerID    `json:"layerId"`
	Geometry   map[string]any    `json:"geometry"`
	Properties map[string]any    `json:"properties"`
}
