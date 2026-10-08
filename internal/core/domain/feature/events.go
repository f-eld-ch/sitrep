package feature

import (
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// Every change event carries the map-timeline context it applies to. EffectiveAt is the
// time the change takes effect on the map (the connected message's time); events written
// before it existed lack it and fall back to the event's OccurredAt. MessageID links the
// change to the message it was drawn for.

// Placed is emitted when a feature is first added to a layer.
// The ID is derived server-side from the client's draw key (see DeriveID).
type Placed struct {
	IncidentID  shared.IncidentID `json:"incidentId"`
	LayerID     shared.LayerID    `json:"layerId"`
	Geometry    map[string]any    `json:"geometry"`
	Properties  map[string]any    `json:"properties"`
	EffectiveAt *time.Time        `json:"effectiveAt,omitempty"`
	MessageID   *shared.MessageID `json:"messageId,omitempty"`
}

// Moved updates only the geometry (position/shape changed by drag or resize).
type Moved struct {
	Geometry    map[string]any    `json:"geometry"`
	EffectiveAt *time.Time        `json:"effectiveAt,omitempty"`
	MessageID   *shared.MessageID `json:"messageId,omitempty"`
}

// Restyled updates only the properties (label, colour, icon, etc.).
type Restyled struct {
	Properties  map[string]any    `json:"properties"`
	EffectiveAt *time.Time        `json:"effectiveAt,omitempty"`
	MessageID   *shared.MessageID `json:"messageId,omitempty"`
}

// Removed soft-deletes the feature.
type Removed struct {
	Reason      shared.DeleteReason `json:"reason"`
	EffectiveAt *time.Time          `json:"effectiveAt,omitempty"`
	MessageID   *shared.MessageID   `json:"messageId,omitempty"`
}

// Imported is the one-shot event from the goose import migration.
type Imported struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	LayerID    shared.LayerID    `json:"layerId"`
	Geometry   map[string]any    `json:"geometry"`
	Properties map[string]any    `json:"properties"`
}
