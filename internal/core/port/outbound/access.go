package outbound

import (
	"context"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

type IncidentAccessChecker interface {
	Can(ctx context.Context, subject string, incidentID shared.IncidentID, action access.Action) (bool, error)
}

type GlobalAccessChecker interface {
	Can(ctx context.Context, subject string, action access.GlobalAction) (bool, error)
}

type IncidentAccessGrantRM struct {
	IncidentID    shared.IncidentID
	PrincipalKind access.PrincipalKind
	PrincipalID   string
	Role          access.Role
}

type AccessGroupRM struct {
	ID          uuid.UUID
	Name        string
	Description string
	Archived    bool
}

type GroupMemberRM struct {
	GroupID uuid.UUID
	Subject string
}

type AccessQueries interface {
	ListIncidentAccess(ctx context.Context, incidentID shared.IncidentID) ([]IncidentAccessGrantRM, error)
	ListAccessGroups(ctx context.Context) ([]AccessGroupRM, error)
	ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]GroupMemberRM, error)
}

// AccessGuard serializes cross-stream ownership and group-grant invariants.
type AccessGuard interface {
	LockForUpdate(ctx context.Context) (release func(), err error)
}
