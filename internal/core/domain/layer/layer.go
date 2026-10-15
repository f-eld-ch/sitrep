// Package layer implements the Layer aggregate root.
package layer

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type Layer struct {
	root eventsourcing.Root

	incidentID shared.IncidentID
	name       string
	kind       shared.LayerKind
	removed    bool
}

func New(id shared.LayerID) *Layer {
	l := &Layer{}
	l.root.SetID(uuid.UUID(id))
	eventsourcing.Register(l, Created{}, KindAssigned{}, Renamed{}, Removed{}, Imported{})

	return l
}

func (l *Layer) Root() *eventsourcing.Root  { return &l.root }
func (l *Layer) AggregateType() string      { return "Layer" }
func (l *Layer) OwnerIncidentID() uuid.UUID { return uuid.UUID(l.incidentID) }

func (l *Layer) IncidentID() shared.IncidentID { return l.incidentID }
func (l *Layer) Name() string                  { return l.name }
func (l *Layer) IsRemoved() bool               { return l.removed }
func (l *Layer) Kind() shared.LayerKind        { return l.kind }

func (l *Layer) Create(incidentID shared.IncidentID, name, actor string, at time.Time) error {
	return l.CreateWithKind(incidentID, name, shared.LayerKindStandard, actor, at)
}

// CreateWithKind creates a layer with an explicit kind (e.g. the message map layer).
func (l *Layer) CreateWithKind(
	incidentID shared.IncidentID, name string, kind shared.LayerKind, actor string, at time.Time,
) error {
	if name == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	eventsourcing.TrackChange(l, Created{IncidentID: incidentID, Name: name, Kind: kind}, at, meta(actor))

	return nil
}

// AssignKind marks an existing layer as system-managed. Idempotent (backfill).
func (l *Layer) AssignKind(kind shared.LayerKind, actor string, at time.Time) error {
	if l.removed {
		return shared.ErrNotFound
	}

	if l.kind == kind {
		return nil
	}

	eventsourcing.TrackChange(l, KindAssigned{Kind: kind}, at, meta(actor))

	return nil
}

func (l *Layer) Rename(name, actor string, at time.Time) error {
	if l.removed {
		return shared.ErrNotFound
	}

	if l.kind != shared.LayerKindStandard {
		return shared.ValidationError{Field: "layer", Message: "system layers cannot be renamed"}
	}

	if name == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	eventsourcing.TrackChange(l, Renamed{Name: name}, at, meta(actor))

	return nil
}

func (l *Layer) Remove(reason shared.DeleteReason, actor string, at time.Time) error {
	if l.removed {
		return shared.ErrNotFound
	}

	if l.kind != shared.LayerKindStandard {
		return shared.ValidationError{Field: "layer", Message: "system layers cannot be removed"}
	}

	eventsourcing.TrackChange(l, Removed{Reason: reason}, at, meta(actor))

	return nil
}

func (l *Layer) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Created:
		l.incidentID = d.IncidentID
		l.name = d.Name
		l.kind = d.Kind
	case KindAssigned:
		l.kind = d.Kind
	case Renamed:
		l.name = d.Name
	case Removed:
		l.removed = true
	case Imported:
		l.incidentID = d.IncidentID
		l.name = d.Name
	default:
		return fmt.Errorf("layer.Transition: unhandled event type %T", e.Data)
	}

	return nil
}

func meta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}
