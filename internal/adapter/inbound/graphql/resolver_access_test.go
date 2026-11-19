package graphql_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gqlresolver "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/generated"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// accessMutationCalls lists every access mutation with valid arguments, so that the guard
// clauses (no actor, no access service, malformed id) can be checked uniformly.
func accessMutationCalls(m generated.MutationResolver, id string) map[string]func(ctx context.Context) error {
	return map[string]func(ctx context.Context) error{
		"ChangeIncidentAccessMode": func(ctx context.Context) error {
			_, err := m.ChangeIncidentAccessMode(ctx, id, model.IncidentAccessModeRestricted)
			return err
		},
		"SetDefaultAccessMode": func(ctx context.Context) error {
			_, err := m.SetDefaultAccessMode(ctx, model.IncidentAccessModeRestricted)
			return err
		},
		"GrantDefaultRole": func(ctx context.Context) error {
			_, err := m.GrantDefaultRole(ctx, model.AccessPrincipalKindUser, "u", model.IncidentRoleViewer)
			return err
		},
		"RevokeDefaultRole": func(ctx context.Context) error {
			_, err := m.RevokeDefaultRole(ctx, model.AccessPrincipalKindUser, "u", model.IncidentRoleViewer)
			return err
		},
		"GrantIncidentRole": func(ctx context.Context) error {
			_, err := m.GrantIncidentRole(ctx, id, model.AccessPrincipalKindUser, "u", model.IncidentRoleViewer)
			return err
		},
		"RevokeIncidentRole": func(ctx context.Context) error {
			_, err := m.RevokeIncidentRole(ctx, id, model.AccessPrincipalKindUser, "u", model.IncidentRoleViewer)
			return err
		},
		"CreateAccessGroup": func(ctx context.Context) error {
			_, err := m.CreateAccessGroup(ctx, "g", "d")
			return err
		},
		"RenameAccessGroup": func(ctx context.Context) error {
			_, err := m.RenameAccessGroup(ctx, id, "g")
			return err
		},
		"UpdateAccessGroupDescription": func(ctx context.Context) error {
			_, err := m.UpdateAccessGroupDescription(ctx, id, "d")
			return err
		},
		"ArchiveAccessGroup": func(ctx context.Context) error {
			_, err := m.ArchiveAccessGroup(ctx, id)
			return err
		},
		"AddGroupMember": func(ctx context.Context) error {
			_, err := m.AddGroupMember(ctx, id, "u")
			return err
		},
		"RemoveGroupMember": func(ctx context.Context) error {
			_, err := m.RemoveGroupMember(ctx, id, "u")
			return err
		},
		"GrantGlobalRole": func(ctx context.Context) error {
			_, err := m.GrantGlobalRole(ctx, "u", model.GlobalRoleGroupAdmin)
			return err
		},
		"RevokeGlobalRole": func(ctx context.Context) error {
			_, err := m.RevokeGlobalRole(ctx, "u", model.GlobalRoleGroupAdmin)
			return err
		},
	}
}

func TestAccessMutations_GuardClauses(t *testing.T) {
	id := uuid.NewString()
	// A resolver without an access service must refuse rather than panic.
	bare := &gqlresolver.Resolver{}

	for name, call := range accessMutationCalls(bare.Mutation(), id) {
		t.Run(name+"/no actor", func(t *testing.T) {
			require.Error(t, call(context.Background()))
		})
		t.Run(name+"/no access service", func(t *testing.T) {
			require.ErrorIs(t, call(ctxFor("someone")), shared.ErrForbidden)
		})
	}

	// Malformed ids are rejected as invalid input before the service is reached.
	badID := accessMutationCalls(bare.Mutation(), "not-a-uuid")

	for _, name := range []string{
		"ChangeIncidentAccessMode", "GrantIncidentRole", "RevokeIncidentRole", "RenameAccessGroup",
		"UpdateAccessGroupDescription", "ArchiveAccessGroup", "AddGroupMember", "RemoveGroupMember",
	} {
		t.Run(name+"/bad id", func(t *testing.T) {
			require.ErrorIs(t, badID[name](ctxFor("someone")), shared.ErrInvalidInput)
		})
	}
}

