// Package inbound defines the driving (inbound) ports — use-case interfaces
// the application core exposes to adapters. Resolvers depend only on these;
// they never import concrete service types or outbound adapters.
package inbound

import (
	"context"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// CreateIncidentResult is returned from CreateIncident so resolvers can build
// the mutation response from aggregate state without a projection read.
type CreateIncidentResult struct {
	IncidentID shared.IncidentID
	LayerIDs   []shared.LayerID
	Name       string
	Location   *incident.LocationData
	Divisions  []incident.DivisionData
	CreatedAt  time.Time
}

// IncidentState is returned from incident mutation services so resolvers can
// build responses from aggregate state without a projection read.
type IncidentState struct {
	ID        shared.IncidentID
	Name      string
	Location  *incident.LocationData
	Divisions []incident.DivisionData
	CreatedAt time.Time
	UpdatedAt time.Time
	IsClosed  bool
	ClosedAt  *time.Time
}

// MessageState is returned from message mutation services so resolvers can
// build responses from aggregate state without a projection read.
type MessageState struct {
	ID             shared.MessageID
	IncidentID     shared.IncidentID
	Number         int
	Content        string
	Sender         string
	SenderDetail   string
	Receiver       string
	ReceiverDetail string
	Medium         shared.Medium
	Time           time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Triage         shared.TriageStatus
	Priority       shared.PriorityStatus
	DivisionIDs    []shared.DivisionID
}

// FeatureState is returned from ModifyFeature so the resolver can build the
// mutation response with the full post-update geometry and properties without
// a projection read (which would race the asynchronous projector).
type FeatureState struct {
	ID         shared.FeatureID
	Geometry   map[string]any
	Properties map[string]any
}

// IncidentService is the driving port for incident lifecycle commands.
type IncidentService interface {
	CreateIncident(
		ctx context.Context,
		name string,
		location *incident.LocationData,
		divisions []incident.DivisionData,
		layerNames []string,
		actor identity.Actor,
	) (CreateIncidentResult, error)

	UpdateIncident(
		ctx context.Context,
		id shared.IncidentID,
		name *string,
		location *incident.LocationData,
		divisions []incident.DivisionData,
		actor identity.Actor,
	) (IncidentState, error)

	CloseIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) (IncidentState, error)
	ReopenIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) (IncidentState, error)
	DeleteIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error
	LoadIncident(ctx context.Context, id shared.IncidentID) (*incident.Incident, error)
}

// MessageService is the driving port for message commands.
type MessageService interface {
	RecordMessage(
		ctx context.Context,
		incidentID shared.IncidentID,
		content, sender, senderDetail, receiver, receiverDetail string,
		medium shared.Medium,
		msgTime *time.Time,
		actor identity.Actor,
	) (MessageState, error)

	CorrectMessage(
		ctx context.Context,
		id shared.MessageID,
		content, sender, senderDetail, receiver, receiverDetail *string,
		medium *shared.Medium,
		msgTime *time.Time,
		actor identity.Actor,
	) (MessageState, error)

	TriageMessage(
		ctx context.Context,
		id shared.MessageID,
		triage shared.TriageStatus,
		priority shared.PriorityStatus,
		divisionIDs []shared.DivisionID,
		actor identity.Actor,
	) (MessageState, error)

	DeleteMessage(ctx context.Context, id shared.MessageID, actor identity.Actor) error
}

// LayerService is the driving port for layer commands.
type LayerService interface {
	CreateLayer(
		ctx context.Context,
		incidentID shared.IncidentID,
		name string,
		actor identity.Actor,
	) (shared.LayerID, error)
	RenameLayer(ctx context.Context, id shared.LayerID, name string, actor identity.Actor) error
	RemoveLayer(ctx context.Context, id shared.LayerID, actor identity.Actor) error
}

// FeatureService is the driving port for feature (map object) commands.
type FeatureService interface {
	PlaceFeature(
		ctx context.Context,
		id shared.FeatureID,
		incidentID shared.IncidentID,
		layerID shared.LayerID,
		geometry, properties map[string]any,
		actor identity.Actor,
	) error

	// ModifyFeature updates geometry and/or properties in a single aggregate load,
	// avoiding the optimistic concurrency conflict that would occur from two parallel saves.
	// Returns the complete post-update state so the resolver can respond without a projection read.
	ModifyFeature(
		ctx context.Context,
		id shared.FeatureID,
		geometry, properties map[string]any,
		actor identity.Actor,
	) (FeatureState, error)
	RemoveFeature(ctx context.Context, id shared.FeatureID, actor identity.Actor) error
}
