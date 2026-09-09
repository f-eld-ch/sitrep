// Package inbound defines the driving (inbound) ports — use-case interfaces
// the application core exposes to adapters. Resolvers depend only on these;
// they never import concrete service types or outbound adapters.
package inbound

import (
	"context"
	"io"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

type IncidentAccessService interface {
	GrantIncidentRole(
		ctx context.Context,
		incidentID shared.IncidentID,
		principal access.Principal,
		role access.Role,
		actor identity.Actor,
	) error
	RevokeIncidentRole(
		ctx context.Context,
		incidentID shared.IncidentID,
		principal access.Principal,
		role access.Role,
		actor identity.Actor,
	) error
	ChangeIncidentAccessMode(
		ctx context.Context,
		incidentID shared.IncidentID,
		mode access.IncidentMode,
		actor identity.Actor,
	) error
}

type GroupAccessService interface {
	CreateAccessGroup(ctx context.Context, name, description string, actor identity.Actor) (uuid.UUID, error)
	RenameAccessGroup(ctx context.Context, groupID uuid.UUID, name string, actor identity.Actor) error
	UpdateAccessGroupDescription(ctx context.Context, groupID uuid.UUID, description string, actor identity.Actor) error
	ArchiveAccessGroup(ctx context.Context, groupID uuid.UUID, actor identity.Actor) error
	AddGroupMember(ctx context.Context, groupID uuid.UUID, subject string, actor identity.Actor) error
	RemoveGroupMember(ctx context.Context, groupID uuid.UUID, subject string, actor identity.Actor) error
	GrantGlobalRole(ctx context.Context, subject string, role access.GlobalRole, actor identity.Actor) error
	RevokeGlobalRole(ctx context.Context, subject string, role access.GlobalRole, actor identity.Actor) error
}

type AccessService interface {
	IncidentAccessService
	GroupAccessService
	BootstrapFirstSystemAdmin(ctx context.Context, subject string, actor identity.Actor) error
}

// CreateIncidentResult is returned from CreateIncident so resolvers can build
// the mutation response from aggregate state without a projection read.
type CreateIncidentResult struct {
	IncidentID shared.IncidentID
	ParentID   *shared.IncidentID
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
	ParentID  *shared.IncidentID
	Name      string
	Location  *incident.LocationData
	Divisions []incident.DivisionData
	CreatedAt time.Time
	UpdatedAt time.Time
	IsClosed  bool
	ClosedAt  *time.Time
}

// AttachmentState carries attachment metadata returned from service operations.
type AttachmentState struct {
	ID          shared.AttachmentID
	MessageID   shared.MessageID
	IncidentID  shared.IncidentID
	Filename    string
	ContentType string
	Size        int64
	Checksum    string
	StorageKey  string
	UploaderSub string
	CreatedAt   time.Time
	URL         string
}

// AttachFileInput groups parameters for AttachFile to avoid a long positional list.
type AttachFileInput struct {
	Filename    string
	ContentType string
	Size        int64
	Content     io.Reader
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
	Attachments    []AttachmentState
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

	CreateIncidentWithParent(
		ctx context.Context,
		name string,
		location *incident.LocationData,
		divisions []incident.DivisionData,
		layerNames []string,
		parentID *shared.IncidentID,
		actor identity.Actor,
	) (CreateIncidentResult, error)

	CreateIncidentWithParentMode(
		ctx context.Context,
		name string,
		location *incident.LocationData,
		divisions []incident.DivisionData,
		layerNames []string,
		parentID *shared.IncidentID,
		mode access.IncidentMode,
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
	LinkIncidentParent(
		ctx context.Context,
		childID, parentID shared.IncidentID,
		actor identity.Actor,
	) (IncidentState, error)
	UnlinkIncidentParent(ctx context.Context, childID shared.IncidentID, actor identity.Actor) (IncidentState, error)
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

	// AttachFile streams a file onto an existing message.
	// The blob is persisted before the event is committed; on commit failure
	// the implementation performs a best-effort compensating delete of the blob.
	AttachFile(ctx context.Context, messageID shared.MessageID, input AttachFileInput, actor identity.Actor) (AttachmentState, error)

	// RemoveAttachment deletes an attachment from a message.
	// The blob is removed after a successful commit.
	RemoveAttachment(ctx context.Context, messageID shared.MessageID, attachmentID shared.AttachmentID, actor identity.Actor) error

	// OpenAttachment resolves attachment metadata and opens the blob for reading.
	// Authorization (IncidentRead) is enforced before the store is touched.
	OpenAttachment(ctx context.Context, attachmentID shared.AttachmentID, actor identity.Actor) (AttachmentState, io.ReadSeekCloser, error)
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
