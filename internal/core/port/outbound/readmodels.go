package outbound

import (
	"context"
	"encoding/json/jsontext"
	"time"

	"github.com/google/uuid"
)

// ──────────────────────────────────────────────────────────────────────────────
// Read-model row types
//
// These are plain data bags returned by the Queries port. They are distinct from
// the domain aggregates: they carry denormalised state read from projection tables
// and are never passed back to the write side.
// ──────────────────────────────────────────────────────────────────────────────

type LocationRM struct {
	Name        string
	Coordinates *[2]float64
}

type DivisionRM struct {
	ID          uuid.UUID
	Name        string
	Description string
	// Kind is "MESSAGE_MAP" for the system-managed Nachrichtenkarte, empty otherwise.
	Kind      string
	RemovedAt *time.Time
}

type IncidentRM struct {
	ID        uuid.UUID
	ParentID  *uuid.UUID
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
	ClosedAt  *time.Time
	IsClosed  bool
	Location  *LocationRM
	Divisions []*DivisionRM
}

type MessageRM struct {
	ID                uuid.UUID
	Number            int
	IncidentID        uuid.UUID
	Content           string
	Sender            string
	SenderDetail      string
	Receiver          string
	ReceiverDetail    string
	Medium            string
	Time              time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
	Triage            string
	Priority          string
	DivisionIDs       []uuid.UUID
	LinkedResourceIDs []uuid.UUID
	// Acknowledgements are the divisions that have dealt with the message, oldest first.
	Acknowledgements []AcknowledgementRM
	AuthorSub        string
}

// AcknowledgementRM records that a division has dealt with a message.
type AcknowledgementRM struct {
	DivisionID uuid.UUID
	At         time.Time
	By         string
}

type AttachmentRM struct {
	ID          uuid.UUID
	MessageID   uuid.UUID
	IncidentID  uuid.UUID
	Filename    string
	ContentType string
	Size        int64
	Checksum    string
	StorageKey  string
	UploaderSub string
	CreatedAt   time.Time
}

// LayerRM carries a full GeoJSON FeatureCollection for one layer.
// The GeoJSON is stored opaquely so the resolver can forward it to the client
// without parsing; individual Feature objects are extracted on demand.
type LayerRM struct {
	ID                 uuid.UUID
	IncidentID         uuid.UUID
	SourceIncidentID   uuid.UUID
	SourceIncidentName string
	Name               string
	// Kind is "MESSAGE_MAP" for the system-managed Nachrichtenkarte layer, empty otherwise.
	Kind     string
	GeoJSON  jsontext.Value
	Revision int
}

// FeatureChangeRM is one change to a feature on the map timeline. EffectiveAt is when
// the change takes effect (the connected message's time); RecordedAt is when it was drawn.
type FeatureChangeRM struct {
	FeatureID   uuid.UUID
	Version     int
	IncidentID  uuid.UUID
	LayerID     uuid.UUID
	Change      string // placed | moved | restyled | removed
	EffectiveAt time.Time
	RecordedAt  time.Time
	MessageID   *uuid.UUID
	Geometry    jsontext.Value
	Properties  jsontext.Value
	Actor       string
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries port
// ──────────────────────────────────────────────────────────────────────────────

// IncidentQueries is the driven port for incident and message read-model access.
type IncidentQueries interface {
	// ListIncidents returns all non-deleted incidents, newest first.
	ListIncidents(ctx context.Context) ([]*IncidentRM, error)

	// GetIncident returns one incident by ID, including its active divisions.
	// Returns ErrNotFound when the incident does not exist or is deleted.
	GetIncident(ctx context.Context, id uuid.UUID) (*IncidentRM, error)

	// ListMessages returns all non-deleted messages for an incident, newest first.
	ListMessages(ctx context.Context, incidentID uuid.UUID) ([]*MessageRM, error)

	// GetMessage returns one message by ID.
	// Returns ErrNotFound when the message does not exist or is deleted.
	GetMessage(ctx context.Context, id uuid.UUID) (*MessageRM, error)

	// ListChildIncidents returns non-deleted incidents directly linked to parentID.
	ListChildIncidents(ctx context.Context, parentID uuid.UUID) ([]*IncidentRM, error)

	// ListAttachments returns all attachments for the given message, ordered by created_at ASC.
	ListAttachments(ctx context.Context, messageID uuid.UUID) ([]*AttachmentRM, error)

	// GetAttachment returns one attachment by ID.
	// Returns ErrNotFound when the attachment does not exist.
	GetAttachment(ctx context.Context, id uuid.UUID) (*AttachmentRM, error)
}

// LayerQueries is the driven port for layer, feature and map-timeline read-model access.
type LayerQueries interface {
	// ListLayers returns all non-removed layers for an incident.
	// Each LayerRM carries the full GeoJSON FeatureCollection.
	ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*LayerRM, error)

	// ListVisibleLayers returns layers visible from an incident: its own layers
	// plus layers owned by direct child incidents.
	ListVisibleLayers(ctx context.Context, incidentID uuid.UUID) ([]*LayerRM, error)

	// ListFeatureChanges returns the change history of all features on the layers visible
	// from an incident (see ListVisibleLayers), ordered by effective time and then by
	// the order they were drawn.
	ListFeatureChanges(ctx context.Context, incidentID uuid.UUID) ([]*FeatureChangeRM, error)

	// ListFeatureChangeTimes returns just the distinct effective times of those changes, oldest
	// first: what a timeline needs to put its ticks, without every change's geometry.
	ListFeatureChangeTimes(ctx context.Context, incidentID uuid.UUID) ([]time.Time, error)

	// ListFeatureMessages returns the messages connected to a feature's changes, ordered by
	// message time. Returns ErrNotFound when the feature is unknown or not readable.
	ListFeatureMessages(ctx context.Context, featureID uuid.UUID) ([]*MessageRM, error)

	// GetFeatureIncidentID returns the incident ID that owns the given feature.
	// Returns ErrNotFound when the feature does not exist or has been removed.
	GetFeatureIncidentID(ctx context.Context, featureID uuid.UUID) (uuid.UUID, error)
}

