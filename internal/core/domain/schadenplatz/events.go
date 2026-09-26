package schadenplatz

import (
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// ──────────────────────────────────────────────────────────────────────────────
// Value objects embedded in events
// ──────────────────────────────────────────────────────────────────────────────

// CasualtyDeltas carries non-negative integer deltas for each BABS category.
// A positive value means more people reported in that category for this message.
// Zero means no change. Negatives are rejected by the aggregate invariant check.
type CasualtyDeltas struct {
	Vermisste       int `json:"vermisste"`
	Tote            int `json:"tote"`
	Verletzte       int `json:"verletzte"`
	Obdachlose      int `json:"obdachlose"`
	Eingeschlossene int `json:"eingeschlossene"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Schadenplatz events
// ──────────────────────────────────────────────────────────────────────────────

// Created fires when a new Schadenplatz is established for an incident.
// IsDefault=true marks the one auto-created Schadenplatz per incident.
type Created struct {
	IncidentID shared.IncidentID `json:"incidentId"`
	Name       string            `json:"name"`
	IsDefault  bool              `json:"isDefault"`
}

// Renamed fires when the operator renames a Schadenplatz.
type Renamed struct {
	Name string `json:"name"`
}

// GeometrySet fires when the operator sets or updates the GeoJSON geometry.
// A nil/empty value clears the geometry.
type GeometrySet struct {
	// GeoJSON is stored as raw JSON bytes so it round-trips without loss.
	// Using map[string]any loses ordering; []byte preserves the wire format.
	GeoJSON []byte `json:"geoJson,omitempty"`
}

// CasualtiesRecorded fires when a message triage records casualty deltas
// for this Schadenplatz. All deltas must be non-negative; the aggregate
// enforces that no running total goes below zero.
type CasualtiesRecorded struct {
	SourceMessageID shared.MessageID `json:"sourceMessageId"`
	Deltas          CasualtyDeltas   `json:"deltas"`
}

// MergedIntoDefault fires when this Schadenplatz is removed and its casualties
// are merged into the incident's default Schadenplatz.
// After this event the aggregate is considered inactive.
type MergedIntoDefault struct {
	DefaultSchadenplatzID shared.SchadenplatzID `json:"defaultSchadenplatzId"`
}
