package inmem

import (
	"context"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
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
	if c.handler.Mode(uuid.UUID(incidentID)) == access.OpenOperational && action != access.IncidentManageAccess {
		return true, nil
	}
	for _, row := range c.handler.Policies() {
		if row.Subject == "user:"+subject && row.Domain == "incident:"+uuid.UUID(incidentID).String() &&
			row.Action == string(action) {
			return true, nil
		}
	}
	return false, nil
}

func (c *GlobalAccessChecker) Can(_ context.Context, subject string, action access.GlobalAction) (bool, error) {
	for _, row := range c.handler.Policies() {
		if row.Subject == "user:"+subject && row.Domain == "global" && row.Action == string(action) {
			return true, nil
		}
	}
	return false, nil
}

var (
	_ outbound.IncidentAccessChecker = (*IncidentAccessChecker)(nil)
	_ outbound.GlobalAccessChecker   = (*GlobalAccessChecker)(nil)
)
