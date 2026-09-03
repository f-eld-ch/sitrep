package outbound

import (
	"context"
	"encoding/json"
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
	RemovedAt   *time.Time
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
	ID             uuid.UUID
	Number         int
	IncidentID     uuid.UUID
	Content        string
	Sender         string
	SenderDetail   string
	Receiver       string
	ReceiverDetail string
	Medium         string
	Time           time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Triage         string
	Priority       string
	DivisionIDs    []uuid.UUID
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
	GeoJSON            json.RawMessage
	Revision           int
}

// ──────────────────────────────────────────────────────────────────────────────
// Queries port
// ──────────────────────────────────────────────────────────────────────────────

// Queries is the driven port for read-model access. Implementations query
// projection tables (rm_*) and never touch the event store or aggregates.
type Queries interface {
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

	// ListLayers returns all non-removed layers for an incident.
	// Each LayerRM carries the full GeoJSON FeatureCollection.
	ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*LayerRM, error)

	// ListVisibleLayers returns layers visible from an incident: its own layers
	// plus layers owned by direct child incidents.
	ListVisibleLayers(ctx context.Context, incidentID uuid.UUID) ([]*LayerRM, error)

	// ListChildIncidents returns non-deleted incidents directly linked to parentID.
	ListChildIncidents(ctx context.Context, parentID uuid.UUID) ([]*IncidentRM, error)
}
