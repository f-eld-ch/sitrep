package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	_ outbound.IncidentAccessChecker = (*IncidentAccessChecker)(nil)
	_ outbound.GlobalAccessChecker   = (*GlobalAccessChecker)(nil)
)

type (
	IncidentAccessChecker struct{ db *sql.DB }
	GlobalAccessChecker   struct{ db *sql.DB }
)

func NewIncidentAccessChecker(db *sql.DB) *IncidentAccessChecker {
	return &IncidentAccessChecker{db: db}
}

func NewGlobalAccessChecker(db *sql.DB) *GlobalAccessChecker {
	return &GlobalAccessChecker{db: db}
}

func (c *IncidentAccessChecker) Can(
	ctx context.Context,
	subject string,
	incidentID shared.IncidentID,
	action access.Action,
) (bool, error) {
	var mode access.IncidentMode

	err := c.db.QueryRowContext(ctx,
		`SELECT mode FROM readmodel_incident_access_mode WHERE incident_id = ?`,
		uuid.UUID(incidentID).String(),
	).Scan(&mode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// No access-mode row means the AccessHandler projection has not yet
			// applied the AccessInitialized event for this incident. SQLite is a
			// fresh-install backend with no pre-RBAC incidents, so this can only
			// happen during projection warm-up or after a ResetProjections call.
			// Fail-closed: deny access until the read model is ready.
			return false, nil
		}

		return false, fmt.Errorf("access mode: %w", err)
	}

	if mode == access.OpenOperational {
		var ownerCount int

		if err := c.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM readmodel_incident_access WHERE incident_id = ? AND role = 'owner'`,
			uuid.UUID(incidentID).String(),
		).Scan(&ownerCount); err != nil {
			return false, fmt.Errorf("access owner check: %w", err)
		}

		if ownerCount == 0 {
			return true, nil
		}

		if action != access.IncidentDelete {
			return true, nil
		}
	}

	return enforce(c.db, ctx, "user:"+subject, "incident:"+uuid.UUID(incidentID).String(), string(action))
}

func (c *GlobalAccessChecker) Can(ctx context.Context, subject string, action access.GlobalAction) (bool, error) {
	return enforce(c.db, ctx, "user:"+subject, "global", string(action))
}

// enforce checks whether the given subject is permitted to perform action in
// domain. It evaluates directly against readmodel_access_policy with a single
// EXISTS query, avoiding any per-call casbin instance allocation.
//
// The policy semantic is: allow if any row in readmodel_access_policy matches
// (subject OR 'all', domain, objectForAction(action), action). The 'all'
// wildcard subject is evaluated in SQL so no in-memory rewriting is needed.
func enforce(db *sql.DB, ctx context.Context, subject, domain, action string) (bool, error) {
	object := objectForAction(action)

	var allowed bool

	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM readmodel_access_policy
			WHERE (subject = ? OR subject = 'all')
			  AND domain  = ?
			  AND object  = ?
			  AND action  = ?
		)`,
		subject, domain, object, action,
	).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("access policies: %w", err)
	}

	return allowed, nil
}

func objectForAction(action string) string {
	for i := len(action) - 1; i >= 0; i-- {
		if action[i] == '.' {
			return action[:i]
		}
	}

	return action
}
