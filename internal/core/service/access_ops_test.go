package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	projection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// accessFixture wires an AccessService against the in-memory stack with real permission
// checkers backed by the projected access read model.
type accessFixture struct {
	t         *testing.T
	store     *inmem.EventStore
	incRepo   *eventstoreIncRepo
	groupRepo *eventstoreGroupRepo
	global    *eventstoreGlobalRepo
	projector *projection.Projector
	handler   *projection.AccessHandler
	svc       *service.AccessService
}

type (
	eventstoreIncRepo    = eventstore.IncidentAccessRepository
	eventstoreGroupRepo  = eventstore.AccessGroupRepository
	eventstoreGlobalRepo = eventstore.GlobalAccessRepository
)

const (
	accessAdmin = "admin"
	accessOwner = "owner"
)

func newAccessFixture(ctx context.Context, t *testing.T) *accessFixture {
	t.Helper()

	return newAccessFixtureWith(ctx, t, nil)
}

// newAccessFixtureWith lets a test replace the incident permission checker.
func newAccessFixtureWith(
	ctx context.Context,
	t *testing.T,
	override func(inner *inmem.IncidentAccessChecker) incidentChecker,
) *accessFixture {
	t.Helper()

	store := inmem.NewEventStore()
	at := time.Unix(1, 0)
	handler := projection.NewAccessHandler()
	f := &accessFixture{
		t:         t,
		store:     store,
		incRepo:   eventstore.NewIncidentAccessRepository(store),
		groupRepo: eventstore.NewAccessGroupRepository(store),
		global:    eventstore.NewGlobalAccessRepository(store),
		projector: projection.NewProjector(store, []projection.Handler{handler}),
		handler:   handler,
	}

	// The bootstrap system admin may manage groups and global roles.
	g := access.NewGlobalAccess()
	require.NoError(t, g.Initialize("bootstrap", at))
	require.NoError(t, g.GrantRole(accessAdmin, access.SystemAdmin, "bootstrap", at))
	_, err := f.global.Save(ctx, g)
	require.NoError(t, err)

	inner := inmem.NewIncidentAccessChecker(handler)

	var checker incidentChecker = inner
	if override != nil {
		checker = override(inner)
	}

	f.svc = service.NewAccessService(
		inmem.NewTransactor(),
		f.incRepo,
		f.groupRepo,
		f.global,
		checker,
		inmem.NewGlobalAccessChecker(handler),
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	f.catchUp(ctx)

	return f
}

func (f *accessFixture) catchUp(ctx context.Context) {
	f.t.Helper()
	require.NoError(f.t, f.projector.CatchUp(ctx))
}

// seedIncident stores an incident access stream and projects it.
func (f *accessFixture) seedIncident(
	ctx context.Context,
	mode access.IncidentMode,
	owner *string,
	extra ...access.Grant,
) shared.IncidentID {
	f.t.Helper()

	id := shared.IncidentID(uuid.New())
	at := time.Unix(1, 0)
	a := access.NewIncidentAccess(id)
	require.NoError(f.t, a.Initialize(owner, mode, "seed", at))

	for _, g := range extra {
		require.NoError(f.t, a.GrantRole(g.Principal, g.Role, "seed", at))
	}

	_, err := f.incRepo.Save(ctx, a)
	require.NoError(f.t, err)
	f.catchUp(ctx)

	return id
}

func (f *accessFixture) loadIncident(ctx context.Context, id shared.IncidentID) *access.IncidentAccess {
	f.t.Helper()

	a, err := f.incRepo.Load(ctx, id)
	require.NoError(f.t, err)

	return a
}

func userPrincipal(id string) access.Principal {
	return access.Principal{Kind: access.UserPrincipal, ID: id}
}

// incidentChecker mirrors outbound.IncidentAccessChecker without importing the port here.
type incidentChecker interface {
	Can(ctx context.Context, subject string, incidentID shared.IncidentID, action access.Action) (bool, error)
}

// denyManageChecker delegates to the real checker but always refuses incident.manage_access,
// which is how a locked-down policy looks to the service.
type denyManageChecker struct{ inner incidentChecker }

func (c denyManageChecker) Can(
	ctx context.Context,
	subject string,
	incidentID shared.IncidentID,
	action access.Action,
) (bool, error) {
	if action == access.IncidentManageAccess {
		return false, nil
	}

	return c.inner.Can(ctx, subject, incidentID, action)
}

func TestRevokeIncidentRole(t *testing.T) {
	ctx := context.Background()
	viewer := access.Grant{Principal: userPrincipal("viewer"), Role: access.Viewer}
	manager := access.Grant{Principal: userPrincipal("manager"), Role: access.Manager}
	owner2 := access.Grant{Principal: userPrincipal("owner2"), Role: access.Owner}

	tests := []struct {
		name      string
		actor     string
		principal string
		role      access.Role
		wantErr   error
		wantHeld  bool
	}{
		{"manager revokes a viewer", "manager", "viewer", access.Viewer, nil, false},
		{"owner revokes a viewer", accessOwner, "viewer", access.Viewer, nil, false},
		{"plain viewer may not revoke", "viewer", "viewer", access.Viewer, shared.ErrForbidden, true},
		{"stranger may not revoke", "stranger", "viewer", access.Viewer, shared.ErrForbidden, true},
		{"manager may not revoke an owner", "manager", "owner2", access.Owner, shared.ErrForbidden, true},
		{"owner revokes another owner", accessOwner, "owner2", access.Owner, nil, false},
		{"revoking an unheld role is a no-op", accessOwner, "nobody", access.Viewer, nil, false},
		{"invalid role", accessOwner, "viewer", access.Role("bogus"), shared.ErrInvalidInput, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newAccessFixture(ctx, t)
			id := f.seedIncident(ctx, access.Restricted, new(accessOwner), viewer, manager, owner2)

			err := f.svc.RevokeIncidentRole(
				ctx,
				id,
				userPrincipal(tt.principal),
				tt.role,
				identity.Actor{Sub: tt.actor},
			)

			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, tt.wantHeld, f.loadIncident(ctx, id).HasRole(userPrincipal(tt.principal), tt.role))
		})
	}
}

