package projection_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var accessAt = time.Unix(100, 0)

func applyAll(t *testing.T, h *projection.AccessHandler, events []eventsourcing.Event) {
	t.Helper()

	for _, e := range events {
		require.NoError(t, h.Apply(context.Background(), e))
	}
}

type accessSnapshot struct {
	policies []projection.AccessPolicyRow
	grants   []projection.IncidentGrantRow
	global   map[string][]access.GlobalRole
	groups   int
}

func snapshot(h *projection.AccessHandler, incidentID uuid.UUID) accessSnapshot {
	return accessSnapshot{
		policies: h.Policies(),
		grants:   h.IncidentGrants(incidentID),
		global:   h.GlobalRoles(),
		groups:   len(h.Groups()),
	}
}

func userP(id string) access.Principal { return access.Principal{Kind: access.UserPrincipal, ID: id} }

func TestAccessHandlerMetadata(t *testing.T) {
	h := projection.NewAccessHandler()

	assert.Equal(t, "readmodel.access", h.Name())
	assert.Positive(t, h.Version())
	assert.True(t, h.Handles("IncidentAccess", ""))
	assert.True(t, h.Handles("AccessGroup", ""))
	assert.True(t, h.Handles("GlobalAccess", ""))
	assert.False(t, h.Handles("Incident", ""))
}

func TestAccessHandlerIgnoresForeignStreamTypes(t *testing.T) {
	h := projection.NewAccessHandler()

	require.NoError(t, h.Apply(context.Background(), eventsourcing.Event{StreamType: "Message", EventType: "Whatever"}))
	assert.Empty(t, h.Policies())
}

func TestAccessHandlerRejectsUnknownEventTypes(t *testing.T) {
	for _, streamType := range []string{"IncidentAccess", "AccessGroup", "GlobalAccess"} {
		t.Run(streamType, func(t *testing.T) {
			h := projection.NewAccessHandler()
			err := h.Apply(context.Background(), eventsourcing.Event{
				StreamType: streamType,
				StreamID:   uuid.New(),
				EventType:  "SomethingElse",
			})
			require.Error(t, err)
		})
	}
}

func TestAccessHandlerIncidentEventsAreIdempotentOnReplay(t *testing.T) {
	incidentID := uuid.New()
	groupID := uuid.New()

	incident := access.NewIncidentAccess(shared.IncidentID(incidentID))
	owner := "owner"
	require.NoError(t, incident.Initialize(&owner, access.OpenOperational, owner, accessAt))
	require.NoError(t, incident.GrantRole(userP("viewer"), access.Viewer, owner, accessAt))
	require.NoError(t, incident.GrantRole(userP("editor"), access.Editor, owner, accessAt))
	require.NoError(t, incident.GrantRole(userP("editor"), access.Manager, owner, accessAt)) // revokes Editor
	require.NoError(t, incident.GrantRole(
		access.Principal{Kind: access.GroupPrincipal, ID: groupID.String()}, access.Editor, owner, accessAt))
	require.NoError(t, incident.GrantRole(
		access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID}, access.Viewer, owner, accessAt))
	require.NoError(t, incident.ChangeAccessMode(access.Restricted, owner, accessAt))
	require.NoError(t, incident.RevokeRole(userP("viewer"), access.Viewer, owner, accessAt))

	group := access.NewAccessGroup(groupID)
	require.NoError(t, group.Create("Ops", "first", "admin", accessAt))
	require.NoError(t, group.Rename("Operations", "admin", accessAt))
	require.NoError(t, group.UpdateDescription("second", "admin", accessAt))
	require.NoError(t, group.AddMember("m1", "admin", accessAt))
	require.NoError(t, group.AddMember("m2", "admin", accessAt))
	require.NoError(t, group.RemoveMember("m2", "admin", accessAt))

	events := append(incident.Root().PendingEvents(), group.Root().PendingEvents()...)

	h := projection.NewAccessHandler()
	applyAll(t, h, events)

	once := snapshot(h, incidentID)

	incidentKey := "incident:" + incidentID.String()
	assert.Equal(t, access.Restricted, h.Mode(incidentID))
	assert.ElementsMatch(t, []projection.IncidentGrantRow{
		{IncidentID: incidentID, PrincipalKind: access.UserPrincipal, PrincipalID: "owner", Role: access.Owner},
		{IncidentID: incidentID, PrincipalKind: access.UserPrincipal, PrincipalID: "editor", Role: access.Manager},
		{
			IncidentID:    incidentID,
			PrincipalKind: access.GroupPrincipal,
			PrincipalID:   groupID.String(),
			Role:          access.Editor,
		},
		{
			IncidentID:    incidentID,
			PrincipalKind: access.AllPrincipal,
			PrincipalID:   access.AllPrincipalID,
			Role:          access.Viewer,
		},
	}, once.grants)

	row := func(subject, action string) projection.AccessPolicyRow {
		return projection.AccessPolicyRow{Subject: subject, Domain: incidentKey, Object: "incident", Action: action}
	}

	assert.Contains(t, once.policies, row("user:owner", "incident.delete"))
	assert.Contains(t, once.policies, row("user:editor", "incident.manage_access"))
	assert.NotContains(t, once.policies, row("user:editor", "incident.delete"), "managers cannot delete")
	assert.Contains(t, once.policies, row("user:m1", "incident.write"), "group members inherit the group role")
	assert.NotContains(t, once.policies, row("user:m2", "incident.write"), "removed members lose access")
	assert.Contains(t, once.policies, row("all", "incident.read"))
	assert.NotContains(t, once.policies, row("user:viewer", "incident.read"), "revoked role leaves no policy")

	g := h.Groups()[groupID]
	assert.Equal(t, "Operations", g.Name)
	assert.Equal(t, "second", g.Description)
	assert.Equal(t, []string{"m1"}, g.Members)
	assert.Nil(t, g.ArchivedAt)

	// Replaying the very same events a second time must not change anything.
	applyAll(t, h, events)

	twice := snapshot(h, incidentID)
	assert.ElementsMatch(t, once.policies, twice.policies)
	assert.ElementsMatch(t, once.grants, twice.grants)
	assert.Equal(t, once.groups, twice.groups)
	assert.Equal(t, access.Restricted, h.Mode(incidentID))
}

