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

func TestAccessServiceRequiresProjectedIncidentPermission(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	incidentID := shared.IncidentID(uuid.New())
	at := time.Unix(1, 0)
	owner := "owner-1"

	incidentRepo := eventstore.NewIncidentAccessRepository(store)
	incident := access.NewIncidentAccess(incidentID)
	require.NoError(t, incident.Initialize(&owner, access.Restricted, owner, at))
	_, err := incidentRepo.Save(ctx, incident)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	projector := projection.NewProjector(store, []projection.Handler{handler})
	require.NoError(t, projector.CatchUp(ctx))

	checker := inmem.NewIncidentAccessChecker(handler)

	svc := service.NewAccessService(
		inmem.NewTransactor(),
		incidentRepo,
		eventstore.NewAccessGroupRepository(store),
		eventstore.NewGlobalAccessRepository(store),
		checker,
		inmem.NewGlobalAccessChecker(handler),
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	err = svc.GrantIncidentRole(
		ctx,
		incidentID,
		access.Principal{Kind: access.UserPrincipal, ID: "viewer-1"},
		access.Viewer,
		identity.Actor{Sub: "other-user"},
	)
	require.ErrorIs(t, err, shared.ErrForbidden)

	err = svc.GrantIncidentRole(
		ctx,
		incidentID,
		access.Principal{Kind: access.UserPrincipal, ID: "viewer-1"},
		access.Viewer,
		identity.Actor{Sub: owner},
	)
	require.NoError(t, err)
}

func TestAccessServiceRejectsInvalidGroupGrant(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	incidentID := shared.IncidentID(uuid.New())
	at := time.Unix(1, 0)
	owner := "owner-1"

	incidentRepo := eventstore.NewIncidentAccessRepository(store)
	incident := access.NewIncidentAccess(incidentID)
	require.NoError(t, incident.Initialize(&owner, access.Restricted, owner, at))
	_, err := incidentRepo.Save(ctx, incident)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	require.NoError(t, projection.NewProjector(store, []projection.Handler{handler}).CatchUp(ctx))
	checker := inmem.NewIncidentAccessChecker(handler)
	svc := service.NewAccessService(
		inmem.NewTransactor(),
		incidentRepo,
		eventstore.NewAccessGroupRepository(store),
		eventstore.NewGlobalAccessRepository(store),
		checker,
		inmem.NewGlobalAccessChecker(handler),
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	err = svc.GrantIncidentRole(
		ctx,
		incidentID,
		access.Principal{Kind: access.GroupPrincipal, ID: "not-a-uuid"},
		access.Viewer,
		identity.Actor{Sub: owner},
	)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestAccessServiceCannotRevokeLastSystemAdmin(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	at := time.Unix(1, 0)
	admin := "admin-1"

	globalRepo := eventstore.NewGlobalAccessRepository(store)
	global := access.NewGlobalAccess()
	require.NoError(t, global.Initialize("bootstrap", at))
	require.NoError(t, global.GrantRole(admin, access.SystemAdmin, "bootstrap", at))
	_, err := globalRepo.Save(ctx, global)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	require.NoError(t, projection.NewProjector(store, []projection.Handler{handler}).CatchUp(ctx))
	svc := service.NewAccessService(
		inmem.NewTransactor(),
		eventstore.NewIncidentAccessRepository(store),
		eventstore.NewAccessGroupRepository(store),
		globalRepo,
		inmem.NewIncidentAccessChecker(handler),
		inmem.NewGlobalAccessChecker(handler),
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	err = svc.RevokeGlobalRole(ctx, admin, access.SystemAdmin, identity.Actor{Sub: admin})
	require.ErrorIs(t, err, shared.ErrForbidden)
}

func TestAccessServiceBootstrapsOnlyFirstSystemAdmin(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	at := time.Unix(1, 0)
	globalRepo := eventstore.NewGlobalAccessRepository(store)
	svc := service.NewAccessService(
		inmem.NewTransactor(),
		eventstore.NewIncidentAccessRepository(store),
		eventstore.NewAccessGroupRepository(store),
		globalRepo,
		nil,
		nil,
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)

	require.NoError(t, svc.BootstrapFirstSystemAdmin(ctx, "first-user", identity.Actor{Sub: "first-user"}))
	require.NoError(t, svc.BootstrapFirstSystemAdmin(ctx, "second-user", identity.Actor{Sub: "second-user"}))

	global, err := globalRepo.Load(ctx)
	require.NoError(t, err)
	assert.True(t, global.HasRole("first-user", access.SystemAdmin))
	assert.False(t, global.HasRole("second-user", access.SystemAdmin))
}

// TestOwnerlessOpenIncidentIsClaimable verifies that any authenticated user can manage
// access on an open_operational incident that has no owner — covering incidents that were
// backfilled without a discoverable creator.
func TestOwnerlessOpenIncidentIsClaimable(t *testing.T) {
	ctx := context.Background()
	store := inmem.NewEventStore()
	incidentID := shared.IncidentID(uuid.New())
	at := time.Unix(1, 0)

	// Initialize with open_operational mode and no owner (ownerSub = nil).
	incidentRepo := eventstore.NewIncidentAccessRepository(store)
	incident := access.NewIncidentAccess(incidentID)
	require.NoError(t, incident.Initialize(nil, access.OpenOperational, "system:migration", at))
	_, err := incidentRepo.Save(ctx, incident)
	require.NoError(t, err)

	handler := projection.NewAccessHandler()
	projector := projection.NewProjector(store, []projection.Handler{handler})
	require.NoError(t, projector.CatchUp(ctx))

	checker := inmem.NewIncidentAccessChecker(handler)

	// Any authenticated user can manage access on an ownerless open incident.
	canManage, err := checker.Can(ctx, "any-user", incidentID, access.IncidentManageAccess)
	require.NoError(t, err)
	assert.True(t, canManage, "ownerless open incident should be claimable by any user")

	// Normal read/write still works too.
	canRead, err := checker.Can(ctx, "any-user", incidentID, access.IncidentRead)
	require.NoError(t, err)
	assert.True(t, canRead)

	// Once an owner is granted, only that owner (or another manager) may manage access.
	svc := service.NewAccessService(
		inmem.NewTransactor(),
		incidentRepo,
		eventstore.NewAccessGroupRepository(store),
		eventstore.NewGlobalAccessRepository(store),
		checker,
		inmem.NewGlobalAccessChecker(handler),
		inmem.NewAccessGuard(),
		fixedAccessClock{t: at},
		inmem.UUIDGen{},
		inmem.NewNotifier(),
	)
	require.NoError(t, svc.GrantIncidentRole(
		ctx, incidentID,
		access.Principal{Kind: access.UserPrincipal, ID: "new-owner"},
		access.Owner,
		identity.Actor{Sub: "any-user"},
	))
	require.NoError(t, projector.CatchUp(ctx))

	// Now a different user without a grant cannot manage access.
	canManageAfter, err := checker.Can(ctx, "another-user", incidentID, access.IncidentManageAccess)
	require.NoError(t, err)
	assert.False(t, canManageAfter, "once owned, ungranted users cannot manage access")
}

type fixedAccessClock struct{ t time.Time }

func (c fixedAccessClock) Now() time.Time { return c.t }
