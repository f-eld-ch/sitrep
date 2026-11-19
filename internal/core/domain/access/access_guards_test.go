package access

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var guardTime = time.Unix(1, 0)

func user(id string) Principal  { return Principal{Kind: UserPrincipal, ID: id} }
func group(id string) Principal { return Principal{Kind: GroupPrincipal, ID: id} }

func everyone() Principal { return Principal{Kind: AllPrincipal, ID: AllPrincipalID} }

func replayInto(t *testing.T, target eventsourcing.Aggregate, source interface {
	Root() *eventsourcing.Root
},
) {
	t.Helper()

	for _, event := range source.Root().PendingEvents() {
		event.Data = mustJSON(t, event.Data)
		require.NoError(t, eventsourcing.Apply(target, event))
	}
}

func TestValidateGrant(t *testing.T) {
	tests := []struct {
		name    string
		grant   Grant
		wantErr bool
	}{
		{"valid user viewer", Grant{Principal: user("u"), Role: Viewer}, false},
		{"valid group owner", Grant{Principal: group("g"), Role: Owner}, false},
		{"all principal viewer", Grant{Principal: everyone(), Role: Viewer}, false},
		{"all principal editor", Grant{Principal: everyone(), Role: Editor}, false},
		{"all principal manager", Grant{Principal: everyone(), Role: Manager}, true},
		{"all principal wrong id", Grant{Principal: Principal{Kind: AllPrincipal, ID: "x"}, Role: Viewer}, true},
		{"empty user id", Grant{Principal: user("  "), Role: Viewer}, true},
		{"empty group id", Grant{Principal: group(""), Role: Viewer}, true},
		{"unknown kind", Grant{Principal: Principal{Kind: "robot", ID: "r"}, Role: Viewer}, true},
		{"unknown role", Grant{Principal: user("u"), Role: Role("god")}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateGrant(tt.grant)
			if tt.wantErr {
				require.ErrorIs(t, err, shared.ErrInvalidInput)

				return
			}

			require.NoError(t, err)
		})
	}
}

func TestIncidentAccessInitializeGuards(t *testing.T) {
	tests := []struct {
		name  string
		owner *string
		mode  IncidentMode
	}{
		{"invalid mode", new("u"), IncidentMode("bogus")},
		{"restricted without owner", nil, Restricted},
		{"blank owner", new("   "), OpenOperational},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := NewIncidentAccess(shared.IncidentID(uuid.New()))
			require.ErrorIs(t, a.Initialize(tt.owner, tt.mode, "actor", guardTime), shared.ErrInvalidInput)
			assert.Empty(t, a.Root().PendingEvents())
		})
	}
}

func TestIncidentAccessInitializeTemplate(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(DefaultAccessTemplateID))

	require.ErrorIs(t, a.InitializeTemplate(IncidentMode("bogus"), "admin", guardTime), shared.ErrInvalidInput)

	require.NoError(t, a.InitializeTemplate(Restricted, "admin", guardTime))
	assert.Equal(t, Restricted, a.Mode())
	assert.False(t, a.HasAnyOwner(), "a template has no owner even when restricted")
	assert.False(t, a.HasDirectUserOwner())
	assert.Equal(t, a.Root().ID(), a.OwnerIncidentID())
	assert.Equal(t, "IncidentAccess", a.AggregateType())
}

func TestIncidentAccessOwnerQueries(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, a.Initialize(nil, OpenOperational, "sys", guardTime))
	assert.False(t, a.HasAnyOwner())
	assert.False(t, a.HasDirectUserOwner())

	require.NoError(t, a.GrantRole(group("g"), Owner, "sys", guardTime))
	assert.True(t, a.HasAnyOwner())
	assert.False(t, a.HasDirectUserOwner(), "a group owner is not a direct user owner")
	assert.False(t, a.IsOwner("g"))

	require.NoError(t, a.GrantRole(user("u"), Owner, "sys", guardTime))
	assert.True(t, a.HasDirectUserOwner())
	assert.True(t, a.IsOwner("u"))
}

func TestIncidentAccessGrants(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, a.Initialize(new("o"), OpenOperational, "o", guardTime))
	require.NoError(t, a.GrantRole(group("g"), Editor, "o", guardTime))
	require.NoError(t, a.GrantRole(everyone(), Viewer, "o", guardTime))
	require.NoError(t, a.GrantRole(user("v"), Viewer, "o", guardTime))
	require.NoError(t, a.RevokeRole(user("v"), Viewer, "o", guardTime))

	assert.ElementsMatch(t, []Grant{
		{Principal: user("o"), Role: Owner},
		{Principal: group("g"), Role: Editor},
		{Principal: everyone(), Role: Viewer},
	}, a.Grants())
}

