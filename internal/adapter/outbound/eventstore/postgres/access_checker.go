package postgres

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const policyModel = `[request_definition]
r = sub, dom, obj, act
[policy_definition]
p = sub, dom, obj, act, eft
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = r.sub == p.sub && r.dom == p.dom && r.obj == p.obj && r.act == p.act`

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
		return false, fmt.Errorf("access mode: %w", err)
	}

	if mode == access.OpenOperational && action != access.IncidentManageAccess {
		return true, nil
	}

	return c.enforce(ctx, "user:"+subject, "incident:"+uuid.UUID(incidentID).String(), string(action))
}

func (c *GlobalAccessChecker) Can(ctx context.Context, subject string, action access.GlobalAction) (bool, error) {
	return c.enforce(ctx, "user:"+subject, "global", string(action))
}

func (c *IncidentAccessChecker) enforce(ctx context.Context, subject, domain, action string) (bool, error) {
	return enforce(c.pool, ctx, subject, domain, action)
}

func (c *GlobalAccessChecker) enforce(ctx context.Context, subject, domain, action string) (bool, error) {
	return enforce(c.pool, ctx, subject, domain, action)
}

func enforce(pool *pgxpool.Pool, ctx context.Context, subject, domain, action string) (bool, error) {
	m, err := model.NewModelFromString(policyModel)
	if err != nil {
		return false, fmt.Errorf("access policy model: %w", err)
	}

	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return false, fmt.Errorf("access enforcer: %w", err)
	}

	rows, err := pool.Query(
		ctx,
		`SELECT subject, domain, object, action FROM readmodel.access_policy WHERE subject = $1 AND domain = $2`,
		subject,
		domain,
	)
	if err != nil {
		return false, fmt.Errorf("access policies: %w", err)
	}
	defer rows.Close()

	policyCount := 0

	for rows.Next() {
		var policySubject, policyDomain, object, policyAction string
		if err := rows.Scan(&policySubject, &policyDomain, &object, &policyAction); err != nil {
			return false, err
		}

		if _, err := e.AddPolicy(policySubject, policyDomain, object, policyAction, "allow"); err != nil {
			return false, fmt.Errorf("add access policy: %w", err)
		}

		policyCount++
	}

	if err := rows.Err(); err != nil {
		return false, err
	}

	allowed, err := e.Enforce(subject, domain, objectForAction(action), action)
	slog.DebugContext(ctx, "evaluated access policy",
		slog.String("subject", subject),
		slog.String("domain", domain),
		slog.String("action", action),
		slog.Int("policies", policyCount),
		slog.Bool("allowed", allowed))

	return allowed, err
}

func objectForAction(action string) string {
	for i := len(action) - 1; i >= 0; i-- {
		if action[i] == '.' {
			return action[:i]
		}
	}

	return action
}
