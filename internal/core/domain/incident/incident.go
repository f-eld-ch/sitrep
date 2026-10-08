// Package incident implements the Incident aggregate root.
//
// Incident owns Location (value object) and Divisions (entities within its boundary).
// It does NOT own Messages, Layers, or Features — those are separate roots.
package incident

import (
	"fmt"
	"strings"
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
	Kind        shared.DivisionKind
}

// IsSystem reports whether the division is managed by the system and therefore
// cannot be renamed or removed by users.
func (d Division) IsSystem() bool { return d.Kind != shared.DivisionKindStandard }

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
	parentID  *shared.IncidentID

	defaultSchadenplatzID *shared.SchadenplatzID

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
		DivisionAdded{}, DivisionRenamed{}, DivisionRemoved{}, DivisionKindAssigned{},
		ParentLinked{}, ParentUnlinked{},
		Closed{}, Reopened{}, Deleted{}, Imported{},
		DefaultSchadenplatzLinked{},
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

func (i *Incident) OwnerIncidentID() uuid.UUID { return i.root.ID() }

func (i *Incident) Name() string                                  { return i.name }
func (i *Incident) DefaultSchadenplatzID() *shared.SchadenplatzID { return i.defaultSchadenplatzID }
func (i *Incident) Location() *Location                           { return i.location }
func (i *Incident) ParentID() *shared.IncidentID                  { return i.parentID }
func (i *Incident) CreatedAt() time.Time                          { return i.createdAt }
func (i *Incident) ClosedAt() *time.Time                          { return i.closedAt }
func (i *Incident) IsOpen() bool                                  { return i.closedAt == nil && i.deletedAt == nil }

func (i *Incident) IsClosed() bool  { return i.closedAt != nil && i.deletedAt == nil }
func (i *Incident) IsDeleted() bool { return i.deletedAt != nil }

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

// MessageMapDivision returns the system-managed Nachrichtenkarte division.
func (i *Incident) MessageMapDivision() (Division, bool) {
	for _, d := range i.divisions {
		if d.Kind == shared.DivisionKindMessageMap {
			return d, true
		}
	}

	return Division{}, false
}

// ──────────────────────────────────────────────────────────────────────────────
// Commands (mutating methods)
// ──────────────────────────────────────────────────────────────────────────────

// Open appends an IncidentOpened event. Called by the service after generating
// the id, so the aggregate is always created with a pre-known identifier.
// Open always adds the system-managed message map division (Nachrichtenkarte)
// with a deterministic ID, so every incident has exactly one. Callers must not
// pass divisions with a kind.
func (i *Incident) Open(
	name string,
	loc *LocationData,
	divisions []DivisionData,
	at time.Time,
	actor string,
) error {
	if strings.TrimSpace(name) == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	if err := validateDivisions(divisions); err != nil {
		return err
	}

	for _, d := range divisions {
		if d.Kind != shared.DivisionKindStandard {
			return shared.ValidationError{Field: "division.kind", Message: "system divisions cannot be set"}
		}
	}

	meta := baseMeta(actor)
	eventsourcing.TrackChange(i, Opened{Name: name, Location: loc}, at, meta)
	eventsourcing.TrackChange(i, DivisionAdded{Division: DivisionData{
		ID:          MessageMapDivisionID(shared.IncidentID(i.root.ID())),
		Name:        shared.MessageMapDivisionName,
		Description: shared.MessageMapDivisionDescription,
		Kind:        shared.DivisionKindMessageMap,
	}}, at, meta)

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

	if strings.TrimSpace(name) == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	eventsourcing.TrackChange(i, Renamed{Name: name}, at, baseMeta(actor))

	return nil
}

