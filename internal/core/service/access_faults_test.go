package service_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// accessRig is the access service with checkers and repositories that can be switched or made to
// fail. It holds a restricted incident owned by "owner", and a group with one member.
type accessRig struct {
	svc *service.AccessService

	incident *accessState
	global   *globalAccessState
	guard    *hierarchyStub

	incidents *faultyAccessRepo
	groups    *faultyGroups
	globals   *faultyGlobal

	incidentID shared.IncidentID
	groupID    uuid.UUID
}

const accessOwner = "owner"

var (
	ownerActor = identity.Actor{Sub: accessOwner}
	someone    = access.Principal{Kind: access.UserPrincipal, ID: "someone"}
)

func newAccessRig(t *testing.T) accessRig {
	t.Helper()

	store := inmem.NewEventStore()
	rig := accessRig{
		incident:  &accessState{},
		global:    &globalAccessState{},
		guard:     &hierarchyStub{},
		incidents: &faultyAccessRepo{IncidentAccessRepository: eventstore.NewIncidentAccessRepository(store)},
		groups:    &faultyGroups{AccessGroupRepository: eventstore.NewAccessGroupRepository(store)},
		globals:   &faultyGlobal{GlobalAccessRepository: eventstore.NewGlobalAccessRepository(store)},

		incidentID: shared.IncidentID(newID()),
	}

	// Seed an incident that is owned and restricted, and a group with a member.
	owner := accessOwner
	a := access.NewIncidentAccess(rig.incidentID)
	require.NoError(t, a.Initialize(&owner, access.Restricted, owner, testAt))
	_, err := rig.incidents.IncidentAccessRepository.Save(ctx(), a)
	require.NoError(t, err)

	rig.groupID = uuid.New()
	g := access.NewAccessGroup(rig.groupID)
	require.NoError(t, g.Create("KFS", "Krisenstab", owner, testAt))
	require.NoError(t, g.AddMember("member", owner, testAt))
	_, err = rig.groups.AccessGroupRepository.Save(ctx(), g)
	require.NoError(t, err)

	rig.svc = service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithIncidentAccessChecker(rig.incident),
		service.WithGlobalAccessChecker(rig.global),
		service.WithAccessGuard(rig.guard),
		service.WithIncidentAccessRepository(rig.incidents),
		service.WithAccessGroupRepository(rig.groups),
		service.WithGlobalAccessRepository(rig.globals),
	).AccessService()

	return rig
}

// deny makes the incident check refuse only the given actions.
func (r accessRig) deny(actions ...access.Action) {
	r.incident.deniedActions = map[access.Action]bool{}

	for _, a := range actions {
		r.incident.deniedActions[a] = true
	}
}

type accessOp struct {
	name string
	// kind says what the command needs to work: incident, group, global or default.
	kind string
	run  func(r accessRig) error
}

