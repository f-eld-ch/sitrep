package outbound

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

type IncidentAccessChecker interface {
	Can(ctx context.Context, subject string, incidentID shared.IncidentID, action access.Action) (bool, error)
}

type GlobalAccessChecker interface {
	Can(ctx context.Context, subject string, action access.GlobalAction) (bool, error)
}

// AccessGuard serializes cross-stream ownership and group-grant invariants.
type AccessGuard interface {
	LockForUpdate(ctx context.Context) (release func(), err error)
}