func TestIncidentRoles_GrantListRevoke(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Restricted", model.IncidentAccessModeRestricted)
	m := s.resolver.Mutation()

	grant, err := m.GrantIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "alice", model.IncidentRoleEditor,
	)
	require.NoError(t, err)
	assert.Equal(t, &model.IncidentAccessGrant{
		IncidentID:    inc.ID,
		PrincipalKind: model.AccessPrincipalKindUser,
		PrincipalID:   "alice",
		Role:          model.IncidentRoleEditor,
	}, grant)

	s.catchUp(t)

	grants, err := s.resolver.Query().IncidentAccess(ctxFor("owner"), inc.ID)
	require.NoError(t, err)

	roles := map[string]model.IncidentRole{}

	for _, g := range grants {
		assert.Equal(t, inc.ID, g.IncidentID)
		assert.Equal(t, model.AccessPrincipalKindUser, g.PrincipalKind)

		roles[g.PrincipalID] = g.Role
	}

	assert.Equal(t, model.IncidentRoleOwner, roles["owner"])
	assert.Equal(t, model.IncidentRoleEditor, roles["alice"])

	// An editor may write but not manage access: she cannot list, grant or revoke.
	_, err = s.resolver.Query().IncidentAccess(ctxFor("alice"), inc.ID)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.GrantIncidentRole(
		ctxFor("alice"),
		inc.ID,
		model.AccessPrincipalKindUser,
		"mallory",
		model.IncidentRoleViewer,
	)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.RevokeIncidentRole(
		ctxFor("alice"),
		inc.ID,
		model.AccessPrincipalKindUser,
		"owner",
		model.IncidentRoleOwner,
	)
	require.ErrorIs(t, err, shared.ErrForbidden)

	revoked, err := m.RevokeIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "alice", model.IncidentRoleEditor,
	)
	require.NoError(t, err)
	assert.Equal(t, inc.ID, revoked)

	s.catchUp(t)

	grants, err = s.resolver.Query().IncidentAccess(ctxFor("owner"), inc.ID)
	require.NoError(t, err)

	for _, g := range grants {
		assert.NotEqual(t, "alice", g.PrincipalID, "revoked principal must be gone")
	}
}

func TestIncidentAccess_Guards(t *testing.T) {
	id := uuid.NewString()

	_, err := (&gqlresolver.Resolver{}).Query().IncidentAccess(context.Background(), id)
	require.Error(t, err, "no actor")

	_, err = (&gqlresolver.Resolver{}).Query().IncidentAccess(ctxFor("x"), "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = (&gqlresolver.Resolver{}).Query().IncidentAccess(ctxFor("x"), id)
	require.ErrorIs(t, err, shared.ErrForbidden, "not wired")

	_, err = (&gqlresolver.Resolver{}).Query().IncidentAccessMode(context.Background(), id)
	require.Error(t, err, "no actor")

	_, err = (&gqlresolver.Resolver{}).Query().IncidentAccessMode(ctxFor("x"), "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = (&gqlresolver.Resolver{}).Query().IncidentAccessMode(ctxFor("x"), id)
	require.ErrorIs(t, err, shared.ErrForbidden, "not wired")
}

func TestIncidentAccessMode_ChangeAndQuery(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Mode", model.IncidentAccessModeRestricted)

	mode, err := s.resolver.Query().IncidentAccessMode(ctxFor("owner"), inc.ID)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeRestricted, mode)

	// A stranger cannot even learn that a restricted incident exists.
	_, err = s.resolver.Query().IncidentAccessMode(ctxFor("stranger"), inc.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)

	// ...and cannot change its mode.
	_, err = s.resolver.Mutation().
		ChangeIncidentAccessMode(ctxFor("stranger"), inc.ID, model.IncidentAccessModeOpenOperational)
	require.ErrorIs(t, err, shared.ErrForbidden)

	got, err := s.resolver.Mutation().ChangeIncidentAccessMode(
		ctxFor("owner"), inc.ID, model.IncidentAccessModeOpenOperational,
	)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, got)

	s.catchUp(t)

	mode, err = s.resolver.Query().IncidentAccessMode(ctxFor("stranger"), inc.ID)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, mode, "open incidents are readable by anyone")

	// The Incident.accessMode field resolver reports the same mode.
	fieldMode, err := s.resolver.Incident().AccessMode(ctxFor("owner"), inc)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, fieldMode)
}

