package inmem

import (
	"context"
	"sort"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

type AccessQueries struct{ handler *projection.AccessHandler }

func NewAccessQueries(handler *projection.AccessHandler) *AccessQueries {
	return &AccessQueries{handler: handler}
}

func (q *AccessQueries) ListIncidentAccess(
	_ context.Context,
	incidentID shared.IncidentID,
) ([]outbound.IncidentAccessGrantRM, error) {
	rows := q.handler.IncidentGrants(uuid.UUID(incidentID))

	out := make([]outbound.IncidentAccessGrantRM, 0, len(rows))
	for _, row := range rows {
		out = append(
			out,
			outbound.IncidentAccessGrantRM{
				IncidentID:    incidentID,
				PrincipalKind: row.PrincipalKind,
				PrincipalID:   row.PrincipalID,
				Role:          row.Role,
			},
		)
	}

	return out, nil
}

func (q *AccessQueries) ListAccessGroups(_ context.Context) ([]outbound.AccessGroupRM, error) {
	groups := q.handler.Groups()

	out := make([]outbound.AccessGroupRM, 0, len(groups))
	for id, group := range groups {
		out = append(out, outbound.AccessGroupRM{
			ID:          id,
			Name:        group.Name,
			Description: group.Description,
			Archived:    group.Archived,
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].ID.String() < out[j].ID.String() })

	return out, nil
}

func (q *AccessQueries) ListGroupMembers(_ context.Context, groupID uuid.UUID) ([]outbound.GroupMemberRM, error) {
	group, ok := q.handler.Groups()[groupID]
	if !ok {
		return nil, shared.ErrNotFound
	}

	out := make([]outbound.GroupMemberRM, 0, len(group.Members))
	for _, subject := range group.Members {
		out = append(out, outbound.GroupMemberRM{GroupID: groupID, Subject: subject})
	}

	return out, nil
}

func (q *AccessQueries) ListUsers(_ context.Context) ([]outbound.UserRM, error) {
	return []outbound.UserRM{}, nil
}

var _ outbound.AccessQueries = (*AccessQueries)(nil)