func TestRevokeIncidentRoleCannotRemoveLastOwner(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	id := f.seedIncident(ctx, access.Restricted, new(accessOwner))

	err := f.svc.RevokeIncidentRole(
		ctx, id, userPrincipal(accessOwner), access.Owner, identity.Actor{Sub: accessOwner})

	require.ErrorIs(t, err, shared.ErrForbidden)
	assert.True(t, f.loadIncident(ctx, id).IsOwner(accessOwner))
}

func TestRevokeIncidentRoleUnknownIncident(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)

	err := f.svc.RevokeIncidentRole(
		ctx,
		shared.IncidentID(uuid.New()),
		userPrincipal("x"),
		access.Viewer,
		identity.Actor{Sub: accessOwner},
	)

	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestGrantIncidentRoleGroupGuards(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	id := f.seedIncident(ctx, access.Restricted, new(accessOwner))
	actor := identity.Actor{Sub: accessOwner}
	adminActor := identity.Actor{Sub: accessAdmin}

	groupID, err := f.svc.CreateAccessGroup(ctx, "Ops", "", adminActor)
	require.NoError(t, err)

	t.Run("unknown group", func(t *testing.T) {
		err := f.svc.GrantIncidentRole(ctx, id,
			access.Principal{Kind: access.GroupPrincipal, ID: uuid.NewString()}, access.Viewer, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("active group", func(t *testing.T) {
		p := access.Principal{Kind: access.GroupPrincipal, ID: groupID.String()}
		require.NoError(t, f.svc.GrantIncidentRole(ctx, id, p, access.Viewer, actor))
		assert.True(t, f.loadIncident(ctx, id).HasRole(p, access.Viewer))
	})

	t.Run("archived group", func(t *testing.T) {
		archived, err := f.svc.CreateAccessGroup(ctx, "Old", "", adminActor)
		require.NoError(t, err)
		require.NoError(t, f.svc.ArchiveAccessGroup(ctx, archived, adminActor))

		p := access.Principal{Kind: access.GroupPrincipal, ID: archived.String()}
		require.ErrorIs(t, f.svc.GrantIncidentRole(ctx, id, p, access.Viewer, actor), shared.ErrInvalidInput)
		assert.False(t, f.loadIncident(ctx, id).HasRole(p, access.Viewer))
	})
}

func TestChangeIncidentAccessMode(t *testing.T) {
	ctx := context.Background()

	t.Run("manager opens a restricted incident", func(t *testing.T) {
		f := newAccessFixture(ctx, t)
		id := f.seedIncident(ctx, access.Restricted, new(accessOwner))

		mode, err := f.svc.ChangeIncidentAccessMode(ctx, id, access.OpenOperational, identity.Actor{Sub: accessOwner})

		require.NoError(t, err)
		assert.Equal(t, access.OpenOperational, mode)
		assert.Equal(t, access.OpenOperational, f.loadIncident(ctx, id).Mode())
	})

	t.Run("owner restricts an open incident", func(t *testing.T) {
		f := newAccessFixture(ctx, t)
		id := f.seedIncident(ctx, access.OpenOperational, new(accessOwner))

		mode, err := f.svc.ChangeIncidentAccessMode(ctx, id, access.Restricted, identity.Actor{Sub: accessOwner})

		require.NoError(t, err)
		assert.Equal(t, access.Restricted, mode)
	})

	t.Run("non-manager is refused on a restricted incident", func(t *testing.T) {
		f := newAccessFixture(ctx, t)
		id := f.seedIncident(ctx, access.Restricted, new(accessOwner),
			access.Grant{Principal: userPrincipal("viewer"), Role: access.Viewer})

		mode, err := f.svc.ChangeIncidentAccessMode(ctx, id, access.OpenOperational, identity.Actor{Sub: "viewer"})

		require.ErrorIs(t, err, shared.ErrForbidden)
		assert.Empty(t, mode)
		assert.Equal(t, access.Restricted, f.loadIncident(ctx, id).Mode())
	})

	t.Run("invalid mode is rejected", func(t *testing.T) {
		f := newAccessFixture(ctx, t)
		id := f.seedIncident(ctx, access.Restricted, new(accessOwner))

		_, err := f.svc.ChangeIncidentAccessMode(
			ctx,
			id,
			access.IncidentMode("bogus"),
			identity.Actor{Sub: accessOwner},
		)

		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("unknown incident", func(t *testing.T) {
		f := newAccessFixture(ctx, t)

		_, err := f.svc.ChangeIncidentAccessMode(
			ctx, shared.IncidentID(uuid.New()), access.Restricted, identity.Actor{Sub: accessOwner})

		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

// TestChangeIncidentAccessModeClaimableOpenIncident covers the exception that lets a user
// without manage-access switch an open incident to restricted while it has no direct user
// owner: the actor becomes its owner. Every other combination stays forbidden.
func TestChangeIncidentAccessModeClaimableOpenIncident(t *testing.T) {
	ctx := context.Background()
	groupOwner := access.Grant{
		Principal: access.Principal{Kind: access.GroupPrincipal, ID: uuid.NewString()},
		Role:      access.Owner,
	}

	tests := []struct {
		name     string
		mode     access.IncidentMode
		owner    *string
		extra    []access.Grant
		target   access.IncidentMode
		wantErr  bool
		wantMode access.IncidentMode
	}{
		{
			name: "open without any owner: claimable", mode: access.OpenOperational,
			target: access.Restricted, wantMode: access.Restricted,
		},
		{
			name: "open with only a group owner: claimable", mode: access.OpenOperational,
			extra: []access.Grant{groupOwner}, target: access.Restricted, wantMode: access.Restricted,
		},
		{
			name: "open with a direct user owner: refused", mode: access.OpenOperational,
			owner: new(accessOwner), target: access.Restricted, wantErr: true, wantMode: access.OpenOperational,
		},
		{
			name: "open ownerless but target is open: refused", mode: access.OpenOperational,
			target: access.OpenOperational, wantErr: true, wantMode: access.OpenOperational,
		},
		{
			name: "restricted incident is not claimable", mode: access.Restricted,
			owner: new(accessOwner), target: access.OpenOperational, wantErr: true, wantMode: access.Restricted,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newAccessFixtureWith(ctx, t, func(inner *inmem.IncidentAccessChecker) incidentChecker {
				return denyManageChecker{inner: inner}
			})
			id := f.seedIncident(ctx, tt.mode, tt.owner, tt.extra...)

			mode, err := f.svc.ChangeIncidentAccessMode(ctx, id, tt.target, identity.Actor{Sub: "claimer"})

			if tt.wantErr {
				require.ErrorIs(t, err, shared.ErrForbidden)
				assert.Empty(t, mode)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.wantMode, mode)
				assert.True(t, f.loadIncident(ctx, id).IsOwner("claimer"), "the claimer becomes the owner")
			}

			assert.Equal(t, tt.wantMode, f.loadIncident(ctx, id).Mode())
		})
	}
}

func TestAccessGroupLifecycle(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}

	id, err := f.svc.CreateAccessGroup(ctx, "Operations", "first", admin)
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, id)

	group, err := f.groupRepo.Load(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, "Operations", group.Name())
	assert.Equal(t, "first", group.Description())

	require.NoError(t, f.svc.RenameAccessGroup(ctx, id, "Staff", admin))
	require.NoError(t, f.svc.UpdateAccessGroupDescription(ctx, id, "second", admin))
	require.NoError(t, f.svc.AddGroupMember(ctx, id, "m1", admin))
	require.NoError(t, f.svc.AddGroupMember(ctx, id, "m2", admin))
	require.NoError(t, f.svc.RemoveGroupMember(ctx, id, "m2", admin))

	group, err = f.groupRepo.Load(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, "Staff", group.Name())
	assert.Equal(t, "second", group.Description())
	assert.True(t, group.HasMember("m1"))
	assert.False(t, group.HasMember("m2"))
	assert.False(t, group.IsArchived())

	f.catchUp(ctx)
	assert.Equal(t, "Staff", f.handler.Groups()[id].Name)

	require.NoError(t, f.svc.ArchiveAccessGroup(ctx, id, admin))

	group, err = f.groupRepo.Load(ctx, id)
	require.NoError(t, err)
	assert.True(t, group.IsArchived())

	// Archived groups are frozen.
	require.Error(t, f.svc.RenameAccessGroup(ctx, id, "Again", admin))
	require.Error(t, f.svc.UpdateAccessGroupDescription(ctx, id, "again", admin))
	require.Error(t, f.svc.AddGroupMember(ctx, id, "m3", admin))
}

func TestAccessGroupValidation(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}

	_, err := f.svc.CreateAccessGroup(ctx, "   ", "", admin)
	require.Error(t, err, "blank names are rejected")

	id, err := f.svc.CreateAccessGroup(ctx, "Ops", "", admin)
	require.NoError(t, err)
	require.Error(t, f.svc.RenameAccessGroup(ctx, id, "", admin))
	require.Error(t, f.svc.AddGroupMember(ctx, id, " ", admin))

	group, err := f.groupRepo.Load(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, "Ops", group.Name(), "a rejected rename does not change the group")
}

func TestAccessGroupOperationsRequireGroupManage(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}
	outsider := identity.Actor{Sub: "outsider"}

	id, err := f.svc.CreateAccessGroup(ctx, "Ops", "", admin)
	require.NoError(t, err)
	require.NoError(t, f.svc.AddGroupMember(ctx, id, "m1", admin))

	_, err = f.svc.CreateAccessGroup(ctx, "Evil", "", outsider)
	require.ErrorIs(t, err, shared.ErrForbidden)

	ops := map[string]func() error{
		"rename":      func() error { return f.svc.RenameAccessGroup(ctx, id, "Evil", outsider) },
		"description": func() error { return f.svc.UpdateAccessGroupDescription(ctx, id, "evil", outsider) },
		"archive":     func() error { return f.svc.ArchiveAccessGroup(ctx, id, outsider) },
		"add member":  func() error { return f.svc.AddGroupMember(ctx, id, "m2", outsider) },
		"remove":      func() error { return f.svc.RemoveGroupMember(ctx, id, "m1", outsider) },
	}

	for name, op := range ops {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, op(), shared.ErrForbidden)
		})
	}

	group, err := f.groupRepo.Load(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, "Ops", group.Name())
	assert.Empty(t, group.Description())
	assert.False(t, group.IsArchived())
	assert.True(t, group.HasMember("m1"))
	assert.False(t, group.HasMember("m2"))
}