func TestIncidentAccessGrantRoleGuards(t *testing.T) {
	tests := []struct {
		name string
		p    Principal
		role Role
	}{
		{"empty principal id", user(""), Viewer},
		{"invalid kind", Principal{Kind: "x", ID: "y"}, Viewer},
		{"invalid role", user("u"), Role("nope")},
		{"all principal as manager", everyone(), Manager},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := NewIncidentAccess(shared.IncidentID(uuid.New()))
			require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
			before := len(a.Root().PendingEvents())

			require.ErrorIs(t, a.GrantRole(tt.p, tt.role, "o", guardTime), shared.ErrInvalidInput)
			assert.Len(t, a.Root().PendingEvents(), before)
		})
	}
}

func TestIncidentAccessGrantRoleIsIdempotent(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
	require.NoError(t, a.GrantRole(user("u"), Viewer, "o", guardTime))
	before := len(a.Root().PendingEvents())

	require.NoError(t, a.GrantRole(user("u"), Viewer, "o", guardTime))
	assert.Len(t, a.Root().PendingEvents(), before, "re-granting the held role records nothing")
}

func TestIncidentAccessGrantOwnerReplacingNonLastOwner(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, a.Initialize(new("o1"), Restricted, "o1", guardTime))
	require.NoError(t, a.GrantRole(user("o2"), Owner, "o1", guardTime))

	require.NoError(t, a.GrantRole(user("o2"), Viewer, "o1", guardTime))
	assert.False(t, a.IsOwner("o2"))
	assert.True(t, a.HasRole(user("o2"), Viewer))
	assert.True(t, a.IsOwner("o1"))
}

func TestIncidentAccessRevokeRole(t *testing.T) {
	newAccess := func(t *testing.T) *IncidentAccess {
		t.Helper()

		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
		require.NoError(t, a.GrantRole(user("u"), Editor, "o", guardTime))

		return a
	}

	t.Run("revokes a held role", func(t *testing.T) {
		a := newAccess(t)
		require.NoError(t, a.RevokeRole(user("u"), Editor, "o", guardTime))
		assert.False(t, a.HasRole(user("u"), Editor))
	})

	t.Run("revoking a role not held is a no-op", func(t *testing.T) {
		a := newAccess(t)
		before := len(a.Root().PendingEvents())
		require.NoError(t, a.RevokeRole(user("u"), Viewer, "o", guardTime))
		assert.Len(t, a.Root().PendingEvents(), before)
	})

	t.Run("invalid principal", func(t *testing.T) {
		require.ErrorIs(t, newAccess(t).RevokeRole(user(""), Editor, "o", guardTime), shared.ErrInvalidInput)
	})

	t.Run("invalid role", func(t *testing.T) {
		require.ErrorIs(t, newAccess(t).RevokeRole(user("u"), Role("x"), "o", guardTime), shared.ErrInvalidInput)
	})

	t.Run("a non-last owner can be revoked", func(t *testing.T) {
		a := newAccess(t)
		require.NoError(t, a.GrantRole(user("o2"), Owner, "o", guardTime))
		require.NoError(t, a.RevokeRole(user("o"), Owner, "o", guardTime))
		assert.False(t, a.IsOwner("o"))
	})
}

func TestIncidentAccessChangeAccessMode(t *testing.T) {
	t.Run("invalid mode", func(t *testing.T) {
		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
		require.ErrorIs(t, a.ChangeAccessMode(IncidentMode("x"), "o", guardTime), shared.ErrInvalidInput)
	})

	t.Run("same mode is a no-op", func(t *testing.T) {
		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
		before := len(a.Root().PendingEvents())
		require.NoError(t, a.ChangeAccessMode(Restricted, "o", guardTime))
		assert.Len(t, a.Root().PendingEvents(), before)
	})

	t.Run("restricting with an owner does not add one", func(t *testing.T) {
		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(new("o"), OpenOperational, "o", guardTime))
		require.NoError(t, a.ChangeAccessMode(Restricted, "someone", guardTime))
		assert.Equal(t, Restricted, a.Mode())
		assert.False(t, a.IsOwner("someone"))
	})

	t.Run("restricting with only a group owner makes the actor owner", func(t *testing.T) {
		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(nil, OpenOperational, "sys", guardTime))
		require.NoError(t, a.GrantRole(group("g"), Owner, "sys", guardTime))
		require.NoError(t, a.ChangeAccessMode(Restricted, "claimer", guardTime))
		assert.True(t, a.IsOwner("claimer"))
	})

	t.Run("opening a restricted incident", func(t *testing.T) {
		a := NewIncidentAccess(shared.IncidentID(uuid.New()))
		require.NoError(t, a.Initialize(new("o"), Restricted, "o", guardTime))
		require.NoError(t, a.ChangeAccessMode(OpenOperational, "o", guardTime))
		assert.Equal(t, OpenOperational, a.Mode())
	})
}