func TestIncident_AccessFieldResolvers(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Fields", model.IncidentAccessModeRestricted)

	_, err := s.resolver.Mutation().GrantIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "viewer", model.IncidentRoleViewer,
	)
	require.NoError(t, err)

	_, err = s.resolver.Mutation().GrantIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "editor", model.IncidentRoleEditor,
	)
	require.NoError(t, err)
	s.catchUp(t)

	type fieldResolver func(context.Context, *model.Incident) (bool, error)

	r := s.resolver.Incident()
	fields := map[string]fieldResolver{
		"canWrite":        r.CanWrite,
		"canManage":       r.CanManage,
		"canDelete":       r.CanDelete,
		"canManageAccess": r.CanManageAccess,
	}

	// subject -> field -> expected
	want := map[string]map[string]bool{
		"owner":    {"canWrite": true, "canManage": true, "canDelete": true, "canManageAccess": true},
		"editor":   {"canWrite": true, "canManage": false, "canDelete": false, "canManageAccess": false},
		"viewer":   {"canWrite": false, "canManage": false, "canDelete": false, "canManageAccess": false},
		"stranger": {"canWrite": false, "canManage": false, "canDelete": false, "canManageAccess": false},
	}

	for sub, expectations := range want {
		for field, expected := range expectations {
			got, err := fields[field](ctxFor(sub), inc)
			require.NoError(t, err, "%s/%s", sub, field)
			assert.Equal(t, expected, got, "%s/%s", sub, field)
		}
	}

	for field, call := range fields {
		_, err := call(context.Background(), inc)
		require.Error(t, err, "%s without an actor", field)

		_, err = call(ctxFor("owner"), &model.Incident{ID: "bad"})
		require.ErrorIs(t, err, shared.ErrInvalidInput, "%s with a malformed id", field)
	}
}

func TestIncident_AccessFieldResolvers_NotWired(t *testing.T) {
	// Without access wiring (single-user mode) everything is allowed and the incident is open.
	r := (&gqlresolver.Resolver{}).Incident()
	inc := &model.Incident{ID: uuid.NewString()}

	for name, call := range map[string]func(context.Context, *model.Incident) (bool, error){
		"canWrite": r.CanWrite, "canManage": r.CanManage, "canDelete": r.CanDelete, "canManageAccess": r.CanManageAccess,
	} {
		got, err := call(context.Background(), inc)
		require.NoError(t, err, name)
		assert.True(t, got, name)
	}

	mode, err := r.AccessMode(context.Background(), inc)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, mode)
}

func TestIncident_AccessMode_UnknownIncidentIsOpen(t *testing.T) {
	s := newFullStack(t)

	// An incident without an access aggregate (created before RBAC) reads as open operational.
	mode, err := s.resolver.Incident().AccessMode(ctxFor("owner"), &model.Incident{ID: uuid.NewString()})
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, mode)

	_, err = s.resolver.Incident().AccessMode(ctxFor("owner"), &model.Incident{ID: "bad"})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestDefaultAccess_Lifecycle(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	m := s.resolver.Mutation()

	// Non-admins cannot touch the template.
	_, err := m.SetDefaultAccessMode(ctxFor("user"), model.IncidentAccessModeOpenOperational)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.GrantDefaultRole(ctxFor("user"), model.AccessPrincipalKindUser, "x", model.IncidentRoleViewer)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.RevokeDefaultRole(ctxFor("user"), model.AccessPrincipalKindUser, "x", model.IncidentRoleViewer)
	require.ErrorIs(t, err, shared.ErrForbidden)

	setMode, err := m.SetDefaultAccessMode(ctxFor("admin"), model.IncidentAccessModeOpenOperational)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, setMode.Mode)

	granted, err := m.GrantDefaultRole(ctxFor("admin"), model.AccessPrincipalKindAll, "*", model.IncidentRoleViewer)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, granted.Mode)
	require.Len(t, granted.Grants, 1)
	assert.Equal(t, &model.DefaultAccessGrant{
		PrincipalKind: model.AccessPrincipalKindAll,
		PrincipalID:   "*",
		Role:          model.IncidentRoleViewer,
	}, granted.Grants[0])

	s.catchUp(t)

	got, err := s.resolver.Query().DefaultAccess(ctxFor("anyone"))
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, got.Mode)
	assert.Equal(t, granted.Grants, got.Grants)

	revoked, err := m.RevokeDefaultRole(ctxFor("admin"), model.AccessPrincipalKindAll, "*", model.IncidentRoleViewer)
	require.NoError(t, err)
	assert.Empty(t, revoked.Grants)

	s.catchUp(t)

	got, err = s.resolver.Query().DefaultAccess(ctxFor("anyone"))
	require.NoError(t, err)
	assert.Empty(t, got.Grants)
}