func TestAccessGroupOperationsOnUnknownGroup(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}
	missing := uuid.New()

	ops := map[string]func() error{
		"rename":      func() error { return f.svc.RenameAccessGroup(ctx, missing, "X", admin) },
		"description": func() error { return f.svc.UpdateAccessGroupDescription(ctx, missing, "x", admin) },
		"archive":     func() error { return f.svc.ArchiveAccessGroup(ctx, missing, admin) },
		"add member":  func() error { return f.svc.AddGroupMember(ctx, missing, "m", admin) },
		"remove":      func() error { return f.svc.RemoveGroupMember(ctx, missing, "m", admin) },
	}

	for name, op := range ops {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, op(), shared.ErrNotFound)
		})
	}
}

func TestGroupAdminCanManageGroupsButNotGlobalRoles(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}
	groupAdmin := identity.Actor{Sub: "group-admin"}

	require.NoError(t, f.svc.GrantGlobalRole(ctx, "group-admin", access.GroupAdmin, admin))
	f.catchUp(ctx)

	_, err := f.svc.CreateAccessGroup(ctx, "Ops", "", groupAdmin)
	require.NoError(t, err, "group admins manage groups")

	err = f.svc.GrantGlobalRole(ctx, "friend", access.GroupAdmin, groupAdmin)
	require.ErrorIs(t, err, shared.ErrForbidden)

	err = f.svc.RevokeGlobalRole(ctx, accessAdmin, access.SystemAdmin, groupAdmin)
	require.ErrorIs(t, err, shared.ErrForbidden)
}

