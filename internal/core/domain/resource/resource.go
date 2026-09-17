// Package resource implements the Resource aggregate root.
//
// A Resource represents an operational unit (Feuerwehr team, police unit, …)
// assigned to a Schadenplatz within an incident.  Every resource goes through
// the state machine: AUFGEBOTEN → EINSATZBEREIT → EINGESETZT → ABGELOEST.
// StoodDown sends a deployed resource back to EINSATZBEREIT for re-deployment.
package resource

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// personnelRanges maps each UnitSize to [min, max] expected headcount.
// The upper bound of BATAILLON is open — we check only the lower bound.
var personnelRanges = map[UnitSize][2]int{
	UnitSizeTrupp:     {1, 2},
	UnitSizeGruppe:    {3, 12},
	UnitSizeZug:       {13, 60},
	UnitSizeKompanie:  {61, 300},
	UnitSizeBataillon: {300, 0}, // 0 means no upper limit
}

// Resource is the aggregate root for an operational unit assigned to an incident.
// DeploymentPeriod records one deployment task (started at → ended at).
type DeploymentPeriod struct {
	StartedAt        time.Time
	EndedAt          *time.Time
	SchadenplatzID   shared.SchadenplatzID
	Formation        Formation
	Name             string
	HomeLocationName *string
	DeploymentLabel  *string
	Hauptaufgabe     string
	PersonnelCount   int
}

type Resource struct {
	root eventsourcing.Root

	incidentID         shared.IncidentID
	schadenplatzID     shared.SchadenplatzID
	formation          Formation
	name               string
	size               UnitSize
	personnelCount     int
	hauptaufgabe       string
	contact            *Contact
	homeLocation       *Location
	deploymentLocation *DeploymentLocation
	status             ResourceStatus
	statusAt           time.Time
	alertedAt          time.Time
	readyAt            *time.Time
	deployedAt         *time.Time
	stoodDownAt        *time.Time
	relievedAt         *time.Time
	einsatzBeginn      *time.Time
	einsatzEnde        *time.Time
	predecessorID      *shared.ResourceID
	successorID        *shared.ResourceID
	sourceMessageID    *shared.MessageID
	deploymentHistory  []DeploymentPeriod
}

// New creates a new (empty) Resource aggregate ready to receive commands.
func New(id shared.ResourceID) *Resource {
	r := &Resource{}
	r.root.SetID(uuid.UUID(id))
	eventsourcing.Register(r,
		Alerted{}, MarkedReady{}, Deployed{}, StoodDown{}, Relieved{},
		SuccessionLinked{}, ReassignedToSchadenplatz{}, DeploymentLocationUpdated{},
		HauptaufgabeChanged{}, ContactUpdated{}, PersonnelCountUpdated{},
		EinsatzDauerRecorded{},
	)

	return r
}

// Root implements eventsourcing.Aggregate.
func (r *Resource) Root() *eventsourcing.Root { return &r.root }

// AggregateType implements eventsourcing.Aggregate.
func (r *Resource) AggregateType() string { return "Resource" }

// OwnerIncidentID implements eventsourcing.Owned.
func (r *Resource) OwnerIncidentID() uuid.UUID { return uuid.UUID(r.incidentID) }

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

