package inmem

import (
	"context"
	"slices"
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

// ListIncidentAccess returns the active grants of an incident ordered like the SQL adapters do:
// by principal kind, then display name (group grants carry the group's name), then role.
func (q *AccessQueries) ListIncidentAccess(
	_ context.Context,
	incidentID shared.IncidentID,
) ([]outbound.IncidentAccessGrantRM, error) {
	rows := q.handler.IncidentGrants(uuid.UUID(incidentID))
	groups := q.handler.Groups()

	out := make([]outbound.IncidentAccessGrantRM, 0, len(rows))

	for _, row := range rows {
		name := row.PrincipalID

		if row.PrincipalKind == access.GroupPrincipal {
			if id, err := uuid.Parse(row.PrincipalID); err == nil {
				if group, ok := groups[id]; ok {
					name = group.Name
				}
			}
		}

		out = append(out, outbound.IncidentAccessGrantRM{
			IncidentID:    incidentID,
			PrincipalKind: row.PrincipalKind,
			PrincipalID:   row.PrincipalID,
			PrincipalName: name,
			Role:          row.Role,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].PrincipalKind != out[j].PrincipalKind {
			return out[i].PrincipalKind < out[j].PrincipalKind
		}

		if out[i].PrincipalName != out[j].PrincipalName {
			return out[i].PrincipalName < out[j].PrincipalName
		}

		return out[i].Role < out[j].Role
	})

	return out, nil
}

// GetIncidentAccessMode reports shared.ErrNotFound for an incident without access state.
func (q *AccessQueries) GetIncidentAccessMode(
	_ context.Context,
	incidentID shared.IncidentID,
) (access.IncidentMode, error) {
	mode, ok := q.handler.ModeOf(uuid.UUID(incidentID))
	if !ok {
		return "", shared.ErrNotFound
	}

	return mode, nil
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

	// Sort by name then id to match the Postgres adapter's ORDER BY name, id.
	// Previously sorted by id-only; aligning now that ids are v7 and therefore
	// creation-ordered, which would have made the order meaningful but wrong.
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}

		return out[i].ID.String() < out[j].ID.String()
	})

	return out, nil
}

// ListGroupMembers returns the members of a group ordered by subject; an unknown group has none,
// as in the SQL adapters.
func (q *AccessQueries) ListGroupMembers(_ context.Context, groupID uuid.UUID) ([]outbound.GroupMemberRM, error) {
	group, ok := q.handler.Groups()[groupID]
	if !ok {
		return []outbound.GroupMemberRM{}, nil
	}

	subjects := slices.Clone(group.Members)
	slices.Sort(subjects)

	out := make([]outbound.GroupMemberRM, 0, len(subjects))
	for _, subject := range subjects {
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

	// Like the SQL adapters: by role, then by subject.
	sort.Slice(out, func(i, j int) bool {
		if out[i].Role != out[j].Role {
			return out[i].Role < out[j].Role
		}

		return out[i].Subject < out[j].Subject
	})

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

func (q *AccessQueries) GetDefaultAccessTemplate(_ context.Context) (outbound.DefaultAccessTemplateRM, error) {
	mode, ok := q.handler.DefaultIncidentMode()
	if !ok {
		return outbound.DefaultAccessTemplateRM{Mode: access.Restricted}, nil
	}

	return outbound.DefaultAccessTemplateRM{
		Mode:   mode,
		Grants: q.handler.DefaultGrants(),
	}, nil
}

var _ outbound.AccessQueries = (*AccessQueries)(nil)
