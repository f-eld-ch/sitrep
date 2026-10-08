// Package feature implements the Feature aggregate root.
//
// Feature is its own root: no invariant spans two features and contention is high
// for map drawing. Its ID is derived from the incident and the client's draw key, so a
// re-sent create resolves to the same stream.
//
// Changes are ordered by their effective time (the connected message's time on the
// Nachrichtenkarte), not by when they were drawn. The aggregate's current state is the
// latest change by effective time; a late edit for an older message is recorded but does
// not override a newer geometry or properties.
package feature

import (
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ChangeContext says when a change takes effect on the map timeline and which message
// it was drawn for. A zero EffectiveAt means "at the time the command runs".
type ChangeContext struct {
	EffectiveAt time.Time
	MessageID   *shared.MessageID
}

func (c ChangeContext) effective(at time.Time) time.Time {
	if c.EffectiveAt.IsZero() {
		return at
	}

	return c.EffectiveAt
}

func (c ChangeContext) effectivePtr(at time.Time) *time.Time {
	t := c.effective(at)

	return &t
}

type Feature struct {
	root eventsourcing.Root

	incidentID shared.IncidentID
	layerID    shared.LayerID
	geometry   map[string]any
	properties map[string]any
	removed    bool
	removedAt  time.Time

	placedAt     time.Time
	geometryAt   time.Time
	propertiesAt time.Time
	messageIDs   []shared.MessageID
}

// DeriveID derives the feature ID from the incident and the client's draw key. IDs are
// scoped to the incident, so a client can never address another incident's streams, and
// the same key always resolves to the same feature.
func DeriveID(incidentID shared.IncidentID, clientKey string) shared.FeatureID {
	return shared.FeatureID(uuid.NewSHA1(uuid.UUID(incidentID), []byte("feature:"+clientKey)))
}

func New(id shared.FeatureID) *Feature {
	f := &Feature{}
	f.root.SetID(uuid.UUID(id))
	eventsourcing.Register(f, Placed{}, Moved{}, Restyled{}, Removed{}, Restored{}, Imported{})

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

// PlacedAt is the effective time the feature appears on the map timeline.
func (f *Feature) PlacedAt() time.Time { return f.placedAt }

// MessageIDs lists every message that touched this feature, in first-linked order.
func (f *Feature) MessageIDs() []shared.MessageID { return slices.Clone(f.messageIDs) }

func (f *Feature) Place(
	incidentID shared.IncidentID,
	layerID shared.LayerID,
	geometry, properties map[string]any,
	change ChangeContext,
	actor string,
	at time.Time,
) error {
	eventsourcing.TrackChange(f, Placed{
		IncidentID:  incidentID,
		LayerID:     layerID,
		Geometry:    geometry,
		Properties:  properties,
		EffectiveAt: change.effectivePtr(at),
		MessageID:   change.MessageID,
	}, at, meta(actor))

	return nil
}

func (f *Feature) Move(geometry map[string]any, change ChangeContext, actor string, at time.Time) error {
	if err := f.requireChangeAllowed(change.effective(at)); err != nil {
		return err
	}

	eventsourcing.TrackChange(f, Moved{
		Geometry:    geometry,
		EffectiveAt: change.effectivePtr(at),
		MessageID:   change.MessageID,
	}, at, meta(actor))

	return nil
}

func (f *Feature) Restyle(properties map[string]any, change ChangeContext, actor string, at time.Time) error {
	if err := f.requireChangeAllowed(change.effective(at)); err != nil {
		return err
	}

	eventsourcing.TrackChange(f, Restyled{
		Properties:  properties,
		EffectiveAt: change.effectivePtr(at),
		MessageID:   change.MessageID,
	}, at, meta(actor))

	return nil
}

func (f *Feature) Remove(reason shared.DeleteReason, change ChangeContext, actor string, at time.Time) error {
	eff := change.effective(at)
	if err := f.requireChangeAllowed(eff); err != nil {
		return err
	}

	if eff.Before(f.geometryAt) || eff.Before(f.propertiesAt) {
		return shared.ErrFeatureHasLaterChanges
	}

	eventsourcing.TrackChange(f, Removed{
		Reason:      reason,
		EffectiveAt: change.effectivePtr(at),
		MessageID:   change.MessageID,
	}, at, meta(actor))

	return nil
}

// Restore brings a removed feature back, as it last was. The restore takes effect at or after
// the removal: restoring at the removal's own time (the same message) cancels it, a later time
// leaves the feature gone in between.
func (f *Feature) Restore(change ChangeContext, actor string, at time.Time) error {
	if !f.removed {
		return shared.ErrFeatureNotRemoved
	}

	eff := change.effective(at)
	if eff.Before(f.removedAt) {
		return shared.ErrBeforeFeatureRemoved
	}

	eventsourcing.TrackChange(f, Restored{
		IncidentID:  f.incidentID,
		LayerID:     f.layerID,
		Geometry:    f.geometry,
		Properties:  f.properties,
		EffectiveAt: change.effectivePtr(at),
		MessageID:   change.MessageID,
	}, at, meta(actor))

	return nil
}

func (f *Feature) requireChangeAllowed(effective time.Time) error {
	if f.removed {
		return shared.ErrNotFound
	}

	if effective.Before(f.placedAt) {
		return shared.ErrBeforeFeaturePlaced
	}

	return nil
}

func (f *Feature) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Placed:
		eff := effectiveTime(d.EffectiveAt, e.OccurredAt)
		f.incidentID = d.IncidentID
		f.layerID = d.LayerID
		f.geometry = d.Geometry
		f.properties = d.Properties
		f.placedAt, f.geometryAt, f.propertiesAt = eff, eff, eff
		f.linkMessage(d.MessageID)
	case Moved:
		// Ties go to the later-recorded event; strictly older changes are history only.
		if eff := effectiveTime(d.EffectiveAt, e.OccurredAt); !eff.Before(f.geometryAt) {
			f.geometry = d.Geometry
			f.geometryAt = eff
		}

		f.linkMessage(d.MessageID)
	case Restyled:
		if eff := effectiveTime(d.EffectiveAt, e.OccurredAt); !eff.Before(f.propertiesAt) {
			f.properties = d.Properties
			f.propertiesAt = eff
		}

		f.linkMessage(d.MessageID)
	case Removed:
		f.removed = true
		f.removedAt = effectiveTime(d.EffectiveAt, e.OccurredAt)
		f.linkMessage(d.MessageID)
	case Restored:
		// The restored state counts as a change at this time, like the read model treats it:
		// older edits recorded later are history only.
		eff := effectiveTime(d.EffectiveAt, e.OccurredAt)
		f.removed = false
		f.geometryAt, f.propertiesAt = laterOf(f.geometryAt, eff), laterOf(f.propertiesAt, eff)
		f.linkMessage(d.MessageID)
	case Imported:
		f.incidentID = d.IncidentID
		f.layerID = d.LayerID
		f.geometry = d.Geometry
		f.properties = d.Properties
		f.placedAt, f.geometryAt, f.propertiesAt = e.OccurredAt, e.OccurredAt, e.OccurredAt
	default:
		return fmt.Errorf("feature.Transition: unhandled event type %T", e.Data)
	}

	return nil
}

func (f *Feature) linkMessage(id *shared.MessageID) {
	if id != nil && !slices.Contains(f.messageIDs, *id) {
		f.messageIDs = append(f.messageIDs, *id)
	}
}

func laterOf(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}

	return a
}

func effectiveTime(effective *time.Time, occurredAt time.Time) time.Time {
	if effective != nil {
		return *effective
	}

	return occurredAt
}

func meta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}

// NewWithUUID wraps a raw UUID as a feature ID.
func NewWithUUID(id uuid.UUID) *Feature {
	return New(shared.FeatureID(id))
}