func TestIncidentAccessTransitionRejectsUnknownEvent(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.Error(t, a.Transition(eventsourcing.Event{Data: struct{}{}}))
}

func TestIncidentAccessReplayRevokeAndModeChange(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	require.NoError(t, a.Initialize(new("o"), OpenOperational, "o", guardTime))
	require.NoError(t, a.GrantRole(user("u"), Viewer, "o", guardTime))
	require.NoError(t, a.RevokeRole(user("u"), Viewer, "o", guardTime))
	require.NoError(t, a.ChangeAccessMode(Restricted, "o", guardTime))

	replayed := NewIncidentAccess(shared.IncidentID(a.Root().ID()))
	replayInto(t, replayed, a)

	assert.Equal(t, Restricted, replayed.Mode())
	assert.False(t, replayed.HasRole(user("u"), Viewer))
	assert.True(t, replayed.IsOwner("o"))
}

func TestGlobalAccessGuards(t *testing.T) {
	tests := []struct {
		name    string
		subject string
		role    GlobalRole
	}{
		{"blank subject", "  ", SystemAdmin},
		{"unknown role", "u", GlobalRole("root")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := NewGlobalAccess()
			require.ErrorIs(t, a.GrantRole(tt.subject, tt.role, "x", guardTime), shared.ErrInvalidInput)
			assert.Empty(t, a.Root().PendingEvents())
		})
	}
}

func TestGlobalAccessGrantRevokeAndQueries(t *testing.T) {
	a := NewGlobalAccess()
	require.NoError(t, a.Initialize("sys", guardTime))
	assert.Equal(t, "GlobalAccess", a.AggregateType())
	assert.Empty(t, a.SubjectsWithRole(SystemAdmin))

	require.NoError(t, a.GrantRole("a1", SystemAdmin, "sys", guardTime))
	require.NoError(t, a.GrantRole("a2", SystemAdmin, "sys", guardTime))
	require.NoError(t, a.GrantRole("g1", GroupAdmin, "sys", guardTime))

	before := len(a.Root().PendingEvents())
	require.NoError(t, a.GrantRole("a1", SystemAdmin, "sys", guardTime))
	assert.Len(t, a.Root().PendingEvents(), before, "granting a held role is a no-op")

	assert.ElementsMatch(t, []string{"a1", "a2"}, a.SubjectsWithRole(SystemAdmin))
	assert.ElementsMatch(t, []string{"g1"}, a.SubjectsWithRole(GroupAdmin))

	require.NoError(t, a.RevokeRole("a1", SystemAdmin, "sys", guardTime), "not the last admin")
	assert.False(t, a.HasRole("a1", SystemAdmin))

	require.NoError(t, a.RevokeRole("nobody", SystemAdmin, "sys", guardTime), "revoking an unheld role is a no-op")
	require.ErrorIs(t, a.RevokeRole("a2", SystemAdmin, "sys", guardTime), shared.ErrForbidden)
	require.NoError(t, a.RevokeRole("g1", GroupAdmin, "sys", guardTime), "group admins are not protected")
	assert.False(t, a.HasRole("g1", GroupAdmin))
}

func TestGlobalAccessReplayAndUnknownEvent(t *testing.T) {
	a := NewGlobalAccess()
	require.NoError(t, a.Initialize("sys", guardTime))
	require.NoError(t, a.GrantRole("a1", SystemAdmin, "sys", guardTime))
	require.NoError(t, a.GrantRole("a2", SystemAdmin, "sys", guardTime))
	require.NoError(t, a.RevokeRole("a1", SystemAdmin, "sys", guardTime))

	replayed := NewGlobalAccess()
	replayInto(t, replayed, a)

	assert.False(t, replayed.HasRole("a1", SystemAdmin))
	assert.True(t, replayed.HasRole("a2", SystemAdmin))
	require.Error(t, replayed.Transition(eventsourcing.Event{Data: struct{}{}}))
}