func TestDefaultAccess_NotWired_IsOpenAndEmpty(t *testing.T) {
	got, err := (&gqlresolver.Resolver{}).Query().DefaultAccess(context.Background())
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, got.Mode)
	assert.Empty(t, got.Grants)
	assert.NotNil(t, got.Grants)
}

func TestAccessGroups_Lifecycle(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	m := s.resolver.Mutation()

	_, err := m.CreateAccessGroup(ctxFor("user"), "Nope", "")
	require.ErrorIs(t, err, shared.ErrForbidden)

	created, err := m.CreateAccessGroup(ctxFor("admin"), "Fire brigade", "First responders")
	require.NoError(t, err)
	assert.Equal(t, "Fire brigade", created.Name)
	assert.Equal(t, "First responders", created.Description)

	_, err = uuid.Parse(created.ID)
	require.NoError(t, err)

	renamed, err := m.RenameAccessGroup(ctxFor("admin"), created.ID, "Feuerwehr")
	require.NoError(t, err)
	assert.Equal(t, created.ID, renamed.ID)
	assert.Equal(t, "Feuerwehr", renamed.Name)

	described, err := m.UpdateAccessGroupDescription(ctxFor("admin"), created.ID, "Erstintervention")
	require.NoError(t, err)
	assert.Equal(t, created.ID, described.ID)
	assert.Equal(t, "Erstintervention", described.Description)

	// Authorization: ordinary users may neither rename, describe, archive nor manage members.
	_, err = m.RenameAccessGroup(ctxFor("user"), created.ID, "x")
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.UpdateAccessGroupDescription(ctxFor("user"), created.ID, "x")
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.ArchiveAccessGroup(ctxFor("user"), created.ID)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.AddGroupMember(ctxFor("user"), created.ID, "carol")
	require.ErrorIs(t, err, shared.ErrForbidden)

	added, err := m.AddGroupMember(ctxFor("admin"), created.ID, "carol")
	require.NoError(t, err)
	assert.Equal(t, created.ID, added)

	_, err = m.AddGroupMember(ctxFor("admin"), created.ID, "dave")
	require.NoError(t, err)
	s.catchUp(t)

	members, err := s.resolver.Query().GroupMembers(ctxFor("admin"), created.ID)
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"carol", "dave"}, members)

	_, err = s.resolver.Query().GroupMembers(ctxFor("user"), created.ID)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = s.resolver.Query().GroupMembers(ctxFor("admin"), "not-a-uuid")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	removed, err := m.RemoveGroupMember(ctxFor("admin"), created.ID, "carol")
	require.NoError(t, err)
	assert.Equal(t, created.ID, removed)
	s.catchUp(t)

	members, err = s.resolver.Query().GroupMembers(ctxFor("admin"), created.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"dave"}, members)

	archived, err := m.ArchiveAccessGroup(ctxFor("admin"), created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, archived)
	s.catchUp(t)

	groups, err := s.resolver.Query().AccessGroups(ctxFor("user"))
	require.NoError(t, err)
	require.Len(t, groups, 1)
	assert.Equal(t, "Feuerwehr", groups[0].Name)
	assert.Equal(t, "Erstintervention", groups[0].Description)
	assert.NotNil(t, groups[0].ArchivedAt, "an archived group stays listed, marked archived")
}

