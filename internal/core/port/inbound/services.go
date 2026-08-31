// Package inbound defines the driving (inbound) ports — use-case interfaces
// the application core exposes to adapters. Resolvers depend only on these;
// they never import concrete service types or outbound adapters.
package inbound

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// CreateIncidentResult is returned from CreateIncident so resolvers can build
// the mutation response from aggregate state without a projection read.
type CreateIncidentResult struct {
	IncidentID shared.IncidentID
	LayerIDs   []shared.LayerID
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
	) error

	CloseIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error
	ReopenIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error
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
		actor identity.Actor,
	) (shared.MessageID, error)

	CorrectMessage(
		ctx context.Context,
		id shared.MessageID,
		content, sender, senderDetail, receiver, receiverDetail *string,
		medium *shared.Medium,
		actor identity.Actor,
	) error

	TriageMessage(
		ctx context.Context,
		id shared.MessageID,
		triage shared.TriageStatus,
		priority shared.PriorityStatus,
		divisionIDs []shared.DivisionID,
		actor identity.Actor,
	) error

	DeleteMessage(ctx context.Context, id shared.MessageID, actor identity.Actor) error
}

// LayerService is the driving port for layer commands.
type LayerService interface {
	CreateLayer(ctx context.Context, incidentID shared.IncidentID, name string, actor identity.Actor) (shared.LayerID, error)
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

	MoveFeature(ctx context.Context, id shared.FeatureID, geometry map[string]any, actor identity.Actor) error
	RestyleFeature(ctx context.Context, id shared.FeatureID, properties map[string]any, actor identity.Actor) error
	RemoveFeature(ctx context.Context, id shared.FeatureID, actor identity.Actor) error
}