func TestGrantGlobalRole(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}

	require.NoError(t, f.svc.GrantGlobalRole(ctx, "second", access.SystemAdmin, admin))
	require.NoError(t, f.svc.GrantGlobalRole(ctx, "second", access.SystemAdmin, admin), "granting twice is fine")

	global, err := f.global.Load(ctx)
	require.NoError(t, err)
	assert.True(t, global.HasRole("second", access.SystemAdmin))
	assert.ElementsMatch(t, []string{accessAdmin, "second"}, global.SubjectsWithRole(access.SystemAdmin))

	f.catchUp(ctx)
	assert.Contains(t, f.handler.GlobalRoles()["second"], access.SystemAdmin)

	// With a second admin the first may be revoked, leaving exactly one.
	require.NoError(t, f.svc.RevokeGlobalRole(ctx, accessAdmin, access.SystemAdmin, admin))

	global, err = f.global.Load(ctx)
	require.NoError(t, err)
	assert.Equal(t, []string{"second"}, global.SubjectsWithRole(access.SystemAdmin))
}

func TestGrantGlobalRoleGuards(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)

	t.Run("non-admin is forbidden", func(t *testing.T) {
		err := f.svc.GrantGlobalRole(ctx, "friend", access.SystemAdmin, identity.Actor{Sub: "outsider"})
		require.ErrorIs(t, err, shared.ErrForbidden)

		global, err := f.global.Load(ctx)
		require.NoError(t, err)
		assert.False(t, global.HasRole("friend", access.SystemAdmin))
	})

	t.Run("invalid role", func(t *testing.T) {
		err := f.svc.GrantGlobalRole(ctx, "friend", access.GlobalRole("root"), identity.Actor{Sub: accessAdmin})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("blank subject", func(t *testing.T) {
		err := f.svc.GrantGlobalRole(ctx, " ", access.SystemAdmin, identity.Actor{Sub: accessAdmin})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestGrantGlobalRoleInitializesMissingStream(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	globalRepo := eventstore.NewGlobalAccessRepository(store)
	svc := service.NewAccessService(
		inmem.NewTransactor(),
		eventstore.NewIncidentAccessRepository(store),
		eventstore.NewAccessGroupRepository(store),
		globalRepo,
		nil,
		nil,
		inmem.NewAccessGuard(),
		fixedAccessClock{t: time.Unix(1, 0)},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	require.NoError(t, svc.GrantGlobalRole(ctx, "first", access.GroupAdmin, identity.Actor{Sub: "bootstrap"}))

	global, err := globalRepo.Load(ctx)
	require.NoError(t, err)
	assert.True(t, global.HasRole("first", access.GroupAdmin))
}

func TestDefaultAccessOperationsRequireSystemAdmin(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	outsider := identity.Actor{Sub: "outsider"}
	admin := identity.Actor{Sub: accessAdmin}
	p := userPrincipal("u")

	_, err := f.svc.InitializeDefaultAccess(ctx, access.OpenOperational, nil, outsider)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = f.svc.SetDefaultAccessMode(ctx, access.OpenOperational, outsider)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = f.svc.GrantDefaultRole(ctx, p, access.Viewer, outsider)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = f.svc.RevokeDefaultRole(ctx, p, access.Viewer, outsider)
	require.ErrorIs(t, err, shared.ErrForbidden)

	f.catchUp(ctx)

	_, ok := f.handler.DefaultIncidentMode()
	assert.False(t, ok, "refused calls must not create the template")

	res, err := f.svc.InitializeDefaultAccess(
		ctx, access.OpenOperational, []access.Grant{{Principal: p, Role: access.Editor}}, admin)
	require.NoError(t, err)
	assert.Equal(t, access.OpenOperational, res.Mode)
	assert.Equal(t, []access.Grant{{Principal: p, Role: access.Editor}}, res.Grants)
}

func TestInitializeDefaultAccessRejectsInvalidInput(t *testing.T) {
	ctx := context.Background()
	f := newAccessFixture(ctx, t)
	admin := identity.Actor{Sub: accessAdmin}

	_, err := f.svc.InitializeDefaultAccess(ctx, access.IncidentMode("bogus"), nil, admin)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = f.svc.InitializeDefaultAccess(ctx, access.Restricted,
		[]access.Grant{{Principal: userPrincipal("u"), Role: access.Role("bogus")}}, admin)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}
