package resource

import (
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// ──────────────────────────────────────────────────────────────────────────────
// Value objects
// ──────────────────────────────────────────────────────────────────────────────

// Formation is the organisational type of the resource unit.
type Formation string

const (
	FormationFW     Formation = "FW"
	FormationPOL    Formation = "POL"
	FormationARMEE  Formation = "ARMEE"
	FormationZS     Formation = "ZS"
	FormationTECHNB Formation = "TECHNB"
	FormationSAN    Formation = "SAN"
	FormationOTHER  Formation = "OTHER"
)

// UnitSize is the standard Swiss civil-protection unit size.
type UnitSize string

const (
	UnitSizeTrupp     UnitSize = "TRUPP"
	UnitSizeGruppe    UnitSize = "GRUPPE"
	UnitSizeZug       UnitSize = "ZUG"
	UnitSizeKompanie  UnitSize = "KOMPANIE"
	UnitSizeBataillon UnitSize = "BATAILLON"
)

// ResourceStatus is the current operational state of the resource.
type ResourceStatus string

const (
	StatusAufgeboten    ResourceStatus = "AUFGEBOTEN"
	StatusEinsatzbereit ResourceStatus = "EINSATZBEREIT"
	StatusEingesetzt    ResourceStatus = "EINGESETZT"
	StatusAbgeloest     ResourceStatus = "ABGELOEST"
)

// ContactMedium is the communication medium for reaching the resource.
type ContactMedium string

const (
	ContactMediumRadio ContactMedium = "RADIO"
	ContactMediumPhone ContactMedium = "PHONE"
	ContactMediumOther ContactMedium = "OTHER"
)

// Contact holds the communication details for a resource.
type Contact struct {
	Medium ContactMedium `json:"medium"`
	Detail string        `json:"detail"`
}

// Location holds a named place with optional coordinates.
type Location struct {
	Name        string      `json:"name"`
	Coordinates *[2]float64 `json:"coordinates,omitempty"`
}

// DeploymentLocation is the precise operational point within a Schadenplatz.
type DeploymentLocation struct {
	Lat   *float64 `json:"lat,omitempty"`
	Lng   *float64 `json:"lng,omitempty"`
	Label string   `json:"label"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Resource events
// ──────────────────────────────────────────────────────────────────────────────

// Alerted fires when a resource is first reported to the incident.
// SchadenplatzID is always resolved to the incident's default if not supplied by caller.
type Alerted struct {
	IncidentID      shared.IncidentID     `json:"incidentId"`
	SchadenplatzID  shared.SchadenplatzID `json:"schadenplatzId"`
	Formation       Formation             `json:"formation"`
	Name            string                `json:"name"`
	Size            UnitSize              `json:"size"`
	PersonnelCount  int                   `json:"personnelCount"`
	Hauptaufgabe    string                `json:"hauptaufgabe"`
	Contact         *Contact              `json:"contact,omitempty"`
	HomeLocation    *Location             `json:"homeLocation,omitempty"`
	SourceMessageID *shared.MessageID     `json:"sourceMessageId,omitempty"`
}

// MarkedReady fires when the resource reports it is ready for deployment.
type MarkedReady struct {
	At time.Time `json:"at"`
}

// Deployed fires when the resource is sent to its assigned position.
type Deployed struct {
	At time.Time `json:"at"`
}

// StoodDown fires when the resource temporarily stands down (can be redeployed).
type StoodDown struct {
	At time.Time `json:"at"`
}

// Relieved fires when the resource is permanently stood down.
// SuccessorID is set when a replacement resource takes over.
type Relieved struct {
	At          time.Time          `json:"at"`
	SuccessorID *shared.ResourceID `json:"successorId,omitempty"`
}

// SuccessionLinked fires on the successor resource when it replaces a relieved one.
type SuccessionLinked struct {
	PredecessorID shared.ResourceID `json:"predecessorId"`
}

// ReassignedToSchadenplatz fires when the resource is moved to a different damage site.
type ReassignedToSchadenplatz struct {
	SchadenplatzID shared.SchadenplatzID `json:"schadenplatzId"`
}

// DeploymentLocationUpdated fires when the precise position of the resource is updated.
type DeploymentLocationUpdated struct {
	Location *DeploymentLocation `json:"location,omitempty"`
}

// HauptaufgabeChanged fires when the primary task description is changed.
type HauptaufgabeChanged struct {
	Hauptaufgabe string `json:"hauptaufgabe"`
}

// ContactUpdated fires when the resource's contact details are changed.
type ContactUpdated struct {
	Contact Contact `json:"contact"`
}

// PersonnelCountUpdated fires when the reported headcount is corrected.
type PersonnelCountUpdated struct {
	Count int `json:"count"`
}

// EinsatzDauerRecorded fires when the operational period is recorded.
// Ende is nil when only the start is known.
type EinsatzDauerRecorded struct {
	Beginn time.Time  `json:"beginn"`
	Ende   *time.Time `json:"ende,omitempty"`
}

