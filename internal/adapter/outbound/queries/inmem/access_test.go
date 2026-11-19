package inmem_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	queries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var queryAt = time.Unix(50, 0)

func feed(t *testing.T, h *projection.AccessHandler, events []eventsourcing.Event) {
	t.Helper()

	for _, e := range events {
		require.NoError(t, h.Apply(context.Background(), e))
	}
}

func TestAccessQueriesIncidentAccess(t *testing.T) {
	ctx := context.Background()
	h := projection.NewAccessHandler()
	q := queries.NewAccessQueries(h)
	incidentID := shared.IncidentID(uuid.New())
	owner := "owner"

	// Unknown incident: no grants, and no access state to report a mode for.
	grants, err := q.ListIncidentAccess(ctx, incidentID)
	require.NoError(t, err)
	assert.Empty(t, grants)

	_, err = q.GetIncidentAccessMode(ctx, incidentID)
	require.ErrorIs(t, err, shared.ErrNotFound)

	a := access.NewIncidentAccess(incidentID)
	require.NoError(t, a.Initialize(&owner, access.OpenOperational, owner, queryAt))
	require.NoError(
		t,
		a.GrantRole(access.Principal{Kind: access.UserPrincipal, ID: "viewer"}, access.Viewer, owner, queryAt),
	)
	require.NoError(t, a.ChangeAccessMode(access.Restricted, owner, queryAt))
	feed(t, h, a.Root().PendingEvents())

	// A different incident must not leak into the listing.
	other := access.NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, other.Initialize(&owner, access.Restricted, owner, queryAt))
	feed(t, h, other.Root().PendingEvents())

	grants, err = q.ListIncidentAccess(ctx, incidentID)
	require.NoError(t, err)
	assert.ElementsMatch(t, []outbound.IncidentAccessGrantRM{
		{
			IncidentID: incidentID, PrincipalKind: access.UserPrincipal, PrincipalID: "owner",
			PrincipalName: "owner", Role: access.Owner,
		},
		{
			IncidentID: incidentID, PrincipalKind: access.UserPrincipal, PrincipalID: "viewer",
			PrincipalName: "viewer", Role: access.Viewer,
		},
	}, grants)

	mode, err := q.GetIncidentAccessMode(ctx, incidentID)
	require.NoError(t, err)
	assert.Equal(t, access.Restricted, mode)
}

func TestAccessQueriesGroups(t *testing.T) {
	ctx := context.Background()
	h := projection.NewAccessHandler()
	q := queries.NewAccessQueries(h)

	groups, err := q.ListAccessGroups(ctx)
	require.NoError(t, err)
	assert.Empty(t, groups)

	none, err := q.ListGroupMembers(ctx, uuid.New())
	require.NoError(t, err)
	assert.Empty(t, none, "an unknown group has no members")

	idB, idA1, idA2 := uuid.New(), uuid.New(), uuid.New()
	mk := func(id uuid.UUID, name, desc string) *access.AccessGroup {
		g := access.NewAccessGroup(id)
		require.NoError(t, g.Create(name, desc, "admin", queryAt))

		return g
	}

	b := mk(idB, "Bravo", "b desc")
	require.NoError(t, b.AddMember("m1", "admin", queryAt))
	require.NoError(t, b.AddMember("m2", "admin", queryAt))
	require.NoError(t, b.RemoveMember("m2", "admin", queryAt))

	a1 := mk(idA1, "Alpha", "")
	a2 := mk(idA2, "Alpha", "")
	require.NoError(t, a2.Archive("admin", queryAt.Add(time.Minute)))

	for _, g := range []*access.AccessGroup{b, a1, a2} {
		feed(t, h, g.Root().PendingEvents())
	}

	groups, err = q.ListAccessGroups(ctx)
	require.NoError(t, err)
	require.Len(t, groups, 3)

	// Sorted by name, then id.
	assert.Equal(t, "Alpha", groups[0].Name)
	assert.Equal(t, "Alpha", groups[1].Name)
	assert.Less(t, groups[0].ID.String(), groups[1].ID.String())
	assert.Equal(t, "Bravo", groups[2].Name)
	assert.Equal(t, "b desc", groups[2].Description)
	assert.Equal(t, idB, groups[2].ID)

	for _, g := range groups {
		if g.ID == idA2 {
			require.NotNil(t, g.ArchivedAt)
			assert.True(t, g.ArchivedAt.Equal(queryAt.Add(time.Minute)))
		} else {
			assert.Nil(t, g.ArchivedAt)
		}
	}

	members, err := q.ListGroupMembers(ctx, idB)
	require.NoError(t, err)
	assert.Equal(t, []outbound.GroupMemberRM{{GroupID: idB, Subject: "m1"}}, members)

	members, err = q.ListGroupMembers(ctx, idA1)
	require.NoError(t, err)
	assert.Empty(t, members)
}

