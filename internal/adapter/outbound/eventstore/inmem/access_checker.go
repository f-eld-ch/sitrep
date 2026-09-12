package inmem

import (
	"context"
	"slices"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	_ outbound.IncidentAccessChecker = (*IncidentAccessChecker)(nil)
	_ outbound.GlobalAccessChecker   = (*GlobalAccessChecker)(nil)
)

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
	mode := c.handler.Mode(uuid.UUID(incidentID))

	if mode == access.OpenOperational {
		// Ownerless open incidents are fully claimable.
		hasOwner := false

		for _, g := range c.handler.IncidentGrants(uuid.UUID(incidentID)) {
			if g.Role == access.Owner {
				hasOwner = true
				break
			}
		}

		if !hasOwner {
			return true, nil
		}

		// Once an owner is set: delete is policy-gated (owner only); everything else is open.
		if action != access.IncidentDelete {
			return true, nil
		}
	}

	return enforce(c.handler.Policies(), "user:"+subject, "incident:"+uuid.UUID(incidentID).String(), string(action))
}

func (c *GlobalAccessChecker) Can(_ context.Context, subject string, action access.GlobalAction) (bool, error) {
	return enforce(c.handler.Policies(), "user:"+subject, "global", string(action))
}

// enforce reports whether any policy row permits subject to perform action in
// domain. The 'all' wildcard subject matches any caller.
func enforce(rows []projection.AccessPolicyRow, subject, domain, action string) (bool, error) {
	object := objectForAction(action)

	allowed := slices.ContainsFunc(rows, func(r projection.AccessPolicyRow) bool {
		return (r.Subject == subject || r.Subject == "all") &&
			r.Domain == domain &&
			r.Object == object &&
			r.Action == action
	})

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