func accessOps() []accessOp {
	return []accessOp{
		{"GrantIncidentRole", "incident", func(r accessRig) error {
			return r.svc.GrantIncidentRole(ctx(), r.incidentID, someone, access.Viewer, ownerActor)
		}},
		{"RevokeIncidentRole", "incident", func(r accessRig) error {
			return r.svc.RevokeIncidentRole(ctx(), r.incidentID, someone, access.Viewer, ownerActor)
		}},
		{"ChangeIncidentAccessMode", "incident", func(r accessRig) error {
			_, err := r.svc.ChangeIncidentAccessMode(ctx(), r.incidentID, access.OpenOperational, ownerActor)

			return err
		}},
		{"CreateAccessGroup", "create-group", func(r accessRig) error {
			_, err := r.svc.CreateAccessGroup(ctx(), "Neue Gruppe", "", ownerActor)

			return err
		}},
		{"RenameAccessGroup", "group", func(r accessRig) error {
			return r.svc.RenameAccessGroup(ctx(), r.groupID, "Anders", ownerActor)
		}},
		{"UpdateAccessGroupDescription", "group", func(r accessRig) error {
			return r.svc.UpdateAccessGroupDescription(ctx(), r.groupID, "Neu", ownerActor)
		}},
		{"ArchiveAccessGroup", "group", func(r accessRig) error {
			return r.svc.ArchiveAccessGroup(ctx(), r.groupID, ownerActor)
		}},
		{"AddGroupMember", "group", func(r accessRig) error {
			return r.svc.AddGroupMember(ctx(), r.groupID, "newcomer", ownerActor)
		}},
		{"RemoveGroupMember", "group", func(r accessRig) error {
			return r.svc.RemoveGroupMember(ctx(), r.groupID, "member", ownerActor)
		}},
		{"GrantGlobalRole", "global", func(r accessRig) error {
			return r.svc.GrantGlobalRole(ctx(), "admin", access.SystemAdmin, ownerActor)
		}},
		{"RevokeGlobalRole", "global", func(r accessRig) error {
			return r.svc.RevokeGlobalRole(ctx(), "admin", access.GroupAdmin, ownerActor)
		}},
		{"InitializeDefaultAccess", "default", func(r accessRig) error {
			_, err := r.svc.InitializeDefaultAccess(ctx(), access.OpenOperational, nil, ownerActor)

			return err
		}},
		{"SetDefaultAccessMode", "default", func(r accessRig) error {
			_, err := r.svc.SetDefaultAccessMode(ctx(), access.OpenOperational, ownerActor)

			return err
		}},
		{"GrantDefaultRole", "default", func(r accessRig) error {
			_, err := r.svc.GrantDefaultRole(ctx(), someone, access.Viewer, ownerActor)

			return err
		}},
		{"RevokeDefaultRole", "default", func(r accessRig) error {
			_, err := r.svc.RevokeDefaultRole(ctx(), someone, access.Viewer, ownerActor)

			return err
		}},
	}
}

