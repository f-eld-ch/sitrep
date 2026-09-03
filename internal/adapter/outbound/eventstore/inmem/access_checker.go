package inmem

import (
	"context"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
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

type (
	IncidentAccessChecker struct{ handler *projection.AccessHandler }
	GlobalAccessChecker   struct{ handler *projection.AccessHandler }
)

func NewIncidentAccessChecker(handler *projection.AccessHandler) *IncidentAccessChecker {
	return &IncidentAccessChecker{handler: handler}
}

func NewGlobalAccessChecker(handler *projection.AccessHandler) *GlobalAccessChecker {
	return &GlobalAccessChecker{handler: handler}
}

func (c *IncidentAccessChecker) Can(
	_ context.Context,
	subject string,
	incidentID shared.IncidentID,
	action access.Action,
) (bool, error) {
	if c.handler.Mode(uuid.UUID(incidentID)) == access.OpenOperational && action != access.IncidentManageAccess {
		return true, nil
	}

	return enforce(c.handler.Policies(), "user:"+subject, "incident:"+uuid.UUID(incidentID).String(), string(action))
}

func (c *GlobalAccessChecker) Can(_ context.Context, subject string, action access.GlobalAction) (bool, error) {
	return enforce(c.handler.Policies(), "user:"+subject, "global", string(action))
}

func enforce(rows []projection.AccessPolicyRow, subject, domain, action string) (bool, error) {
	m, err := model.NewModelFromString(policyModel)
	if err != nil {
		return false, err
	}

	enforcer, err := casbin.NewEnforcer(m)
	if err != nil {
		return false, err
	}

	for _, row := range rows {
		if _, err := enforcer.AddPolicy(row.Subject, row.Domain, row.Object, row.Action, "allow"); err != nil {
			return false, err
		}
	}

	return enforcer.Enforce(subject, domain, objectForAction(action), action)
}

func objectForAction(action string) string {
	for i := len(action) - 1; i >= 0; i-- {
		if action[i] == '.' {
			return action[:i]
		}
	}

	return action
}

var (
	_ outbound.IncidentAccessChecker = (*IncidentAccessChecker)(nil)
	_ outbound.GlobalAccessChecker   = (*GlobalAccessChecker)(nil)
)
