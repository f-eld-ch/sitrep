package inmem

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
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
				PrincipalName: row.PrincipalID,
				Role:          row.Role,
			},
		)
	}

	return out, nil
}

func (q *AccessQueries) GetIncidentAccessMode(
	_ context.Context,
	incidentID shared.IncidentID,
) (access.IncidentMode, error) {
	return q.handler.Mode(uuid.UUID(incidentID)), nil
}

func (q *AccessQueries) ListAccessGroups(_ context.Context) ([]outbound.AccessGroupRM, error) {
	groups := q.handler.Groups()

	out := make([]outbound.AccessGroupRM, 0, len(groups))
	for id, group := range groups {
		var archivedAt *time.Time
		if group.ArchivedAt != nil {
			archivedAt = group.ArchivedAt
		}

		out = append(out, outbound.AccessGroupRM{
			ID:          id,
			Name:        group.Name,
			Description: group.Description,
			ArchivedAt:  archivedAt,
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

func (q *AccessQueries) ListGlobalRoles(_ context.Context) ([]outbound.GlobalRoleGrantRM, error) {
	roles := q.handler.GlobalRoles()

	var out []outbound.GlobalRoleGrantRM

	for subject, list := range roles {
		for _, role := range list {
			out = append(out, outbound.GlobalRoleGrantRM{Subject: subject, Role: role})
		}
	}

	return out, nil
}

func (q *AccessQueries) MyGlobalRoles(_ context.Context, subject string) ([]outbound.GlobalRoleGrantRM, error) {
	roles := q.handler.GlobalRoles()

	var out []outbound.GlobalRoleGrantRM

	for s, list := range roles {
		if s != subject {
			continue
		}

		for _, role := range list {
			out = append(out, outbound.GlobalRoleGrantRM{Subject: s, Role: role})
		}
	}

	return out, nil
}

var _ outbound.AccessQueries = (*AccessQueries)(nil)
