package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/google/uuid"

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
			// Projection hasn't caught up yet (or pre-RBAC incident) — fail-open.
			return true, nil
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

func enforce(db *sql.DB, ctx context.Context, subject, domain, action string) (bool, error) {
	m, err := model.NewModelFromString(policyModel)
	if err != nil {
		return false, fmt.Errorf("access policy model: %w", err)
	}

	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return false, fmt.Errorf("access enforcer: %w", err)
	}

	rows, err := db.QueryContext(
		ctx,
		`SELECT subject, domain, object, action FROM readmodel_access_policy WHERE (subject = ? OR subject = 'all') AND domain = ?`,
		subject,
		domain,
	)
	if err != nil {
		return false, fmt.Errorf("access policies: %w", err)
	}

	defer func() { _ = rows.Close() }()

	policyCount := 0

	for rows.Next() {
		var policySubject, policyDomain, object, policyAction string

		if err := rows.Scan(&policySubject, &policyDomain, &object, &policyAction); err != nil {
			return false, err
		}

		// 'all' rows grant access to every user — rewrite to the actual subject so the matcher fires.
		if policySubject == "all" {
			policySubject = subject
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