func TestAccessGroups_UnknownGroupIsNotFound(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	_, err := s.resolver.Mutation().RenameAccessGroup(ctxFor("admin"), uuid.NewString(), "x")
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestGroupMembersAndUsers_Guards(t *testing.T) {
	bare := &gqlresolver.Resolver{}
	id := uuid.NewString()

	_, err := bare.Query().GroupMembers(context.Background(), id)
	require.Error(t, err)

	_, err = bare.Query().GroupMembers(ctxFor("x"), id)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = bare.Query().Users(context.Background())
	require.Error(t, err)

	_, err = bare.Query().Users(ctxFor("x"))
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = bare.Query().GlobalRoles(context.Background())
	require.Error(t, err)

	_, err = bare.Query().GlobalRoles(ctxFor("x"))
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = bare.Query().MyGlobalRoles(context.Background())
	require.Error(t, err)

	mine, err := bare.Query().MyGlobalRoles(ctxFor("x"))
	require.NoError(t, err)
	assert.Empty(t, mine)
	assert.NotNil(t, mine)
}

// usersQueries serves a fixed user list on top of the in-memory access queries, which have no
// user directory of their own.
type usersQueries struct {
	outbound.AccessQueries
}

func (usersQueries) ListUsers(context.Context) ([]outbound.UserRM, error) {
	return []outbound.UserRM{{Sub: "u1", Name: "Una", Email: "una@example.com"}}, nil
}

func TestUsers_RequiresGroupManage(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)
	s.resolver.AccessQueries = usersQueries{AccessQueries: s.resolver.AccessQueries}

	users, err := s.resolver.Query().Users(ctxFor("admin"))
	require.NoError(t, err)
	assert.Equal(t, []*model.User{{Sub: "u1", Name: "Una", Email: "una@example.com"}}, users)

	_, err = s.resolver.Query().Users(ctxFor("user"))
	require.ErrorIs(t, err, shared.ErrForbidden)
}

func TestGlobalRoles_GrantListRevoke(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	m := s.resolver.Mutation()

	_, err := m.GrantGlobalRole(ctxFor("user"), "bob", model.GlobalRoleGroupAdmin)
	require.ErrorIs(t, err, shared.ErrForbidden)

	got, err := m.GrantGlobalRole(ctxFor("admin"), "bob", model.GlobalRoleGroupAdmin)
	require.NoError(t, err)
	assert.Equal(t, "bob", got)
	s.catchUp(t)

	roles, err := s.resolver.Query().GlobalRoles(ctxFor("admin"))
	require.NoError(t, err)

	byRole := map[string]model.GlobalRole{}
	for _, g := range roles {
		byRole[g.Subject] = g.Role
	}

	assert.Equal(t, model.GlobalRoleSystemAdmin, byRole["admin"])
	assert.Equal(t, model.GlobalRoleGroupAdmin, byRole["bob"])

	// Only system administrators list roles; a group admin does not qualify.
	_, err = s.resolver.Query().GlobalRoles(ctxFor("bob"))
	require.ErrorIs(t, err, shared.ErrForbidden)

	// A group admin manages groups, so she may read group members and the user list.
	g, err := m.CreateAccessGroup(ctxFor("admin"), "G", "")
	require.NoError(t, err)
	s.catchUp(t)

	_, err = s.resolver.Query().GroupMembers(ctxFor("bob"), g.ID)
	require.NoError(t, err)

	mine, err := s.resolver.Query().MyGlobalRoles(ctxFor("bob"))
	require.NoError(t, err)
	require.Len(t, mine, 1)
	assert.Equal(t, "bob", mine[0].Subject)
	assert.Equal(t, model.GlobalRoleGroupAdmin, mine[0].Role)

	none, err := s.resolver.Query().MyGlobalRoles(ctxFor("nobody"))
	require.NoError(t, err)
	assert.Empty(t, none)

	// The last system administrator cannot be removed.
	_, err = m.RevokeGlobalRole(ctxFor("admin"), "admin", model.GlobalRoleSystemAdmin)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = m.RevokeGlobalRole(ctxFor("user"), "bob", model.GlobalRoleGroupAdmin)
	require.ErrorIs(t, err, shared.ErrForbidden)

	revoked, err := m.RevokeGlobalRole(ctxFor("admin"), "bob", model.GlobalRoleGroupAdmin)
	require.NoError(t, err)
	assert.Equal(t, "bob", revoked)
	s.catchUp(t)

	mine, err = s.resolver.Query().MyGlobalRoles(ctxFor("bob"))
	require.NoError(t, err)
	assert.Empty(t, mine)
}
