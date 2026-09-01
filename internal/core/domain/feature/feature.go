// Package feature implements the Feature aggregate root.
//
// Feature is its own root: no invariant spans two features, contention is high
// for map drawing, and the UI generates the UUID client-side for optimistic updates.
package feature

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type Feature struct {
	root eventsourcing.Root

	incidentID shared.IncidentID
	layerID    shared.LayerID
	geometry   map[string]any
	properties map[string]any
	removed    bool
}

func New(id shared.FeatureID) *Feature {
	f := &Feature{}
	f.root.SetID(uuid.UUID(id))
	eventsourcing.Register(f, Placed{}, Moved{}, Restyled{}, Removed{}, Imported{})
	return f
}

func (f *Feature) Root() *eventsourcing.Root  { return &f.root }
func (f *Feature) AggregateType() string      { return "Feature" }
func (f *Feature) OwnerIncidentID() uuid.UUID { return uuid.UUID(f.incidentID) }

func (f *Feature) IncidentID() shared.IncidentID { return f.incidentID }
func (f *Feature) LayerID() shared.LayerID       { return f.layerID }
func (f *Feature) Geometry() map[string]any      { return f.geometry }
func (f *Feature) Properties() map[string]any    { return f.properties }
func (f *Feature) IsRemoved() bool               { return f.removed }

func (f *Feature) Place(
	incidentID shared.IncidentID,
	layerID shared.LayerID,
	geometry, properties map[string]any,
	actor string,
	at time.Time,
) error {
	eventsourcing.TrackChange(f, Placed{
		IncidentID: incidentID,
		LayerID:    layerID,
		Geometry:   geometry,
		Properties: properties,
	}, at, meta(actor))
	return nil
}

func (f *Feature) Move(geometry map[string]any, actor string, at time.Time) error {
	if f.removed {
		return shared.ErrNotFound
	}
	eventsourcing.TrackChange(f, Moved{Geometry: geometry}, at, meta(actor))
	return nil
}

func (f *Feature) Restyle(properties map[string]any, actor string, at time.Time) error {
	if f.removed {
		return shared.ErrNotFound
	}
	eventsourcing.TrackChange(f, Restyled{Properties: properties}, at, meta(actor))
	return nil
}

func (f *Feature) Remove(reason shared.DeleteReason, actor string, at time.Time) error {
	if f.removed {
		return shared.ErrNotFound
	}
	eventsourcing.TrackChange(f, Removed{Reason: reason}, at, meta(actor))
	return nil
}

func (f *Feature) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Placed:
		f.incidentID = d.IncidentID
		f.layerID = d.LayerID
		f.geometry = d.Geometry
		f.properties = d.Properties
	case Moved:
		f.geometry = d.Geometry
	case Restyled:
		f.properties = d.Properties
	case Removed:
		f.removed = true
	case Imported:
		f.incidentID = d.IncidentID
		f.layerID = d.LayerID
		f.geometry = d.Geometry
		f.properties = d.Properties
	default:
		return fmt.Errorf("feature.Transition: unhandled event type %T", e.Data)
	}
	return nil
}

func meta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}

// Ensure the client-generated id can be passed directly.
func NewWithUUID(id uuid.UUID) *Feature {
	return New(shared.FeatureID(id))
}
