// Package featurechange decodes Feature events into the backend-independent record
// that the layer projections persist in feature_change, and holds the rule that
// decides whether a change updates the layer's current state.
//
// Changes are ordered by their effective time (the connected message's time), not by
// when they were drawn. A change only updates the current GeoJSON when it is not older
// than the latest change of the same kind already applied; older changes are history only.
package featurechange

import (
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Kind is the type of a feature change.
type Kind string

const (
	Placed   Kind = "placed"
	Moved    Kind = "moved"
	Restyled Kind = "restyled"
	Removed  Kind = "removed"
)

// Change is one feature event in projection form.
type Change struct {
	Kind        Kind
	Version     int
	EffectiveAt time.Time
	RecordedAt  time.Time
	MessageID   string // empty when the change is not tied to a message
	Actor       string

	// IncidentID and LayerID are only present on placed changes; for the others the
	// projection takes them from the feature's placed row.
	IncidentID string
	LayerID    string

	Geometry   jsontext.Value // placed, moved
	Properties jsontext.Value // placed, restyled
}

// Decode converts a Feature event. ok is false for events that are not feature changes.
func Decode(e eventsourcing.Event) (c Change, ok bool, err error) {
	var d struct {
		IncidentID  string         `json:"incidentId"`
		LayerID     string         `json:"layerId"`
		Geometry    jsontext.Value `json:"geometry"`
		Properties  jsontext.Value `json:"properties"`
		EffectiveAt *time.Time     `json:"effectiveAt"`
		MessageID   string         `json:"messageId"`
	}

	switch e.EventType {
	case "Placed", "Imported":
		c.Kind = Placed
	case "Moved":
		c.Kind = Moved
	case "Restyled":
		c.Kind = Restyled
	case "Removed":
		c.Kind = Removed
	default:
		return Change{}, false, nil
	}

	b, err := json.Marshal(e.Data)
	if err != nil {
		return Change{}, false, fmt.Errorf("featurechange: marshal %s: %w", e.EventType, err)
	}

	if err := json.Unmarshal(b, &d); err != nil {
		return Change{}, false, fmt.Errorf("featurechange: decode %s: %w", e.EventType, err)
	}

	c.Version = e.Version
	c.RecordedAt = e.RecordedAt
	c.MessageID = d.MessageID
	c.IncidentID = d.IncidentID
	c.LayerID = d.LayerID
	c.Geometry = d.Geometry
	c.Properties = d.Properties

	// Events written before effective times existed fall back to when they occurred.
	c.EffectiveAt = e.OccurredAt
	if d.EffectiveAt != nil {
		c.EffectiveAt = *d.EffectiveAt
	}

	if a, isString := e.Metadata["actor"].(string); isString {
		c.Actor = a
	}

	return c, true, nil
}

// GuardKinds lists the kinds of earlier changes whose latest effective time gates this
// change. A placed change is never gated; removal is always applied (the aggregate
// already guarantees no later changes exist).
func (c Change) GuardKinds() []Kind {
	switch c.Kind {
	case Moved:
		return []Kind{Placed, Moved}
	case Restyled:
		return []Kind{Placed, Restyled}
	case Placed, Removed:
		return nil
	}

	return nil
}

// UpdatesCurrentState reports whether the change should update the layer's current
// GeoJSON, given the latest effective time of the earlier changes in GuardKinds
// (nil when there is none). Ties go to the later change.
func (c Change) UpdatesCurrentState(latest *time.Time) bool {
	if latest == nil {
		return true
	}

	return !c.EffectiveAt.Before(*latest)
}