func TestAccessGroupGuards(t *testing.T) {
	long := strings.Repeat("x", 65)

	newGroup := func(t *testing.T) *AccessGroup {
		t.Helper()

		g := NewAccessGroup(uuid.New())
		require.NoError(t, g.Create("Ops", "desc", "a", guardTime))

		return g
	}

	t.Run("create validates the name", func(t *testing.T) {
		require.ErrorIs(t, NewAccessGroup(uuid.New()).Create("  ", "", "a", guardTime), shared.ErrInvalidInput)
		require.ErrorIs(t, NewAccessGroup(uuid.New()).Create(long, "", "a", guardTime), shared.ErrInvalidInput)
		require.NoError(t, NewAccessGroup(uuid.New()).Create(strings.Repeat("x", 64), "", "a", guardTime))
	})

	t.Run("rename", func(t *testing.T) {
		g := newGroup(t)
		require.ErrorIs(t, g.Rename("", "a", guardTime), shared.ErrInvalidInput)
		require.ErrorIs(t, g.Rename(long, "a", guardTime), shared.ErrInvalidInput)

		before := len(g.Root().PendingEvents())
		require.NoError(t, g.Rename("Ops", "a", guardTime))
		assert.Len(t, g.Root().PendingEvents(), before, "same name is a no-op")

		require.NoError(t, g.Rename("Staff", "a", guardTime))
		assert.Equal(t, "Staff", g.Name())
	})

	t.Run("description", func(t *testing.T) {
		g := newGroup(t)
		before := len(g.Root().PendingEvents())
		require.NoError(t, g.UpdateDescription("desc", "a", guardTime))
		assert.Len(t, g.Root().PendingEvents(), before, "same description is a no-op")

		require.NoError(t, g.UpdateDescription("new", "a", guardTime))
		assert.Equal(t, "new", g.Description())
	})

	t.Run("members", func(t *testing.T) {
		g := newGroup(t)
		require.ErrorIs(t, g.AddMember(" ", "a", guardTime), shared.ErrInvalidInput)
		require.NoError(t, g.AddMember("u", "a", guardTime))

		before := len(g.Root().PendingEvents())
		require.NoError(t, g.AddMember("u", "a", guardTime))
		require.NoError(t, g.RemoveMember("ghost", "a", guardTime))
		assert.Len(t, g.Root().PendingEvents(), before, "duplicate add and unknown remove are no-ops")

		require.NoError(t, g.RemoveMember("u", "a", guardTime))
		assert.False(t, g.HasMember("u"))
	})

	t.Run("archived groups are frozen", func(t *testing.T) {
		g := newGroup(t)
		require.NoError(t, g.Archive("a", guardTime))

		before := len(g.Root().PendingEvents())
		require.NoError(t, g.Archive("a", guardTime), "archiving twice is a no-op")
		assert.Len(t, g.Root().PendingEvents(), before)

		require.ErrorIs(t, g.Rename("Other", "a", guardTime), shared.ErrInvalidInput)
		require.ErrorIs(t, g.UpdateDescription("other", "a", guardTime), shared.ErrInvalidInput)
		require.ErrorIs(t, g.AddMember("u", "a", guardTime), shared.ErrInvalidInput)
	})

	t.Run("replay of all events", func(t *testing.T) {
		g := newGroup(t)
		require.NoError(t, g.Rename("Staff", "a", guardTime))
		require.NoError(t, g.UpdateDescription("new", "a", guardTime))
		require.NoError(t, g.AddMember("u", "a", guardTime))
		require.NoError(t, g.AddMember("v", "a", guardTime))
		require.NoError(t, g.RemoveMember("u", "a", guardTime))

		replayed := NewAccessGroup(g.Root().ID())
		replayInto(t, replayed, g)

		assert.Equal(t, "Staff", replayed.Name())
		assert.Equal(t, "new", replayed.Description())
		assert.False(t, replayed.HasMember("u"))
		assert.True(t, replayed.HasMember("v"))
		assert.Equal(t, "AccessGroup", replayed.AggregateType())
		require.Error(t, replayed.Transition(eventsourcing.Event{Data: struct{}{}}))
	})
}