// ChangeLocation updates the incident's location.
// Pass nil or a zero-value LocationData to clear the location.
func (i *Incident) ChangeLocation(loc *LocationData, actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}
	// Zero-value pointer is treated the same as nil (clear).
	var payload *LocationData
	if loc != nil && (loc.Name != "" || loc.Coordinates != nil) {
		payload = loc
	}

	eventsourcing.TrackChange(i, LocationChanged{Location: payload}, at, baseMeta(actor))

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
	// System divisions are invisible to callers: they are never removed or
	// renamed, and callers cannot introduce new ones.
	desiredByID := make(map[shared.DivisionID]DivisionData, len(desired))

	for _, d := range desired {
		if d.Kind != shared.DivisionKindStandard {
			return shared.ValidationError{Field: "division.kind", Message: "system divisions cannot be set"}
		}

		desiredByID[d.ID] = d
	}

	var removals []shared.DivisionID

	for id, existing := range i.divisions {
		if existing.IsSystem() {
			continue
		}

		if _, keep := desiredByID[id]; !keep {
			removals = append(removals, id)
		}
	}

	var additions []DivisionData

	var renames []DivisionData

	for _, d := range desired {
		existing, exists := i.divisions[d.ID]
		if exists && existing.IsSystem() {
			continue
		}

		if !exists {
			if err := validateDivision(d); err != nil {
				return err
			}

			additions = append(additions, d)
		} else if existing.Name != d.Name || existing.Description != d.Description {
			if err := validateDivision(d); err != nil {
				return err
			}

			renames = append(renames, d)
		}
	}

	for _, id := range removals {
		eventsourcing.TrackChange(i, DivisionRemoved{ID: id}, at, meta)
	}

	for _, d := range additions {
		eventsourcing.TrackChange(i, DivisionAdded{Division: d}, at, meta)
	}

	for _, d := range renames {
		eventsourcing.TrackChange(i, DivisionRenamed{ID: d.ID, Name: d.Name, Description: &d.Description}, at, meta)
	}

	return nil
}

// AssignDivisionKind marks an existing division as system-managed. Used by the
// backfill; it is idempotent and refuses to create a second MESSAGE_MAP division.
func (i *Incident) AssignDivisionKind(
	id shared.DivisionID,
	kind shared.DivisionKind,
	actor string,
	at time.Time,
) error {
	div, ok := i.divisions[id]
	if !ok {
		return shared.ErrNotFound
	}

	if div.Kind == kind {
		return nil
	}

	if kind == shared.DivisionKindMessageMap {
		if _, exists := i.MessageMapDivision(); exists {
			return shared.ValidationError{Field: "division.kind", Message: "message map division already exists"}
		}
	}

	eventsourcing.TrackChange(i, DivisionKindAssigned{ID: id, Kind: kind}, at, baseMeta(actor))

	return nil
}

// MessageMapDivisionID derives the stable ID of an incident's message map
// division, so the domain needs no ID generator.
func MessageMapDivisionID(incidentID shared.IncidentID) shared.DivisionID {
	return shared.DivisionID(uuid.NewSHA1(uuid.UUID(incidentID), []byte("message-map-division")))
}

func validateDivisions(divisions []DivisionData) error {
	for _, division := range divisions {
		if err := validateDivision(division); err != nil {
			return err
		}
	}

	return nil
}

func validateDivision(division DivisionData) error {
	if strings.TrimSpace(division.Name) == "" {
		return shared.ValidationError{Field: "division.name", Message: "must not be empty"}
	}

	if strings.TrimSpace(division.Description) == "" {
		return shared.ValidationError{Field: "division.description", Message: "must not be empty"}
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

func (i *Incident) LinkParent(parentID shared.IncidentID, actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}

	if parentID == shared.IncidentID(i.root.ID()) {
		return shared.ValidationError{Field: "parentId", Message: "must not reference the incident itself"}
	}

	eventsourcing.TrackChange(i, ParentLinked{ParentID: parentID}, at, baseMeta(actor))

	return nil
}

func (i *Incident) UnlinkParent(actor string, at time.Time) error {
	if err := i.requireOpen(); err != nil {
		return err
	}

	eventsourcing.TrackChange(i, ParentUnlinked{}, at, baseMeta(actor))

	return nil
}

// LinkDefaultSchadenplatz records the ID of the auto-created default Schadenplatz.
// Must be called exactly once, immediately after the incident is opened.
func (i *Incident) LinkDefaultSchadenplatz(id shared.SchadenplatzID, actor string, at time.Time) error {
	if i.defaultSchadenplatzID != nil {
		return shared.ValidationError{Field: "defaultSchadenplatzId", Message: "already set"}
	}

	eventsourcing.TrackChange(i, DefaultSchadenplatzLinked{SchadenplatzID: id}, at, baseMeta(actor))

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
		if d.Location != nil {
			i.location = &Location{Name: d.Location.Name, Coordinates: d.Location.Coordinates}
		} else {
			i.location = nil
		}
	case DivisionAdded:
		i.divisions[d.Division.ID] = Division{
			ID:          d.Division.ID,
			Name:        d.Division.Name,
			Description: d.Division.Description,
			Kind:        d.Division.Kind,
		}
	case DivisionKindAssigned:
		if div, ok := i.divisions[d.ID]; ok {
			div.Kind = d.Kind
			i.divisions[d.ID] = div
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
	case ParentLinked:
		parentID := d.ParentID
		i.parentID = &parentID
	case ParentUnlinked:
		i.parentID = nil
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
	case DefaultSchadenplatzLinked:
		id := d.SchadenplatzID
		i.defaultSchadenplatzID = &id
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