func TestAccessQueriesGlobalRoles(t *testing.T) {
	ctx := context.Background()
	h := projection.NewAccessHandler()
	q := queries.NewAccessQueries(h)

	roles, err := q.ListGlobalRoles(ctx)
	require.NoError(t, err)
	assert.Empty(t, roles)

	g := access.NewGlobalAccess()
	require.NoError(t, g.Initialize("boot", queryAt))
	require.NoError(t, g.GrantRole("alice", access.SystemAdmin, "boot", queryAt))
	require.NoError(t, g.GrantRole("alice", access.GroupAdmin, "boot", queryAt))
	require.NoError(t, g.GrantRole("bob", access.GroupAdmin, "boot", queryAt))
	feed(t, h, g.Root().PendingEvents())

	roles, err = q.ListGlobalRoles(ctx)
	require.NoError(t, err)
	assert.ElementsMatch(t, []outbound.GlobalRoleGrantRM{
		{Subject: "alice", Role: access.SystemAdmin},
		{Subject: "alice", Role: access.GroupAdmin},
		{Subject: "bob", Role: access.GroupAdmin},
	}, roles)

	mine, err := q.MyGlobalRoles(ctx, "alice")
	require.NoError(t, err)
	assert.ElementsMatch(t, []outbound.GlobalRoleGrantRM{
		{Subject: "alice", Role: access.SystemAdmin},
		{Subject: "alice", Role: access.GroupAdmin},
	}, mine)

	none, err := q.MyGlobalRoles(ctx, "stranger")
	require.NoError(t, err)
	assert.Empty(t, none)
}

func TestAccessQueriesDefaultTemplateAndUsers(t *testing.T) {
	ctx := context.Background()
	h := projection.NewAccessHandler()
	q := queries.NewAccessQueries(h)

	users, err := q.ListUsers(ctx)
	require.NoError(t, err)
	assert.NotNil(t, users)
	assert.Empty(t, users)

	// Before the template exists the safe default is restricted without grants.
	tpl, err := q.GetDefaultAccessTemplate(ctx)
	require.NoError(t, err)
	assert.Equal(t, access.Restricted, tpl.Mode)
	assert.Empty(t, tpl.Grants)

	template := access.NewIncidentAccess(shared.IncidentID(access.DefaultAccessTemplateID))
	require.NoError(t, template.InitializeTemplate(access.OpenOperational, "admin", queryAt))
	require.NoError(t, template.GrantRole(
		access.Principal{Kind: access.UserPrincipal, ID: "u"}, access.Editor, "admin", queryAt))
	feed(t, h, template.Root().PendingEvents())

	tpl, err = q.GetDefaultAccessTemplate(ctx)
	require.NoError(t, err)
	assert.Equal(t, access.OpenOperational, tpl.Mode)
	assert.Equal(t, []access.Grant{
		{Principal: access.Principal{Kind: access.UserPrincipal, ID: "u"}, Role: access.Editor},
	}, tpl.Grants)
}
