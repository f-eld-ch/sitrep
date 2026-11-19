package conformance

import (
	"sort"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const accessHandler = "readmodel.access"

// RunAccess runs the access read-model sub-suite: the access projection, the
// access queries and the policy checkers that evaluate what was projected.
func RunAccess(t *testing.T, f Factory) {
	t.Helper()

	b := f(t)
	if b.AccessQueries == nil || b.ApplyEvent == nil {
		t.Skip("backend does not provide AccessQueries or ApplyEvent")
	}

	apply := func(t *testing.T, b *Backend, streamType string, id uuid.UUID, version int, eventType string, data any) {
		t.Helper()

		require.NoError(t, b.ApplyEvent(t.Context(), accessHandler, rawEvent(streamType, id, eventType, version, data)))
	}

	t.Run("IncidentAccessMode_NotFound", func(t *testing.T) {
		b := f(t)

		if !b.Caps.AccessListingContract {
			t.Skip("inmem returns no error for an unknown incident")
		}

		_, err := b.AccessQueries.GetIncidentAccessMode(t.Context(), shared.IncidentID(uuid.New()))
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("IncidentAccess_GrantsRevokeAndMode", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		inc := uuid.New()
		id := shared.IncidentID(inc)
		owner := "sub|owner"

		apply(t, b, "IncidentAccess", inc, 1, "AccessInitialized",
			access.AccessInitialized{Mode: access.Restricted, OwnerSub: &owner})

		mode, err := b.AccessQueries.GetIncidentAccessMode(ctx, id)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, mode)

		viewer := access.RoleGranted{
			Principal: access.Principal{Kind: access.UserPrincipal, ID: "sub|viewer"},
			Role:      access.Viewer,
		}
		apply(t, b, "IncidentAccess", inc, 2, "RoleGranted", viewer)
		// Replaying the same grant must not duplicate it.
		apply(t, b, "IncidentAccess", inc, 2, "RoleGranted", viewer)

		grants, err := b.AccessQueries.ListIncidentAccess(ctx, id)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			require.Len(t, grants, 2)
			assert.Equal(t, "sub|owner", grants[0].PrincipalID)
			assert.Equal(t, access.Owner, grants[0].Role)
			assert.Equal(t, access.UserPrincipal, grants[0].PrincipalKind)
			assert.Equal(t, id, grants[0].IncidentID)
			assert.Equal(t, "sub|viewer", grants[1].PrincipalID)
			assert.Equal(t, access.Viewer, grants[1].Role)
		}

		can, err := b.IncidentAccess.Can(ctx, "sub|viewer", id, access.IncidentRead)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			assert.True(t, can, "viewer may read a restricted incident")
		}

		can, err = b.IncidentAccess.Can(ctx, "sub|viewer", id, access.IncidentWrite)
		require.NoError(t, err)
		assert.False(t, can, "viewer may not write")

		can, err = b.IncidentAccess.Can(ctx, "sub|stranger", id, access.IncidentRead)
		require.NoError(t, err)
		assert.False(t, can, "an unlisted user has no access to a restricted incident")

		apply(t, b, "IncidentAccess", inc, 3, "RoleRevoked", access.RoleRevoked(viewer))

		grants, err = b.AccessQueries.ListIncidentAccess(ctx, id)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			require.Len(t, grants, 1)
			assert.Equal(t, "sub|owner", grants[0].PrincipalID)
		}

		can, err = b.IncidentAccess.Can(ctx, "sub|viewer", id, access.IncidentRead)
		require.NoError(t, err)
		assert.False(t, can, "a revoked grant no longer lets the user read")

		// Granting again after a revoke brings the role back.
		apply(t, b, "IncidentAccess", inc, 4, "RoleGranted", viewer)

		can, err = b.IncidentAccess.Can(ctx, "sub|viewer", id, access.IncidentRead)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			assert.True(t, can, "a re-granted role is active again")
		}

		apply(
			t,
			b,
			"IncidentAccess",
			inc,
			5,
			"AccessModeChanged",
			access.AccessModeChanged{Mode: access.OpenOperational},
		)

		mode, err = b.AccessQueries.GetIncidentAccessMode(ctx, id)
		require.NoError(t, err)
		assert.Equal(t, access.OpenOperational, mode)

		// In open mode everybody may read and write, but only owners delete.
		can, err = b.IncidentAccess.Can(ctx, "sub|stranger", id, access.IncidentWrite)
		require.NoError(t, err)
		assert.True(t, can, "open incidents are writable by anyone")

		can, err = b.IncidentAccess.Can(ctx, "sub|stranger", id, access.IncidentDelete)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			assert.False(t, can, "delete stays restricted to owners")
		}

		can, err = b.IncidentAccess.Can(ctx, "sub|owner", id, access.IncidentDelete)
		require.NoError(t, err)

		if b.Caps.AccessListingContract {
			assert.True(t, can, "the owner may delete")
		}
	})

	t.Run("IncidentAccess_UnknownIncidentDeniesAccess", func(t *testing.T) {
		b := f(t)

		can, err := b.IncidentAccess.Can(t.Context(), "sub|x", shared.IncidentID(uuid.New()), access.IncidentRead)
		require.NoError(t, err)
		assert.False(t, can)
	})

	t.Run("IncidentAccess_GroupAndAllGrants", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		inc := uuid.New()
		id := shared.IncidentID(inc)
		group := uuid.New()

		apply(t, b, "AccessGroup", group, 1, "GroupCreated", access.GroupCreated{Name: "Crew", Description: "d"})
		apply(t, b, "AccessGroup", group, 2, "GroupMemberAdded", access.GroupMemberAdded{Subject: "sub|member"})
		apply(t, b, "IncidentAccess", inc, 1, "AccessInitialized", access.AccessInitialized{Mode: access.Restricted})
		apply(t, b, "IncidentAccess", inc, 2, "RoleGranted", access.RoleGranted{
			Principal: access.Principal{Kind: access.GroupPrincipal, ID: group.String()},
			Role:      access.Editor,
		})

		grants, err := b.AccessQueries.ListIncidentAccess(ctx, id)
		require.NoError(t, err)
		require.Len(t, grants, 1)
		assert.Equal(t, access.GroupPrincipal, grants[0].PrincipalKind)

		if b.Caps.AccessListingContract {
			assert.Equal(t, "Crew", grants[0].PrincipalName, "group grants carry the group name")
		}

		can, err := b.IncidentAccess.Can(ctx, "sub|member", id, access.IncidentWrite)
		require.NoError(t, err)
		assert.True(t, can, "group editors may write")

		can, err = b.IncidentAccess.Can(ctx, "sub|outsider", id, access.IncidentRead)
		require.NoError(t, err)
		assert.False(t, can)

		// Removing the member takes the access away again.
		apply(t, b, "AccessGroup", group, 3, "GroupMemberRemoved", access.GroupMemberRemoved{Subject: "sub|member"})

		can, err = b.IncidentAccess.Can(ctx, "sub|member", id, access.IncidentWrite)
		require.NoError(t, err)
		assert.False(t, can, "a removed member loses the group's access")

		// An 'all' grant is visible to every user.
		apply(t, b, "IncidentAccess", inc, 3, "RoleGranted", access.RoleGranted{
			Principal: access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID},
			Role:      access.Viewer,
		})

		can, err = b.IncidentAccess.Can(ctx, "sub|outsider", id, access.IncidentRead)
		require.NoError(t, err)
		assert.True(t, can, "an 'all' viewer grant lets everybody read")

		can, err = b.IncidentAccess.Can(ctx, "sub|outsider", id, access.IncidentWrite)
		require.NoError(t, err)
		assert.False(t, can)
	})

	t.Run("Groups_Lifecycle", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		empty, err := b.AccessQueries.ListAccessGroups(ctx)
		require.NoError(t, err)
		assert.Empty(t, empty)

		alpha, bravo := uuid.New(), uuid.New()
		apply(t, b, "AccessGroup", bravo, 1, "GroupCreated", access.GroupCreated{Name: "Bravo", Description: "second"})
		apply(t, b, "AccessGroup", alpha, 1, "GroupCreated", access.GroupCreated{Name: "Alpha", Description: "first"})
		// Replaying the creation must not duplicate the group.
		apply(t, b, "AccessGroup", alpha, 1, "GroupCreated", access.GroupCreated{Name: "Alpha", Description: "first"})

		groups, err := b.AccessQueries.ListAccessGroups(ctx)
		require.NoError(t, err)
		require.Len(t, groups, 2)
		assert.Equal(t, "Alpha", groups[0].Name, "groups are ordered by name")
		assert.Equal(t, "Bravo", groups[1].Name)
		assert.Equal(t, alpha, groups[0].ID)
		assert.Equal(t, "first", groups[0].Description)
		assert.Nil(t, groups[0].ArchivedAt)

		apply(t, b, "AccessGroup", alpha, 2, "GroupRenamed", access.GroupRenamed{Name: "Zulu"})
		apply(
			t,
			b,
			"AccessGroup",
			alpha,
			3,
			"GroupDescriptionChanged",
			access.GroupDescriptionChanged{Description: "changed"},
		)
		apply(t, b, "AccessGroup", bravo, 2, "GroupArchived", access.GroupArchived{})

		groups, err = b.AccessQueries.ListAccessGroups(ctx)
		require.NoError(t, err)
		require.Len(t, groups, 2)
		assert.Equal(t, "Bravo", groups[0].Name)
		assert.NotNil(t, groups[0].ArchivedAt, "an archived group is flagged")
		assert.Equal(t, "Zulu", groups[1].Name)
		assert.Equal(t, "changed", groups[1].Description)
		assert.Nil(t, groups[1].ArchivedAt)
	})

	t.Run("Groups_Members", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		group := uuid.New()

		apply(t, b, "AccessGroup", group, 1, "GroupCreated", access.GroupCreated{Name: "G"})
		apply(t, b, "AccessGroup", group, 2, "GroupMemberAdded", access.GroupMemberAdded{Subject: "sub|b"})
		apply(t, b, "AccessGroup", group, 3, "GroupMemberAdded", access.GroupMemberAdded{Subject: "sub|a"})
		// A duplicate add is idempotent.
		apply(t, b, "AccessGroup", group, 3, "GroupMemberAdded", access.GroupMemberAdded{Subject: "sub|a"})

		members, err := b.AccessQueries.ListGroupMembers(ctx, group)
		require.NoError(t, err)
		require.Len(t, members, 2)
		sortMembers(b, members)
		assert.Equal(t, "sub|a", members[0].Subject, "members are ordered by subject")
		assert.Equal(t, "sub|b", members[1].Subject)
		assert.Equal(t, group, members[0].GroupID)

		apply(t, b, "AccessGroup", group, 4, "GroupMemberRemoved", access.GroupMemberRemoved{Subject: "sub|a"})

		members, err = b.AccessQueries.ListGroupMembers(ctx, group)
		require.NoError(t, err)
		require.Len(t, members, 1)
		assert.Equal(t, "sub|b", members[0].Subject)

		// Adding the removed member again reactivates it.
		apply(t, b, "AccessGroup", group, 5, "GroupMemberAdded", access.GroupMemberAdded{Subject: "sub|a"})

		members, err = b.AccessQueries.ListGroupMembers(ctx, group)
		require.NoError(t, err)
		assert.Len(t, members, 2)

		if b.Caps.AccessListingContract {
			none, err := b.AccessQueries.ListGroupMembers(ctx, uuid.New())
			require.NoError(t, err)
			assert.Empty(t, none)
		}
	})

	t.Run("GlobalRoles", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		if b.Users != nil {
			require.NoError(t, b.Users.Upsert(ctx, "sub|admin", "admin@example.com", "Admin"))
		}

		none, err := b.AccessQueries.ListGlobalRoles(ctx)
		require.NoError(t, err)
		assert.Empty(t, none)

		apply(t, b, "GlobalAccess", access.GlobalAccessID, 1, "GlobalRoleGranted",
			access.GlobalRoleGranted{Subject: "sub|admin", Role: access.SystemAdmin})
		apply(t, b, "GlobalAccess", access.GlobalAccessID, 2, "GlobalRoleGranted",
			access.GlobalRoleGranted{Subject: "sub|grp", Role: access.GroupAdmin})
		apply(t, b, "GlobalAccess", access.GlobalAccessID, 2, "GlobalRoleGranted",
			access.GlobalRoleGranted{Subject: "sub|grp", Role: access.GroupAdmin})

		roles, err := b.AccessQueries.ListGlobalRoles(ctx)
		require.NoError(t, err)
		require.Len(t, roles, 2)
		sort.Slice(roles, func(i, j int) bool { return roles[i].Role < roles[j].Role })
		assert.Equal(t, access.GroupAdmin, roles[0].Role)
		assert.Equal(t, "sub|grp", roles[0].Subject)
		assert.Equal(t, access.SystemAdmin, roles[1].Role)
		assert.Equal(t, "sub|admin", roles[1].Subject)

		if b.Users != nil {
			assert.Equal(t, "Admin", roles[1].Name)
			assert.Equal(t, "admin@example.com", roles[1].Email)
		}

		mine, err := b.AccessQueries.MyGlobalRoles(ctx, "sub|admin")
		require.NoError(t, err)
		require.Len(t, mine, 1)
		assert.Equal(t, access.SystemAdmin, mine[0].Role)

		can, err := b.GlobalAccess.Can(ctx, "sub|admin", access.SystemAdminManage)
		require.NoError(t, err)
		assert.True(t, can)

		can, err = b.GlobalAccess.Can(ctx, "sub|grp", access.GroupManage)
		require.NoError(t, err)
		assert.True(t, can)

		can, err = b.GlobalAccess.Can(ctx, "sub|grp", access.SystemAdminManage)
		require.NoError(t, err)
		assert.False(t, can, "a group admin is not a system admin")

		apply(t, b, "GlobalAccess", access.GlobalAccessID, 3, "GlobalRoleRevoked",
			access.GlobalRoleRevoked{Subject: "sub|admin", Role: access.SystemAdmin})

		mine, err = b.AccessQueries.MyGlobalRoles(ctx, "sub|admin")
		require.NoError(t, err)
		assert.Empty(t, mine)

		can, err = b.GlobalAccess.Can(ctx, "sub|admin", access.SystemAdminManage)
		require.NoError(t, err)
		assert.False(t, can)

		// Granting again after revoking restores it.
		apply(t, b, "GlobalAccess", access.GlobalAccessID, 4, "GlobalRoleGranted",
			access.GlobalRoleGranted{Subject: "sub|admin", Role: access.SystemAdmin})

		mine, err = b.AccessQueries.MyGlobalRoles(ctx, "sub|admin")
		require.NoError(t, err)
		assert.Len(t, mine, 1)
	})

	t.Run("Users_Listed", func(t *testing.T) {
		b := f(t)
		if b.Users == nil {
			t.Skip("backend does not provide FirstUserRepository")
		}

		ctx := t.Context()
		require.NoError(t, b.Users.Upsert(ctx, "sub|2", "bob@example.com", "Bob"))
		require.NoError(t, b.Users.Upsert(ctx, "sub|1", "alice@example.com", "Alice"))

		users, err := b.AccessQueries.ListUsers(ctx)
		require.NoError(t, err)
		require.Len(t, users, 2)
		assert.Equal(t, "Alice", users[0].Name, "users are ordered by name")
		assert.Equal(t, "sub|1", users[0].Sub)
		assert.Equal(t, "alice@example.com", users[0].Email)
		assert.Equal(t, "Bob", users[1].Name)
	})

	t.Run("DefaultAccessTemplate", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		tpl, err := b.AccessQueries.GetDefaultAccessTemplate(ctx)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, tpl.Mode, "without a template the default is restricted")
		assert.Empty(t, tpl.Grants)

		apply(t, b, "IncidentAccess", access.DefaultAccessTemplateID, 1, "AccessInitialized",
			access.AccessInitialized{Mode: access.OpenOperational})
		apply(t, b, "IncidentAccess", access.DefaultAccessTemplateID, 2, "RoleGranted", access.RoleGranted{
			Principal: access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID},
			Role:      access.Viewer,
		})

		tpl, err = b.AccessQueries.GetDefaultAccessTemplate(ctx)
		require.NoError(t, err)
		assert.Equal(t, access.OpenOperational, tpl.Mode)
		require.Len(t, tpl.Grants, 1)
		assert.Equal(t, access.AllPrincipal, tpl.Grants[0].Principal.Kind)
		assert.Equal(t, access.Viewer, tpl.Grants[0].Role)
	})

	t.Run("ResetClearsAccessState", func(t *testing.T) {
		b := f(t)
		if b.ResetProjections == nil {
			t.Skip("backend does not provide ResetProjections")
		}

		apply(t, b, "AccessGroup", uuid.New(), 1, "GroupCreated", access.GroupCreated{Name: "Temp"})

		groups, err := b.AccessQueries.ListAccessGroups(t.Context())
		require.NoError(t, err)
		require.Len(t, groups, 1)

		require.NoError(t, b.ResetProjections(t.Context()))

		groups, err = b.AccessQueries.ListAccessGroups(t.Context())
		require.NoError(t, err)
		assert.Empty(t, groups, "no events were stored, so a rebuild leaves no groups")
	})
}

// sortMembers orders members by subject for backends that do not promise an order.
func sortMembers(b *Backend, members []outbound.GroupMemberRM) {
	if b.Caps.AccessListingContract {
		return
	}

	sort.Slice(members, func(i, j int) bool { return members[i].Subject < members[j].Subject })
}