func (r *Resource) ID() shared.ResourceID                   { return shared.ResourceID(r.root.ID()) }
func (r *Resource) IncidentID() shared.IncidentID           { return r.incidentID }
func (r *Resource) SchadenplatzID() shared.SchadenplatzID   { return r.schadenplatzID }
func (r *Resource) Formation() Formation                    { return r.formation }
func (r *Resource) Name() string                            { return r.name }
func (r *Resource) Size() UnitSize                          { return r.size }
func (r *Resource) PersonnelCount() int                     { return r.personnelCount }
func (r *Resource) Hauptaufgabe() string                    { return r.hauptaufgabe }
func (r *Resource) Contact() *Contact                       { return r.contact }
func (r *Resource) HomeLocation() *Location                 { return r.homeLocation }
func (r *Resource) DeploymentLocation() *DeploymentLocation { return r.deploymentLocation }
func (r *Resource) Status() ResourceStatus                  { return r.status }
func (r *Resource) StatusAt() time.Time                     { return r.statusAt }
func (r *Resource) AlertedAt() time.Time                    { return r.alertedAt }
func (r *Resource) ReadyAt() *time.Time                     { return r.readyAt }
func (r *Resource) DeployedAt() *time.Time                  { return r.deployedAt }
func (r *Resource) StoodDownAt() *time.Time                 { return r.stoodDownAt }
func (r *Resource) RelievedAt() *time.Time                  { return r.relievedAt }
func (r *Resource) EinsatzBeginn() *time.Time               { return r.einsatzBeginn }
func (r *Resource) EinsatzEnde() *time.Time                 { return r.einsatzEnde }
func (r *Resource) PredecessorID() *shared.ResourceID       { return r.predecessorID }
func (r *Resource) SuccessorID() *shared.ResourceID         { return r.successorID }
func (r *Resource) SourceMessageID() *shared.MessageID      { return r.sourceMessageID }
func (r *Resource) DeploymentHistory() []DeploymentPeriod   { return r.deploymentHistory }
func (r *Resource) IsRelieved() bool                        { return r.status == StatusAbgeloest }

// ──────────────────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────────────────

// Alert creates the resource and assigns it to a Schadenplatz.
func (r *Resource) Alert(
	incidentID shared.IncidentID,
	schadenplatzID shared.SchadenplatzID,
	formation Formation,
	name string,
	size UnitSize,
	personnelCount int,
	hauptaufgabe string,
	contact *Contact,
	homeLocation *Location,
	sourceMessageID *shared.MessageID,
	actor string,
	at time.Time,
) error {
	if strings.TrimSpace(name) == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	if err := validateFormation(formation); err != nil {
		return err
	}

	if err := validateUnitSize(size); err != nil {
		return err
	}

	if personnelCount < 1 {
		return shared.ValidationError{Field: "personnelCount", Message: "must be at least 1"}
	}

	eventsourcing.TrackChange(r, Alerted{
		IncidentID:      incidentID,
		SchadenplatzID:  schadenplatzID,
		Formation:       formation,
		Name:            name,
		Size:            size,
		PersonnelCount:  personnelCount,
		Hauptaufgabe:    hauptaufgabe,
		Contact:         contact,
		HomeLocation:    homeLocation,
		SourceMessageID: sourceMessageID,
	}, at, baseMeta(actor))

	return nil
}

// MarkReady transitions the resource from AUFGEBOTEN to EINSATZBEREIT.
func (r *Resource) MarkReady(actor string, at time.Time) error {
	if r.status != StatusAufgeboten {
		return shared.ValidationError{
			Field:   "status",
			Message: fmt.Sprintf("cannot mark ready from status %s", r.status),
		}
	}

	eventsourcing.TrackChange(r, MarkedReady{At: at}, at, baseMeta(actor))

	return nil
}

// Deploy transitions the resource from EINSATZBEREIT to EINGESETZT.
func (r *Resource) Deploy(actor string, at time.Time) error {
	if r.status != StatusEinsatzbereit {
		return shared.ValidationError{
			Field:   "status",
			Message: fmt.Sprintf("cannot deploy from status %s", r.status),
		}
	}

	eventsourcing.TrackChange(r, Deployed{At: at, DeploymentLocation: r.deploymentLocation}, at, baseMeta(actor))

	return nil
}

// StandDown transitions the resource from EINGESETZT back to EINSATZBEREIT.
func (r *Resource) StandDown(actor string, at time.Time) error {
	if r.status == StatusEinsatzbereit {
		return nil
	}

	if r.status != StatusEingesetzt {
		return shared.ValidationError{
			Field:   "status",
			Message: fmt.Sprintf("cannot stand down from status %s", r.status),
		}
	}

	eventsourcing.TrackChange(r, StoodDown{At: at}, at, baseMeta(actor))

	return nil
}

