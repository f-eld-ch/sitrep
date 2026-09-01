// Package incident implements the Incident aggregate root.
//
// Incident owns Location (value object) and Divisions (entities within its boundary).
// It does NOT own Messages, Layers, or Features — those are separate roots.
package incident

import (
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Division is an entity owned by the Incident aggregate.
type Division struct {
	ID          shared.DivisionID
	Name        string
	Description string
}

// Location is a value object owned by the Incident aggregate.
type Location struct {
	Name        string
	Coordinates *[2]float64
}

// Incident is the aggregate root for an incident.
type Incident struct {
	root eventsourcing.Root

	name      string
	location  *Location
	divisions map[shared.DivisionID]Division

	createdAt time.Time
	closedAt  *time.Time
	deletedAt *time.Time
}

// New creates a new (empty) Incident aggregate ready to receive commands.
// The caller must provide the pre-generated id.
func New(id shared.IncidentID) *Incident {
	inc := &Incident{
		divisions: make(map[shared.DivisionID]Division),
	}
	inc.root.SetID(uuid.UUID(id))
	eventsourcing.Register(inc,
		Opened{}, Renamed{}, LocationChanged{},
		DivisionAdded{}, DivisionRenamed{}, DivisionRemoved{},
		Closed{}, Reopened{}, Deleted{}, Imported{},
	)
	return inc
}

// Root implements eventsourcing.Aggregate.
func (i *Incident) Root() *eventsourcing.Root { return &i.root }

// AggregateType implements eventsourcing.Aggregate.
func (i *Incident) AggregateType() string { return "Incident" }

// ──────────────────────────────────────────────────────────────────────────────
// Queries (read-only accessors used by service return values)
// ──────────────────────────────────────────────────────────────────────────────

func (i *Incident) Name() string         { return i.name }
func (i *Incident) Location() *Location  { return i.location }
func (i *Incident) CreatedAt() time.Time { return i.createdAt }
func (i *Incident) ClosedAt() *time.Time { return i.closedAt }
func (i *Incident) IsOpen() bool         { return i.closedAt == nil && i.deletedAt == nil }
func (i *Incident) IsClosed() bool       { return i.closedAt != nil && i.deletedAt == nil }
func (i *Incident) IsDeleted() bool      { return i.deletedAt != nil }

func (i *Incident) Divisions() []Division {
	out := make([]Division, 0, len(i.divisions))
	for _, d := range i.divisions {
		out = append(out, d)
	}
	return out
}

func (i *Incident) Division(id shared.DivisionID) (Division, bool) {
	d, ok := i.divisions[id]
	return d, ok
}

// ──────────────────────────────────────────────────────────────────────────────
// Commands (mutating methods)
// ──────────────────────────────────────────────────────────────────────────────

// Open appends an IncidentOpened event. Called by the service after generating
// the id, so the aggregate is always created with a pre-known identifier.
func (i *Incident) Open(
	name string,
	loc *LocationData,
	divisions []DivisionData,
	at time.Time,
	actor string,
) error {
	if name == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}
	meta := baseMeta(actor)
	eventsourcing.TrackChange(i, Opened{Name: name, Location: loc}, at, meta)
	for _, d := range divisions {
		eventsourcing.TrackChange(i, DivisionAdded{Division: d}, at, meta)
	}
	return nil
}

// Rename changes the incident's name.
func (i *Incident) Rename(name, actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}
	if name == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}
	eventsourcing.TrackChange(i, Renamed{Name: name}, at, baseMeta(actor))
	return nil
}

// ChangeLocation updates the incident's location.
func (i *Incident) ChangeLocation(loc LocationData, actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}
	eventsourcing.TrackChange(i, LocationChanged{Location: loc}, at, baseMeta(actor))
	return nil
}