func TestAccessService_CommandsReportFailures(t *testing.T) {
	for _, op := range accessOps() {
		t.Run(op.name+" works when nothing is wrong", func(t *testing.T) {
			require.NoError(t, op.run(newAccessRig(t)))
		})

		t.Run(op.name+" without permission", func(t *testing.T) {
			r := newAccessRig(t)

			if op.kind == "incident" {
				r.incident.denied = true
			} else {
				r.global.denied = true
			}

			require.ErrorIs(t, op.run(r), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r := newAccessRig(t)

			if op.kind == "incident" {
				r.incident.err = errBoom
			} else {
				r.global.err = errBoom
			}

			require.ErrorIs(t, op.run(r), errBoom)
		})

		if op.kind == "incident" || op.kind == "group" || op.kind == "default" {
			t.Run(op.name+" when the guard cannot be locked", func(t *testing.T) {
				r := newAccessRig(t)
				r.guard.lockErr = errBoom

				require.ErrorIs(t, op.run(r), errBoom)
			})

			t.Run(op.name+" lets go of the guard", func(t *testing.T) {
				r := newAccessRig(t)
				require.NoError(t, op.run(r))

				assert.Equal(t, 1, r.guard.locks)
				assert.Equal(t, r.guard.locks, r.guard.released)
			})
		}

		if op.kind == "incident" || op.kind == "group" {
			t.Run(op.name+" on something that does not exist", func(t *testing.T) {
				r := newAccessRig(t)
				r.incidentID = shared.IncidentID(newID())
				r.groupID = uuid.New()

				require.ErrorIs(t, op.run(r), shared.ErrNotFound)
			})

			t.Run(op.name+" when it cannot be loaded", func(t *testing.T) {
				r := newAccessRig(t)
				r.incidents.load, r.groups.load = errBoom, errBoom

				require.ErrorIs(t, op.run(r), errBoom)
			})
		}

		t.Run(op.name+" when the result cannot be saved", func(t *testing.T) {
			r := newAccessRig(t)
			r.incidents.save, r.groups.save, r.globals.save = errBoom, errBoom, errBoom

			require.ErrorIs(t, op.run(r), errBoom)
		})

		if op.kind == "default" || op.kind == "global" {
			t.Run(op.name+" when the stored state cannot be loaded", func(t *testing.T) {
				r := newAccessRig(t)
				r.incidents.load, r.globals.load = errBoom, errBoom

				require.ErrorIs(t, op.run(r), errBoom)
			})
		}
	}
}

func TestAccessService_Bootstrap(t *testing.T) {
	t.Run("a failing store is reported", func(t *testing.T) {
		r := newAccessRig(t)
		r.globals.load = errBoom

		require.ErrorIs(t, r.svc.BootstrapFirstSystemAdmin(ctx(), "admin", ownerActor), errBoom)
	})
}

func TestAccessService_GrantIncidentRole_Rules(t *testing.T) {
	t.Run("only an owner may hand out ownership of an owned incident", func(t *testing.T) {
		r := newAccessRig(t)
		r.deny(access.IncidentDelete)

		err := r.svc.GrantIncidentRole(ctx(), r.incidentID, someone, access.Owner, ownerActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("an owner may", func(t *testing.T) {
		r := newAccessRig(t)

		require.NoError(t, r.svc.GrantIncidentRole(ctx(), r.incidentID, someone, access.Owner, ownerActor))
	})

	t.Run("a group is given a role by its id", func(t *testing.T) {
		r := newAccessRig(t)
		group := access.Principal{Kind: access.GroupPrincipal, ID: r.groupID.String()}

		require.NoError(t, r.svc.GrantIncidentRole(ctx(), r.incidentID, group, access.Editor, ownerActor))
	})

	t.Run("an id that is no group id is rejected", func(t *testing.T) {
		r := newAccessRig(t)
		group := access.Principal{Kind: access.GroupPrincipal, ID: "not-a-uuid"}

		err := r.svc.GrantIncidentRole(ctx(), r.incidentID, group, access.Editor, ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a group that does not exist", func(t *testing.T) {
		r := newAccessRig(t)
		group := access.Principal{Kind: access.GroupPrincipal, ID: uuid.NewString()}

		err := r.svc.GrantIncidentRole(ctx(), r.incidentID, group, access.Editor, ownerActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a group that was archived", func(t *testing.T) {
		r := newAccessRig(t)
		require.NoError(t, r.svc.ArchiveAccessGroup(ctx(), r.groupID, ownerActor))
		group := access.Principal{Kind: access.GroupPrincipal, ID: r.groupID.String()}

		err := r.svc.GrantIncidentRole(ctx(), r.incidentID, group, access.Editor, ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a role that does not exist", func(t *testing.T) {
		r := newAccessRig(t)

		err := r.svc.GrantIncidentRole(ctx(), r.incidentID, someone, access.Role("god"), ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestAccessService_RevokeIncidentRole_Rules(t *testing.T) {
	t.Run("only an owner may take ownership away", func(t *testing.T) {
		r := newAccessRig(t)
		r.deny(access.IncidentDelete)

		err := r.svc.RevokeIncidentRole(ctx(), r.incidentID,
			access.Principal{Kind: access.UserPrincipal, ID: accessOwner}, access.Owner, ownerActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("the last owner stays", func(t *testing.T) {
		r := newAccessRig(t)

		err := r.svc.RevokeIncidentRole(ctx(), r.incidentID,
			access.Principal{Kind: access.UserPrincipal, ID: accessOwner}, access.Owner, ownerActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("a role that was given can be taken back", func(t *testing.T) {
		r := newAccessRig(t)
		require.NoError(t, r.svc.GrantIncidentRole(ctx(), r.incidentID, someone, access.Viewer, ownerActor))
		require.NoError(t, r.svc.RevokeIncidentRole(ctx(), r.incidentID, someone, access.Viewer, ownerActor))

		a, err := r.incidents.IncidentAccessRepository.Load(ctx(), r.incidentID)
		require.NoError(t, err)
		assert.False(t, a.HasRole(someone, access.Viewer))
	})
}

func TestAccessService_ChangeIncidentAccessMode_Rules(t *testing.T) {
	t.Run("an owner opens a restricted incident", func(t *testing.T) {
		r := newAccessRig(t)

		mode, err := r.svc.ChangeIncidentAccessMode(ctx(), r.incidentID, access.OpenOperational, ownerActor)
		require.NoError(t, err)
		assert.Equal(t, access.OpenOperational, mode)
	})

	t.Run("someone who may not manage access cannot", func(t *testing.T) {
		r := newAccessRig(t)
		r.incident.denied = true

		mode, err := r.svc.ChangeIncidentAccessMode(ctx(), r.incidentID, access.OpenOperational, ownerActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
		assert.Empty(t, mode)
	})

	t.Run("a mode that does not exist", func(t *testing.T) {
		r := newAccessRig(t)

		_, err := r.svc.ChangeIncidentAccessMode(ctx(), r.incidentID, access.IncidentMode("secret"), ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestAccessService_GroupRules(t *testing.T) {
	t.Run("a group is created with an id", func(t *testing.T) {
		r := newAccessRig(t)

		id, err := r.svc.CreateAccessGroup(ctx(), "Neue Gruppe", "Beschreibung", ownerActor)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, id)

		g, err := r.groups.AccessGroupRepository.Load(ctx(), id)
		require.NoError(t, err)
		assert.Equal(t, "Neue Gruppe", g.Name())
		assert.Equal(t, "Beschreibung", g.Description())
	})

	t.Run("a group needs a name", func(t *testing.T) {
		r := newAccessRig(t)

		_, err := r.svc.CreateAccessGroup(ctx(), " ", "", ownerActor)
		require.Error(t, err)
		assert.Zero(t, r.groups.saves)
	})

	t.Run("members are added and removed", func(t *testing.T) {
		r := newAccessRig(t)

		require.NoError(t, r.svc.AddGroupMember(ctx(), r.groupID, "newcomer", ownerActor))
		require.NoError(t, r.svc.RemoveGroupMember(ctx(), r.groupID, "member", ownerActor))

		g, err := r.groups.AccessGroupRepository.Load(ctx(), r.groupID)
		require.NoError(t, err)
		assert.True(t, g.HasMember("newcomer"))
		assert.False(t, g.HasMember("member"))
	})

	t.Run("an archived group cannot be changed", func(t *testing.T) {
		r := newAccessRig(t)
		require.NoError(t, r.svc.ArchiveAccessGroup(ctx(), r.groupID, ownerActor))

		require.Error(t, r.svc.RenameAccessGroup(ctx(), r.groupID, "Anders", ownerActor))
		require.Error(t, r.svc.AddGroupMember(ctx(), r.groupID, "newcomer", ownerActor))
	})
}

func TestAccessService_GlobalRules(t *testing.T) {
	t.Run("a role is given and, while another admin remains, taken back", func(t *testing.T) {
		r := newAccessRig(t)

		require.NoError(t, r.svc.GrantGlobalRole(ctx(), "admin-1", access.SystemAdmin, ownerActor))
		require.NoError(t, r.svc.GrantGlobalRole(ctx(), "admin-2", access.SystemAdmin, ownerActor))
		require.NoError(t, r.svc.RevokeGlobalRole(ctx(), "admin-1", access.SystemAdmin, ownerActor))

		g, err := r.globals.GlobalAccessRepository.Load(ctx())
		require.NoError(t, err)
		assert.True(t, g.HasRole("admin-2", access.SystemAdmin))
		assert.False(t, g.HasRole("admin-1", access.SystemAdmin))
	})

	t.Run("a role that does not exist", func(t *testing.T) {
		r := newAccessRig(t)

		err := r.svc.GrantGlobalRole(ctx(), "admin", access.GlobalRole("root"), ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestAccessService_DefaultAccess_Rules(t *testing.T) {
	t.Run("a template is made restricted before its first change", func(t *testing.T) {
		r := newAccessRig(t)

		res, err := r.svc.GrantDefaultRole(ctx(), someone, access.Viewer, ownerActor)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, res.Mode)
		assert.Contains(t, res.Grants, access.Grant{Principal: someone, Role: access.Viewer})
	})

	t.Run("a grant that is not valid stops the initialisation", func(t *testing.T) {
		r := newAccessRig(t)
		invalid := access.Grant{Principal: someone, Role: access.Role("god")}

		_, err := r.svc.InitializeDefaultAccess(ctx(), access.Restricted, []access.Grant{invalid}, ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a mode that does not exist", func(t *testing.T) {
		r := newAccessRig(t)

		_, err := r.svc.SetDefaultAccessMode(ctx(), access.IncidentMode("secret"), ownerActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a role is taken back out of the template", func(t *testing.T) {
		r := newAccessRig(t)
		_, err := r.svc.GrantDefaultRole(ctx(), someone, access.Viewer, ownerActor)
		require.NoError(t, err)

		res, err := r.svc.RevokeDefaultRole(ctx(), someone, access.Viewer, ownerActor)
		require.NoError(t, err)
		assert.NotContains(t, res.Grants, access.Grant{Principal: someone, Role: access.Viewer})
	})
}
