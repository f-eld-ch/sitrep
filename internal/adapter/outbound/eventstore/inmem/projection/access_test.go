package projection_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestAccessHandlerProjectsDirectAndGroupPolicies(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	incidentID := shared.IncidentID(uuid.New())
	groupID := uuid.New()
	at := time.Unix(1, 0)

	incidentAccess := access.NewIncidentAccess(incidentID)
	require.NoError(t, incidentAccess.Initialize(nil, access.OpenOperational, "admin", at))
	require.NoError(t, incidentAccess.ChangeAccessMode(access.Restricted, "owner", at))
	require.NoError(
		t,
		incidentAccess.GrantRole(
			access.Principal{Kind: access.GroupPrincipal, ID: groupID.String()},
			access.Viewer,
			"owner",
			at,
		),
	)
	_, err := eventstore.NewIncidentAccessRepository(store).Save(ctx, incidentAccess)
	require.NoError(t, err)

	group := access.NewAccessGroup(groupID)
	require.NoError(t, group.Create("Operations", "", "admin", at))
	require.NoError(t, group.AddMember("member-1", "admin", at))
	_, err = eventstore.NewAccessGroupRepository(store).Save(ctx, group)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	projector := projection.NewProjector(store, []projection.Handler{handler})
	require.NoError(t, projector.CatchUp(ctx))

	groupProjection, ok := handler.Groups()[groupID]
	require.True(t, ok)
	assert.Equal(t, "Operations", groupProjection.Name)
	assert.Empty(t, groupProjection.Description)

	rows := handler.Policies()
	require.NotEmpty(t, rows)
	assert.Contains(
		t,
		rows,
		projection.AccessPolicyRow{
			Subject: "user:owner",
			Domain:  "incident:" + incidentID.String(),
			Object:  "incident",
			Action:  "incident.read",
		},
	)
	assert.Contains(
		t,
		rows,
		projection.AccessPolicyRow{
			Subject: "user:member-1",
			Domain:  "incident:" + incidentID.String(),
			Object:  "incident",
			Action:  "incident.read",
		},
	)
}

// TestOpenIncidentAllowsManagementForEveryone verifies that on open_operational incidents
// any authenticated user can manage access — even after an owner has been assigned.
func TestOpenIncidentAllowsManagementForEveryone(t *testing.T) {
	store := inmem.NewEventStore()
	incidentID := shared.IncidentID(uuid.New())
	at := time.Unix(1, 0)
	owner := "owner-1"
	incident := access.NewIncidentAccess(incidentID)
	require.NoError(t, incident.Initialize(&owner, access.OpenOperational, owner, at))
	_, err := eventstore.NewIncidentAccessRepository(store).Save(context.Background(), incident)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	require.NoError(t, projection.NewProjector(store, []projection.Handler{handler}).CatchUp(context.Background()))
	checker := inmem.NewIncidentAccessChecker(handler)

	// Owner can manage access.
	allowed, err := checker.Can(context.Background(), owner, incidentID, access.IncidentManageAccess)
	require.NoError(t, err)
	assert.True(t, allowed)

	// Any other user can also manage access on an open incident.
	allowed, err = checker.Can(context.Background(), "viewer", incidentID, access.IncidentManageAccess)
	require.NoError(t, err)
	assert.True(t, allowed, "any user should be able to manage access on an open incident")

	// Delete is still policy-gated (only the owner).
	allowed, err = checker.Can(context.Background(), "viewer", incidentID, access.IncidentDelete)
	require.NoError(t, err)
	assert.False(t, allowed, "delete should be restricted to owner even on open incident")
}