// SchadenplatzQueries is the driven port for Schadenplatz read-model access.
type SchadenplatzQueries interface {
	// GetSchadenplatz returns one Schadenplatz by ID.
	// Returns ErrNotFound when it does not exist.
	GetSchadenplatz(ctx context.Context, id uuid.UUID) (*SchadenplatzRM, error)

	// ListSchadenplaetze returns all non-merged Schadenplatz for an incident.
	ListSchadenplaetze(ctx context.Context, incidentID uuid.UUID) ([]*SchadenplatzRM, error)

	// ListAllSchadenplaetze returns every Schadenplatz of an incident, merged ones included.
	// A merged Schadenplatz still existed as such at earlier points in time.
	ListAllSchadenplaetze(ctx context.Context, incidentID uuid.UUID) ([]*SchadenplatzRM, error)

	// ListMessageCasualties returns the casualty deltas recorded for a message across all Schadenplätze.
	ListMessageCasualties(ctx context.Context, messageID uuid.UUID) ([]*MessageCasualtyRM, error)
}

// Queries is the driven port for read-model access. Implementations query
// projection tables and never touch the event store or aggregates.
// Sub-interfaces can be used independently where only a subset is needed.
type Queries interface {
	IncidentQueries
	LayerQueries
	SchadenplatzQueries
	ResourceQueries
}

// ──────────────────────────────────────────────────────────────────────────────
// Resource read-model types
// ──────────────────────────────────────────────────────────────────────────────

// DeploymentLocationRM holds a precise operational point within a Schadenplatz.
type DeploymentLocationRM struct {
	Lat   *float64
	Lng   *float64
	Label string
}

type DeploymentPeriodRM struct {
	StartedAt        time.Time
	EndedAt          *time.Time
	SchadenplatzID   uuid.UUID
	Formation        string
	Name             string
	HomeLocationName *string
	DeploymentLabel  *string
	Hauptaufgabe     string
	PersonnelCount   int
}

// ResourceRM is the read-model row for one Resource.
type ResourceRM struct {
	ID                 uuid.UUID
	IncidentID         uuid.UUID
	SchadenplatzID     uuid.UUID
	Formation          string
	Name               string
	Size               string
	PersonnelCount     int
	Hauptaufgabe       string
	ContactMedium      *string
	ContactDetail      *string
	HomeLocationName   *string
	HomeLocationLat    *float64
	HomeLocationLng    *float64
	DeploymentLocation *DeploymentLocationRM
	Status             string
	StatusAt           time.Time
	AlertedAt          time.Time
	ReadyAt            *time.Time
	DeployedAt         *time.Time
	StoodDownAt        *time.Time
	RelievedAt         *time.Time
	EinsatzBeginn      *time.Time
	EinsatzEnde        *time.Time
	PredecessorID      *uuid.UUID
	SuccessorID        *uuid.UUID
	SourceMessageID    *uuid.UUID
	CreatedAt          time.Time
	UpdatedAt          time.Time
	DeploymentHistory  []DeploymentPeriodRM
}

// ResourceQueries is the driven port for Resource read-model access.
type ResourceQueries interface {
	// GetResource returns one Resource by ID.
	// Returns ErrNotFound when it does not exist.
	GetResource(ctx context.Context, id uuid.UUID) (*ResourceRM, error)

	// ListResourcesForSchadenplatz returns all non-relieved resources for a Schadenplatz.
	ListResourcesForSchadenplatz(ctx context.Context, schadenplatzID uuid.UUID) ([]*ResourceRM, error)

	// ListResourcesForIncident returns all resources for an incident and its direct children (including relieved).
	ListResourcesForIncident(ctx context.Context, incidentID uuid.UUID) ([]*ResourceRM, error)
}

// ──────────────────────────────────────────────────────────────────────────────
// Schadenplatz read-model types
// ──────────────────────────────────────────────────────────────────────────────

// CasualtiesRM carries the accumulated casualty totals.
type CasualtiesRM struct {
	Vermisste       int
	Tote            int
	Verletzte       int
	Obdachlose      int
	Eingeschlossene int
}

// MessageCasualtyRM carries the per-message casualty deltas for one (message, Schadenplatz) pair.
type MessageCasualtyRM struct {
	MessageID       uuid.UUID
	SchadenplatzID  uuid.UUID
	Vermisste       int
	Tote            int
	Verletzte       int
	Obdachlose      int
	Eingeschlossene int
}

// SchadenplatzRM is the read-model row for one Schadenplatz.
type SchadenplatzRM struct {
	ID         uuid.UUID
	IncidentID uuid.UUID
	Name       string
	IsDefault  bool
	GeoJSON    []byte
	Casualties CasualtiesRM
	IsMerged   bool
	MergedInto *uuid.UUID
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