func TestAccessHandlerArchivedGroupLosesInheritedPolicies(t *testing.T) {
	incidentID := uuid.New()
	groupID := uuid.New()
	owner := "owner"

	incident := access.NewIncidentAccess(shared.IncidentID(incidentID))
	require.NoError(t, incident.Initialize(&owner, access.Restricted, owner, accessAt))
	require.NoError(t, incident.GrantRole(
		access.Principal{Kind: access.GroupPrincipal, ID: groupID.String()}, access.Viewer, owner, accessAt))

	group := access.NewAccessGroup(groupID)
	require.NoError(t, group.Create("Ops", "", "admin", accessAt))
	require.NoError(t, group.AddMember("m1", "admin", accessAt))

	h := projection.NewAccessHandler()
	applyAll(t, h, incident.Root().PendingEvents())
	applyAll(t, h, group.Root().PendingEvents())

	member := projection.AccessPolicyRow{
		Subject: "user:m1", Domain: "incident:" + incidentID.String(), Object: "incident", Action: "incident.read",
	}
	require.Contains(t, h.Policies(), member)

	group.Root().ClearPending()
	require.NoError(t, group.Archive("admin", accessAt.Add(time.Hour)))

	archive := group.Root().PendingEvents()
	applyAll(t, h, archive)
	applyAll(t, h, archive) // idempotent

	assert.NotContains(t, h.Policies(), member)

	g := h.Groups()[groupID]
	require.NotNil(t, g.ArchivedAt)
	assert.True(t, g.ArchivedAt.Equal(accessAt.Add(time.Hour)))
}

func TestAccessHandlerGroupGrantWithInvalidGroupIDIsSkipped(t *testing.T) {
	incidentID := uuid.New()
	owner := "owner"

	incident := access.NewIncidentAccess(shared.IncidentID(incidentID))
	require.NoError(t, incident.Initialize(&owner, access.Restricted, owner, accessAt))
	require.NoError(t, incident.GrantRole(
		access.Principal{Kind: access.GroupPrincipal, ID: "not-a-uuid"}, access.Viewer, owner, accessAt))

	h := projection.NewAccessHandler()
	applyAll(t, h, incident.Root().PendingEvents())

	assert.Contains(t, h.IncidentGrants(incidentID), projection.IncidentGrantRow{
		IncidentID: incidentID, PrincipalKind: access.GroupPrincipal, PrincipalID: "not-a-uuid", Role: access.Viewer,
	})
}

func TestAccessHandlerOpenIncidentOnlyGatesDelete(t *testing.T) {
	incidentID := uuid.New()
	owner := "owner"

	incident := access.NewIncidentAccess(shared.IncidentID(incidentID))
	require.NoError(t, incident.Initialize(&owner, access.OpenOperational, owner, accessAt))
	require.NoError(t, incident.GrantRole(userP("editor"), access.Editor, owner, accessAt))

	h := projection.NewAccessHandler()
	applyAll(t, h, incident.Root().PendingEvents())

	var ownerActions, editorActions []string

	for _, p := range h.Policies() {
		switch p.Subject {
		case "user:owner":
			ownerActions = append(ownerActions, p.Action)
		case "user:editor":
			editorActions = append(editorActions, p.Action)
		}
	}

	assert.Equal(t, []string{"incident.delete"}, ownerActions)
	assert.Empty(t, editorActions)
}