// Relieve permanently terminates the resource's assignment from any active
// status, including EINSATZBEREIT when the resource has reached its work-time limit.
// successorID is optional; set it when a replacement resource is known.
func (r *Resource) Relieve(successorID *shared.ResourceID, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "resource is already relieved"}
	}

	eventsourcing.TrackChange(r, Relieved{At: at, SuccessorID: successorID}, at, baseMeta(actor))

	return nil
}

// LinkSuccession records the predecessor on a newly alerted successor resource.
func (r *Resource) LinkSuccession(predecessorID shared.ResourceID, actor string, at time.Time) error {
	if r.predecessorID != nil {
		return shared.ValidationError{Field: "predecessorId", Message: "succession already linked"}
	}

	eventsourcing.TrackChange(r, SuccessionLinked{PredecessorID: predecessorID}, at, baseMeta(actor))

	return nil
}

// Reassign moves the resource to a different Schadenplatz.
func (r *Resource) Reassign(schadenplatzID shared.SchadenplatzID, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "cannot reassign a relieved resource"}
	}

	if r.schadenplatzID == schadenplatzID {
		return shared.ValidationError{
			Field:   "schadenplatzId",
			Message: "resource is already assigned to this Schadenplatz",
		}
	}

	eventsourcing.TrackChange(r, ReassignedToSchadenplatz{SchadenplatzID: schadenplatzID}, at, baseMeta(actor))

	return nil
}

// UpdateDeploymentLocation sets or clears the precise operational position.
func (r *Resource) UpdateDeploymentLocation(loc *DeploymentLocation, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "cannot update a relieved resource"}
	}

	eventsourcing.TrackChange(r, DeploymentLocationUpdated{Location: loc}, at, baseMeta(actor))

	return nil
}

// ChangeHauptaufgabe updates the primary task description.
func (r *Resource) ChangeHauptaufgabe(hauptaufgabe, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "cannot update a relieved resource"}
	}

	eventsourcing.TrackChange(r, HauptaufgabeChanged{Hauptaufgabe: hauptaufgabe}, at, baseMeta(actor))

	return nil
}

// UpdateContact changes the communication details.
func (r *Resource) UpdateContact(contact Contact, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "cannot update a relieved resource"}
	}

	eventsourcing.TrackChange(r, ContactUpdated{Contact: contact}, at, baseMeta(actor))

	return nil
}

// UpdatePersonnelCount corrects the headcount.
// A mismatch with the UnitSize triggers ErrUnitSizeMismatch (non-blocking).
func (r *Resource) UpdatePersonnelCount(count int, actor string, at time.Time) error {
	if r.status == StatusAbgeloest {
		return shared.ValidationError{Field: "status", Message: "cannot update a relieved resource"}
	}

	if count < 1 {
		return shared.ValidationError{Field: "personnelCount", Message: "must be at least 1"}
	}

	eventsourcing.TrackChange(r, PersonnelCountUpdated{Count: count}, at, baseMeta(actor))

	return nil
}

// RecordEinsatzDauer records the operational period for this resource.
func (r *Resource) RecordEinsatzDauer(beginn time.Time, ende *time.Time, actor string, at time.Time) error {
	if ende != nil && !ende.After(beginn) {
		return shared.ValidationError{Field: "ende", Message: "must be after beginn"}
	}

	eventsourcing.TrackChange(r, EinsatzDauerRecorded{Beginn: beginn, Ende: ende}, at, baseMeta(actor))

	return nil
}

// UnitSizeForCount returns the expected UnitSize for a given headcount.
// Returns empty string when the count matches no known size.
func UnitSizeForCount(count int) UnitSize {
	for _, size := range []UnitSize{UnitSizeTrupp, UnitSizeGruppe, UnitSizeZug, UnitSizeKompanie, UnitSizeBataillon} {
		r := personnelRanges[size]

		upperBound := r[1]
		if count >= r[0] && (upperBound == 0 || count <= upperBound) {
			return size
		}
	}

	return ""
}

