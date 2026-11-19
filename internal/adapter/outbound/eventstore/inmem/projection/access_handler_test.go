package projection_test

import (
	"slices"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func initAccess(inc uuid.UUID, mode string, owner *string) eventsourcing.Event {
	data := obj{"mode": mode}
	if owner != nil {
		data["ownerSub"] = *owner
	}

	return evt("IncidentAccess", inc, "AccessInitialized", data, tm(0))
}

func roleEvent(inc uuid.UUID, eventType, kind, principal, role string) eventsourcing.Event {
	return evt("IncidentAccess", inc, eventType,
		obj{"principal": obj{"kind": kind, "id": principal}, "role": role}, tm(1))
}

func groupEvent(group uuid.UUID, eventType string, data obj) eventsourcing.Event {
	return evt("AccessGroup", group, eventType, data, tm(1))
}

func globalEvent(eventType string, data obj) eventsourcing.Event {
	return evt("GlobalAccess", access.GlobalAccessID, eventType, data, tm(1))
}

// actionsOf lists the actions the projection grants subject in domain, sorted.
func actionsOf(h *projection.AccessHandler, subject, domain string) []string {
	var out []string

	for _, row := range h.Policies() {
		if row.Subject == subject && row.Domain == domain {
			out = append(out, row.Action)
		}
	}

	slices.Sort(out)

	return out
}

func TestAccessHandler_Metadata(t *testing.T) {
	h := projection.NewAccessHandler()

	assert.Equal(t, "readmodel.access", h.Name())
	assert.Positive(t, h.Version())

	for _, st := range []string{"IncidentAccess", "AccessGroup", "GlobalAccess"} {
		assert.True(t, h.Handles(st, "AnyEvent"), st)
	}

	assert.False(t, h.Handles("Incident", "Opened"))
}

func TestAccessHandler_RolesGrantTheActionsOfTheirLevel(t *testing.T) {
	// Which actions each role receives on a restricted incident.
	tests := []struct {
		role    string
		granted []access.Action
		denied  []access.Action
	}{
		{
			"owner",
			[]access.Action{
				access.IncidentDelete,
				access.IncidentManageAccess,
				access.IncidentClose,
				access.FeatureWrite,
			},
			nil,
		},
		{
			"manager",
			[]access.Action{
				access.IncidentClose,
				access.IncidentReopen,
				access.IncidentManageAccess,
				access.LayerDelete,
			},
			[]access.Action{access.IncidentDelete},
		},
		{
			"editor",
			[]access.Action{access.IncidentWrite, access.MessageWrite, access.LayerCreate, access.FeatureWrite},
			[]access.Action{access.IncidentClose, access.IncidentManageAccess, access.IncidentDelete},
		},
		{
			"viewer",
			[]access.Action{access.IncidentRead, access.MessageRead, access.LayerRead},
			[]access.Action{access.IncidentWrite, access.MessageWrite, access.LayerWrite},
		},
	}

	for _, tc := range tests {
		t.Run(tc.role, func(t *testing.T) {
			h := projection.NewAccessHandler()
			inc := uuid.New()
			owner := "someone"

			applyAll(t, h,
				initAccess(inc, "restricted", &owner),
				roleEvent(inc, "RoleGranted", "user", "u1", tc.role),
			)

			got := actionsOf(h, "user:u1", "incident:"+inc.String())
			for _, a := range tc.granted {
				assert.Contains(t, got, string(a))
			}

			for _, a := range tc.denied {
				assert.NotContains(t, got, string(a))
			}
		})
	}
}

func TestAccessHandler_PolicyRowsCarryTheirObject(t *testing.T) {
	h := projection.NewAccessHandler()
	inc := uuid.New()
	owner := "o"

	applyAll(t, h, initAccess(inc, "restricted", &owner))

	assert.Contains(t, h.Policies(), projection.AccessPolicyRow{
		Subject: "user:o", Domain: "incident:" + inc.String(), Object: "message", Action: "message.read",
	})
	assert.Contains(t, h.Policies(), projection.AccessPolicyRow{
		Subject: "user:o", Domain: "incident:" + inc.String(), Object: "layer", Action: "layer.create",
	})
}

func TestAccessHandler_OpenIncidentsOnlyGateDeletion(t *testing.T) {
	h := projection.NewAccessHandler()
	inc := uuid.New()
	owner := "o"

	applyAll(t, h,
		initAccess(inc, "open_operational", &owner),
		roleEvent(inc, "RoleGranted", "user", "ed", "editor"),
	)

	domain := "incident:" + inc.String()
	assert.Equal(t, []string{"incident.delete"}, actionsOf(h, "user:o", domain), "only the owner may delete")
	assert.Empty(t, actionsOf(h, "user:ed", domain), "an editor needs no policy on an open incident")

	applyAll(t, h, evt("IncidentAccess", inc, "AccessModeChanged", obj{"mode": "restricted"}, tm(2)))

	assert.Contains(
		t,
		actionsOf(h, "user:ed", domain),
		"incident.write",
		"restricting the incident activates the roles",
	)
	assert.Equal(t, access.Restricted, h.Mode(inc))
}

func TestAccessHandler_GrantsRevocationsAndEveryone(t *testing.T) {
	h := projection.NewAccessHandler()
	inc := uuid.New()
	owner := "o"

	applyAll(t, h,
		initAccess(inc, "restricted", &owner),
		roleEvent(inc, "RoleGranted", "all", access.AllPrincipalID, "viewer"),
		roleEvent(inc, "RoleGranted", "user", "u1", "viewer"),
	)

	domain := "incident:" + inc.String()
	assert.Equal(t, []string{"incident.read", "layer.read", "message.read"}, actionsOf(h, "all", domain))
	assert.Len(t, h.IncidentGrants(inc), 3)

	applyAll(t, h,
		roleEvent(inc, "RoleRevoked", "user", "u1", "viewer"),
		roleEvent(inc, "RoleRevoked", "all", access.AllPrincipalID, "viewer"),
	)

	assert.Empty(t, actionsOf(h, "user:u1", domain))
	assert.Empty(t, actionsOf(h, "all", domain))
	assert.Equal(t, []projection.IncidentGrantRow{
		{IncidentID: inc, PrincipalKind: access.UserPrincipal, PrincipalID: "o", Role: access.Owner},
	}, h.IncidentGrants(inc))
}

func TestAccessHandler_GroupMembersInheritTheGroupsRole(t *testing.T) {
	h := projection.NewAccessHandler()
	inc, group := uuid.New(), uuid.New()
	owner := "o"

	applyAll(t, h,
		initAccess(inc, "restricted", &owner),
		groupEvent(group, "GroupCreated", obj{"name": "Ops", "description": "d"}),
		groupEvent(group, "GroupMemberAdded", obj{"subject": "m1"}),
		groupEvent(group, "GroupMemberAdded", obj{"subject": "m2"}),
		roleEvent(inc, "RoleGranted", "group", group.String(), "editor"),
	)

	domain := "incident:" + inc.String()
	assert.Contains(t, actionsOf(h, "user:m1", domain), "message.write")
	assert.Contains(t, actionsOf(h, "user:m2", domain), "message.write")

	t.Run("a removed member loses access", func(t *testing.T) {
		applyAll(t, h, groupEvent(group, "GroupMemberRemoved", obj{"subject": "m2"}))
		assert.Empty(t, actionsOf(h, "user:m2", domain))
		assert.NotEmpty(t, actionsOf(h, "user:m1", domain))
	})

	t.Run("group details", func(t *testing.T) {
		applyAll(t, h,
			groupEvent(group, "GroupRenamed", obj{"name": "Operations"}),
			groupEvent(group, "GroupDescriptionChanged", obj{"description": "new"}),
		)

		got := h.Groups()[group]
		assert.Equal(t, "Operations", got.Name)
		assert.Equal(t, "new", got.Description)
		assert.Equal(t, []string{"m1"}, got.Members)
		assert.Nil(t, got.ArchivedAt)
	})

	t.Run("an archived group no longer grants access", func(t *testing.T) {
		applyAll(t, h, groupEvent(group, "GroupArchived", obj{}))
		assert.Empty(t, actionsOf(h, "user:m1", domain))

		got := h.Groups()[group]
		require.NotNil(t, got.ArchivedAt)
		assert.Equal(t, tm(1), *got.ArchivedAt)
	})

	t.Run("a group grant with a malformed principal id is ignored", func(t *testing.T) {
		h := projection.NewAccessHandler()
		applyAll(t, h,
			initAccess(inc, "restricted", &owner),
			roleEvent(inc, "RoleGranted", "group", "not-a-uuid", "editor"),
		)

		assert.NotEmpty(t, actionsOf(h, "user:o", "incident:"+inc.String()), "the owner's policies are unaffected")
		assert.Empty(t, h.Groups(), "no group is invented for the malformed id")
	})
}

func TestAccessHandler_DefaultTemplateGrantsNoPolicies(t *testing.T) {
	h := projection.NewAccessHandler()

	mode, known := h.DefaultIncidentMode()
	assert.False(t, known)
	assert.Equal(t, access.Restricted, mode)
	assert.Empty(t, h.DefaultGrants())

	tmpl := access.DefaultAccessTemplateID
	applyAll(t, h,
		initAccess(tmpl, "open_operational", nil),
		roleEvent(tmpl, "RoleGranted", "group", uuid.NewString(), "editor"),
	)

	mode, known = h.DefaultIncidentMode()
	assert.True(t, known)
	assert.Equal(t, access.OpenOperational, mode)
	require.Len(t, h.DefaultGrants(), 1)
	assert.Equal(t, access.Editor, h.DefaultGrants()[0].Role)
	assert.Equal(t, access.GroupPrincipal, h.DefaultGrants()[0].Principal.Kind)
	assert.Empty(t, h.Policies(), "the template is not a real incident")

	other := uuid.New()
	applyAll(t, h, roleEvent(other, "RoleGranted", "user", "u", "viewer"))
	assert.Len(t, h.DefaultGrants(), 1, "grants of other incidents are not template grants")
}

func TestAccessHandler_GlobalRoles(t *testing.T) {
	h := projection.NewAccessHandler()

	applyAll(t, h,
		globalEvent("GlobalAccessInitialized", obj{}),
		globalEvent("GlobalRoleGranted", obj{"subject": "root", "role": "system_admin"}),
		globalEvent("GlobalRoleGranted", obj{"subject": "gadmin", "role": "group_admin"}),
		globalEvent("GlobalRoleGranted", obj{"subject": "other", "role": "unknown_role"}),
	)

	assert.Equal(t, []string{"group.manage", "system_admin.manage"}, actionsOf(h, "user:root", "global"))
	assert.Equal(t, []string{"group.manage"}, actionsOf(h, "user:gadmin", "global"))
	assert.Empty(t, actionsOf(h, "user:other", "global"), "an unknown role grants nothing")

	roles := h.GlobalRoles()
	assert.Equal(t, []access.GlobalRole{access.SystemAdmin}, roles["root"])
	assert.Equal(t, []access.GlobalRole{access.GroupAdmin}, roles["gadmin"])

	applyAll(t, h, globalEvent("GlobalRoleRevoked", obj{"subject": "gadmin", "role": "group_admin"}))

	assert.Empty(t, actionsOf(h, "user:gadmin", "global"))
	assert.Empty(t, h.GlobalRoles()["gadmin"])
}

func TestAccessHandler_ReplayIsIdempotent(t *testing.T) {
	h := projection.NewAccessHandler()
	inc, group := uuid.New(), uuid.New()
	owner := "o"

	log := []eventsourcing.Event{
		initAccess(inc, "restricted", &owner),
		groupEvent(group, "GroupCreated", obj{"name": "Ops"}),
		groupEvent(group, "GroupMemberAdded", obj{"subject": "m1"}),
		roleEvent(inc, "RoleGranted", "group", group.String(), "viewer"),
		globalEvent("GlobalRoleGranted", obj{"subject": "root", "role": "system_admin"}),
		roleEvent(inc, "RoleRevoked", "group", group.String(), "viewer"),
		roleEvent(inc, "RoleGranted", "user", "u", "manager"),
	}

	applyAll(t, h, log...)

	want := h.Policies()
	grants := h.IncidentGrants(inc)

	applyAll(t, h, log...)

	assert.ElementsMatch(t, want, h.Policies())
	assert.ElementsMatch(t, grants, h.IncidentGrants(inc))
}

func TestAccessHandler_ResetClearsEverything(t *testing.T) {
	h := projection.NewAccessHandler()
	inc, group := uuid.New(), uuid.New()
	owner := "o"

	applyAll(t, h,
		initAccess(inc, "restricted", &owner),
		groupEvent(group, "GroupCreated", obj{"name": "Ops"}),
		globalEvent("GlobalRoleGranted", obj{"subject": "root", "role": "system_admin"}),
	)

	require.NoError(t, h.Reset(t.Context()))

	assert.Empty(t, h.Policies())
	assert.Empty(t, h.IncidentGrants(inc))
	assert.Empty(t, h.Groups())
	assert.Empty(t, h.GlobalRoles())
	assert.Empty(t, h.Mode(inc))
}

func TestAccessHandler_RejectsUnknownAndMalformedEvents(t *testing.T) {
	inc, group := uuid.New(), uuid.New()

	tests := []struct {
		name  string
		event eventsourcing.Event
	}{
		{"unknown incident event", evt("IncidentAccess", inc, "Nope", obj{}, tm(0))},
		{"unknown group event", evt("AccessGroup", group, "Nope", obj{}, tm(0))},
		{"unknown global event", evt("GlobalAccess", access.GlobalAccessID, "Nope", obj{}, tm(0))},
		{"initialized undecodable", evt("IncidentAccess", inc, "AccessInitialized", "x", tm(0))},
		{"granted undecodable", evt("IncidentAccess", inc, "RoleGranted", "x", tm(0))},
		{"revoked undecodable", evt("IncidentAccess", inc, "RoleRevoked", "x", tm(0))},
		{"mode changed undecodable", evt("IncidentAccess", inc, "AccessModeChanged", "x", tm(0))},
		{"group created undecodable", evt("AccessGroup", group, "GroupCreated", "x", tm(0))},
		{"group renamed undecodable", evt("AccessGroup", group, "GroupRenamed", "x", tm(0))},
		{"group description undecodable", evt("AccessGroup", group, "GroupDescriptionChanged", "x", tm(0))},
		{"member added undecodable", evt("AccessGroup", group, "GroupMemberAdded", "x", tm(0))},
		{"member removed undecodable", evt("AccessGroup", group, "GroupMemberRemoved", "x", tm(0))},
		{"global granted undecodable", evt("GlobalAccess", access.GlobalAccessID, "GlobalRoleGranted", "x", tm(0))},
		{"global revoked undecodable", evt("GlobalAccess", access.GlobalAccessID, "GlobalRoleRevoked", "x", tm(0))},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewAccessHandler()
			require.Error(t, h.Apply(t.Context(), tc.event))
		})
	}

	t.Run("other stream types are not an error", func(t *testing.T) {
		h := projection.NewAccessHandler()
		require.NoError(t, h.Apply(t.Context(), evt("Incident", inc, "Opened", obj{}, tm(0))))
	})
}
