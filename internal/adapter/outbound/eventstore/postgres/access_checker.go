package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	_ outbound.IncidentAccessChecker = (*IncidentAccessChecker)(nil)
	_ outbound.GlobalAccessChecker   = (*GlobalAccessChecker)(nil)
)

type (
	IncidentAccessChecker struct{ pool *pgxpool.Pool }
	GlobalAccessChecker   struct{ pool *pgxpool.Pool }
)

func NewIncidentAccessChecker(pool *pgxpool.Pool) *IncidentAccessChecker {
	return &IncidentAccessChecker{pool: pool}
}

func NewGlobalAccessChecker(pool *pgxpool.Pool) *GlobalAccessChecker {
	return &GlobalAccessChecker{pool: pool}
}

func (c *IncidentAccessChecker) Can(
	ctx context.Context,
	subject string,
	incidentID shared.IncidentID,
	action access.Action,
) (bool, error) {
	var mode access.IncidentMode
	if err := c.pool.QueryRow(ctx, `SELECT mode FROM readmodel.incident_access_mode WHERE incident_id = $1`, uuid.UUID(incidentID)).
		Scan(&mode); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No access-mode row means the AccessHandler projection has not yet
			// applied AccessInitialized for this incident (projection lag).
			// Fail-closed: deny access until the read model is ready.
			return false, nil
		}

		return false, fmt.Errorf("access mode: %w", err)
	}

	if mode == access.OpenOperational {
		// Ownerless open incidents are fully claimable.
		var ownerCount int
		if err := c.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM readmodel.incident_access WHERE incident_id = $1 AND role = 'owner'`,
			uuid.UUID(incidentID)).Scan(&ownerCount); err != nil {
			return false, fmt.Errorf("access owner check: %w", err)
		}

		if ownerCount == 0 {
			return true, nil
		}

		// Once an owner is set: delete is policy-gated (owner only); everything else is open.
		if action != access.IncidentDelete {
			return true, nil
		}
	}

	return enforce(c.pool, ctx, "user:"+subject, "incident:"+uuid.UUID(incidentID).String(), string(action))
}

func (c *GlobalAccessChecker) Can(ctx context.Context, subject string, action access.GlobalAction) (bool, error) {
	return enforce(c.pool, ctx, "user:"+subject, "global", string(action))
}

// enforce checks whether the given subject is permitted to perform action in
// domain using a single EXISTS query against readmodel.access_policy.
// The 'all' wildcard subject is matched in SQL; no in-memory policy engine is needed.
func enforce(pool *pgxpool.Pool, ctx context.Context, subject, domain, action string) (bool, error) {
	object := objectForAction(action)

	var allowed bool

	err := pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM readmodel.access_policy
			WHERE (subject = $1 OR subject = 'all')
			  AND domain = $2
			  AND object = $3
			  AND action = $4
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