func TestAccessHandlerGlobalEventsAreIdempotentOnReplay(t *testing.T) {
	global := access.NewGlobalAccess()
	require.NoError(t, global.Initialize("bootstrap", accessAt))
	require.NoError(t, global.GrantRole("admin", access.SystemAdmin, "bootstrap", accessAt))
	require.NoError(t, global.GrantRole("admin2", access.SystemAdmin, "bootstrap", accessAt))
	require.NoError(t, global.GrantRole("ga", access.GroupAdmin, "bootstrap", accessAt))
	require.NoError(t, global.GrantRole("gone", access.GroupAdmin, "bootstrap", accessAt))
	require.NoError(t, global.RevokeRole("gone", access.GroupAdmin, "bootstrap", accessAt))
	require.NoError(t, global.RevokeRole("admin2", access.SystemAdmin, "bootstrap", accessAt))

	events := global.Root().PendingEvents()
	h := projection.NewAccessHandler()
	applyAll(t, h, events)
	applyAll(t, h, events)

	roles := h.GlobalRoles()
	assert.Equal(t, []access.GlobalRole{access.SystemAdmin}, roles["admin"])
	assert.Equal(t, []access.GlobalRole{access.GroupAdmin}, roles["ga"])
	assert.Empty(t, roles["gone"])
	assert.Empty(t, roles["admin2"])

	global2 := func(subject, action string) projection.AccessPolicyRow {
		return projection.AccessPolicyRow{Subject: "user:" + subject, Domain: "global", Object: "group", Action: action}
	}

	assert.Contains(t, h.Policies(), global2("admin", "group.manage"))
	assert.Contains(t, h.Policies(), projection.AccessPolicyRow{
		Subject: "user:admin", Domain: "global", Object: "system_admin", Action: "system_admin.manage",
	})
	assert.Contains(t, h.Policies(), global2("ga", "group.manage"))
	assert.NotContains(t, h.Policies(), global2("gone", "group.manage"))
	assert.NotContains(t, h.Policies(), global2("admin2", "group.manage"))
}

func TestAccessHandlerDefaultTemplateProjectsNoPolicies(t *testing.T) {
	h := projection.NewAccessHandler()

	mode, ok := h.DefaultIncidentMode()
	assert.False(t, ok)
	assert.Equal(t, access.Restricted, mode)
	assert.Empty(t, h.DefaultGrants())

	template := access.NewIncidentAccess(shared.IncidentID(access.DefaultAccessTemplateID))
	require.NoError(t, template.InitializeTemplate(access.OpenOperational, "admin", accessAt))
	require.NoError(t, template.GrantRole(userP("u"), access.Editor, "admin", accessAt))
	require.NoError(
		t,
		template.GrantRole(
			access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID},
			access.Viewer,
			"admin",
			accessAt,
		),
	)

	events := template.Root().PendingEvents()
	applyAll(t, h, events)
	applyAll(t, h, events)

	mode, ok = h.DefaultIncidentMode()
	assert.True(t, ok)
	assert.Equal(t, access.OpenOperational, mode)
	assert.ElementsMatch(t, []access.Grant{
		{Principal: userP("u"), Role: access.Editor},
		{Principal: access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID}, Role: access.Viewer},
	}, h.DefaultGrants())
	assert.Empty(t, h.Policies(), "the template must never generate enforcement policies")

	// Changing the template's mode keeps it flagged as the default.
	template.Root().ClearPending()
	require.NoError(t, template.ChangeAccessMode(access.Restricted, "admin", accessAt))
	applyAll(t, h, template.Root().PendingEvents())

	mode, _ = h.DefaultIncidentMode()
	assert.Equal(t, access.Restricted, mode)
	assert.Empty(t, h.Policies())
}

func TestAccessHandlerResetClearsEverything(t *testing.T) {
	incidentID := uuid.New()
	owner := "owner"

	incident := access.NewIncidentAccess(shared.IncidentID(incidentID))
	require.NoError(t, incident.Initialize(&owner, access.Restricted, owner, accessAt))

	group := access.NewAccessGroup(uuid.New())
	require.NoError(t, group.Create("Ops", "", "admin", accessAt))

	global := access.NewGlobalAccess()
	require.NoError(t, global.Initialize("b", accessAt))
	require.NoError(t, global.GrantRole("admin", access.SystemAdmin, "b", accessAt))

	h := projection.NewAccessHandler()
	applyAll(t, h, incident.Root().PendingEvents())
	applyAll(t, h, group.Root().PendingEvents())
	applyAll(t, h, global.Root().PendingEvents())
	require.NotEmpty(t, h.Policies())

	require.NoError(t, h.Reset(context.Background()))

	assert.Empty(t, h.Policies())
	assert.Empty(t, h.IncidentGrants(incidentID))
	assert.Empty(t, h.Groups())
	assert.Empty(t, h.GlobalRoles())
	assert.Empty(t, h.Mode(incidentID))
}