// SizeMismatch returns true when the given personnel count falls outside the
// expected range for the given UnitSize.  This is a soft warning — the operator
// may override it.
func SizeMismatch(size UnitSize, count int) bool {
	r, ok := personnelRanges[size]
	if !ok {
		return false
	}

	if count < r[0] {
		return true
	}

	if r[1] != 0 && count > r[1] {
		return true
	}

	return false
}

// ──────────────────────────────────────────────────────────────────────────────
// Transition
// ──────────────────────────────────────────────────────────────────────────────

// Transition implements eventsourcing.Aggregate. Total, I/O-free.
func (r *Resource) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Alerted:
		r.incidentID = d.IncidentID
		r.schadenplatzID = d.SchadenplatzID
		r.formation = d.Formation
		r.name = d.Name
		r.size = d.Size
		r.personnelCount = d.PersonnelCount
		r.hauptaufgabe = d.Hauptaufgabe
		r.contact = d.Contact
		r.homeLocation = d.HomeLocation
		r.sourceMessageID = d.SourceMessageID
		r.status = StatusAufgeboten
		r.statusAt = e.OccurredAt
		r.alertedAt = e.OccurredAt
	case MarkedReady:
		r.status = StatusEinsatzbereit
		r.statusAt = d.At
		r.readyAt = &d.At
	case Deployed:
		var deployLabel *string
		if d.DeploymentLocation != nil {
			deployLabel = &d.DeploymentLocation.Label
		}

		var homeName *string
		if r.homeLocation != nil {
			homeName = &r.homeLocation.Name
		}

		r.deploymentHistory = append(r.deploymentHistory, DeploymentPeriod{
			StartedAt:        d.At,
			SchadenplatzID:   r.schadenplatzID,
			Formation:        r.formation,
			Name:             r.name,
			HomeLocationName: homeName,
			DeploymentLabel:  deployLabel,
			Hauptaufgabe:     r.hauptaufgabe,
			PersonnelCount:   r.personnelCount,
		})
		r.status = StatusEingesetzt

		r.statusAt = d.At
		if r.deployedAt == nil {
			r.deployedAt = &d.At
		}
	case StoodDown:
		if n := len(r.deploymentHistory); n > 0 {
			r.deploymentHistory[n-1].EndedAt = &d.At
		}

		r.status = StatusEinsatzbereit
		r.statusAt = d.At
		r.stoodDownAt = &d.At
		r.hauptaufgabe = ""
	case Relieved:
		if n := len(r.deploymentHistory); n > 0 && r.deploymentHistory[n-1].EndedAt == nil {
			r.deploymentHistory[n-1].EndedAt = &d.At
		}

		r.status = StatusAbgeloest
		r.statusAt = d.At
		r.relievedAt = &d.At
		r.successorID = d.SuccessorID
	case SuccessionLinked:
		id := d.PredecessorID
		r.predecessorID = &id
	case ReassignedToSchadenplatz:
		r.schadenplatzID = d.SchadenplatzID
	case DeploymentLocationUpdated:
		r.deploymentLocation = d.Location
	case HauptaufgabeChanged:
		r.hauptaufgabe = d.Hauptaufgabe
	case ContactUpdated:
		c := d.Contact
		r.contact = &c
	case PersonnelCountUpdated:
		r.personnelCount = d.Count
	case EinsatzDauerRecorded:
		r.einsatzBeginn = &d.Beginn
		r.einsatzEnde = d.Ende
	default:
		return fmt.Errorf("resource.Transition: unhandled event type %T", e.Data)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func validateFormation(f Formation) error {
	switch f {
	case FormationFW, FormationPOL, FormationARMEE, FormationZS,
		FormationTECHNB, FormationSAN, FormationOTHER:
		return nil
	}

	return shared.ValidationError{Field: "formation", Message: fmt.Sprintf("unknown formation %q", f)}
}

func validateUnitSize(s UnitSize) error {
	switch s {
	case UnitSizeTrupp, UnitSizeGruppe, UnitSizeZug, UnitSizeKompanie, UnitSizeBataillon:
		return nil
	}

	return shared.ValidationError{Field: "size", Message: fmt.Sprintf("unknown unit size %q", s)}
}

func baseMeta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}