// UpdateDivisions performs an atomic set-replacement: it diffs the current set
// against the desired set and emits add/rename/remove events.
func (i *Incident) UpdateDivisions(desired []DivisionData, actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}
	meta := baseMeta(actor)

	// Build a lookup of desired divisions by ID.
	desiredByID := make(map[shared.DivisionID]DivisionData, len(desired))
	for _, d := range desired {
		desiredByID[d.ID] = d
	}

	// Remove divisions no longer present.
	for id := range i.divisions {
		if _, keep := desiredByID[id]; !keep {
			eventsourcing.TrackChange(i, DivisionRemoved{ID: id}, at, meta)
		}
	}

	// Add or update divisions.
	for _, d := range desired {
		existing, exists := i.divisions[d.ID]
		if !exists {
			eventsourcing.TrackChange(i, DivisionAdded{Division: d}, at, meta)
		} else if existing.Name != d.Name || existing.Description != d.Description {
			eventsourcing.TrackChange(i, DivisionRenamed{ID: d.ID, Name: d.Name, Description: &d.Description}, at, meta)
		}
	}
	return nil
}

// Close marks the incident as closed.
func (i *Incident) Close(reason shared.CloseReason, actor string, at time.Time) error {
	if i.IsDeleted() {
		return shared.ErrIncidentDeleted
	}
	if i.IsClosed() {
		return shared.ErrAlreadyClosed
	}
	eventsourcing.TrackChange(i, Closed{ClosedAt: at, Reason: reason}, at, baseMeta(actor))
	return nil
}

// Reopen re-opens a previously closed incident.
func (i *Incident) Reopen(actor string, at time.Time) error {
	if i.IsDeleted() {
		return shared.ErrIncidentDeleted
	}
	if i.IsOpen() {
		return shared.ErrAlreadyOpen
	}
	eventsourcing.TrackChange(i, Reopened{}, at, baseMeta(actor))
	return nil
}

// Delete permanently marks the incident as deleted. Requires closure first.
func (i *Incident) Delete(reason shared.DeleteReason, actor string, at time.Time) error {
	if i.IsDeleted() {
		return shared.ErrIncidentDeleted
	}
	if !i.IsClosed() {
		return shared.ErrIncidentNotClosed
	}
	eventsourcing.TrackChange(i, Deleted{Reason: reason}, at, baseMeta(actor))
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Transition — applies one event to update in-memory state
// ──────────────────────────────────────────────────────────────────────────────

// Transition implements eventsourcing.Aggregate. It must be total and I/O-free.
func (i *Incident) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Opened:
		i.name = d.Name
		i.createdAt = e.OccurredAt
		if d.Location != nil {
			i.location = &Location{Name: d.Location.Name, Coordinates: d.Location.Coordinates}
		}
	case Renamed:
		i.name = d.Name
	case LocationChanged:
		i.location = &Location{Name: d.Location.Name, Coordinates: d.Location.Coordinates}
	case DivisionAdded:
		i.divisions[d.Division.ID] = Division{
			ID:          d.Division.ID,
			Name:        d.Division.Name,
			Description: d.Division.Description,
		}
	case DivisionRenamed:
		if div, ok := i.divisions[d.ID]; ok {
			div.Name = d.Name
			if d.Description != nil {
				div.Description = *d.Description
			}
			i.divisions[d.ID] = div
		}
	case DivisionRemoved:
		delete(i.divisions, d.ID)
	case Closed:
		i.closedAt = &d.ClosedAt
	case Reopened:
		i.closedAt = nil
	case Deleted:
		now := e.OccurredAt
		i.deletedAt = &now
	case Imported:
		i.name = d.Name
		i.createdAt = d.CreatedAt
		if d.Location != nil {
			i.location = &Location{Name: d.Location.Name, Coordinates: d.Location.Coordinates}
		}
		for _, div := range d.Divisions {
			i.divisions[div.ID] = Division(div)
		}
		if d.ClosedAt != nil {
			i.closedAt = d.ClosedAt
		}
		if d.DeletedAt != nil {
			i.deletedAt = d.DeletedAt
		}
	default:
		return fmt.Errorf("incident.Transition: unhandled event type %T", e.Data)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func (i *Incident) requireOpen() error {
	if i.IsDeleted() {
		return shared.ErrIncidentDeleted
	}
	if !i.IsOpen() {
		return shared.ErrIncidentNotOpen
	}
	return nil
}

func baseMeta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}
