package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	projection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	queries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// incidentAccessStack builds an IncidentService with access control wired in: access
// aggregates are written on creation, permissions are enforced by the projected read model
// and the default-access template is read through the in-memory access queries.
type incidentAccessStack struct {
	t         *testing.T
	store     *inmem.EventStore
	handler   *projection.AccessHandler
	projector *projection.Projector
	access    *service.AccessService
	svc       *service.IncidentService
}

func newIncidentAccessStack(
	t *testing.T,
	accessQueries func(outbound.AccessQueries) outbound.AccessQueries,
) *incidentAccessStack {
	t.Helper()

	store := inmem.NewEventStore()
	handler := projection.NewAccessHandler()
	accessRepo := eventstore.NewIncidentAccessRepository(store)

	var aq outbound.AccessQueries = queries.NewAccessQueries(handler)
	if accessQueries != nil {
		aq = accessQueries(aq)
	}

	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
		service.WithIncidentAccessRepository(accessRepo),
		service.WithIncidentAccessChecker(inmem.NewIncidentAccessChecker(handler)),
		service.WithAccessQueries(aq),
	)
	incidents, _, layers, _ := repos(store)

	return &incidentAccessStack{
		t:         t,
		store:     store,
		handler:   handler,
		projector: projection.NewProjector(store, []projection.Handler{handler}),
		access: service.NewAccessService(
			inmem.NewTransactor(),
			accessRepo,
			eventstore.NewAccessGroupRepository(store),
			eventstore.NewGlobalAccessRepository(store),
			nil,
			nil,
			inmem.NewAccessGuard(),
			fixedClock{t: testAt},
			inmem.UUIDGen{},
			inmem.NewNotifier(),
		),
		svc: factory.IncidentService(incidents, layers),
	}
}

func (s *incidentAccessStack) catchUp() {
	s.t.Helper()
	require.NoError(s.t, s.projector.CatchUp(s.t.Context()))
}

// stubAccessQueries overrides only the default-template lookup.
type stubAccessQueries struct {
	outbound.AccessQueries

	err error
}

func (s stubAccessQueries) GetDefaultAccessTemplate(context.Context) (outbound.DefaultAccessTemplateRM, error) {
	return outbound.DefaultAccessTemplateRM{}, s.err
}

func TestIncidentServiceCreateAppliesDefaultAccessTemplate(t *testing.T) {
	everyone := access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID}

	t.Run("restricted template with an open-to-all viewer grant", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)
		_, err := s.access.InitializeDefaultAccess(
			ctx(), access.Restricted, []access.Grant{{Principal: everyone, Role: access.Viewer}}, testActor)
		require.NoError(t, err)
		s.catchUp()

		res, err := s.svc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		assert.Equal(t, access.Restricted, res.AccessMode)
		assert.ElementsMatch(t, []access.Grant{
			{Principal: access.Principal{Kind: access.UserPrincipal, ID: testActor.Sub}, Role: access.Owner},
			{Principal: everyone, Role: access.Viewer},
		}, res.AccessGrants)
	})

	t.Run("open template", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)
		_, err := s.access.SetDefaultAccessMode(ctx(), access.OpenOperational, testActor)
		require.NoError(t, err)
		s.catchUp()

		res, err := s.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.NoError(t, err)

		assert.Equal(t, access.OpenOperational, res.AccessMode)
		assert.Len(t, res.AccessGrants, 1, "only the creator as owner")
	})

	t.Run("no template configured: the safe default of the queries applies", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)

		res, err := s.svc.CreateIncident(ctx(), "Sturm", nil, nil, nil, testActor)
		require.NoError(t, err)

		assert.Equal(t, access.Restricted, res.AccessMode)
	})

	t.Run("template lookup failure falls back to open", func(t *testing.T) {
		s := newIncidentAccessStack(t, func(inner outbound.AccessQueries) outbound.AccessQueries {
			return stubAccessQueries{AccessQueries: inner, err: errors.New("read model unavailable")}
		})

		res, err := s.svc.CreateIncident(ctx(), "Sturm", nil, nil, nil, testActor)
		require.NoError(t, err)

		assert.Equal(t, access.OpenOperational, res.AccessMode)
	})

	t.Run("owner grant on the creator is persisted", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)

		res, err := s.svc.CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
		require.NoError(t, err)
		s.catchUp()

		assert.Equal(t, res.AccessMode, s.handler.Mode(uuid.UUID(res.IncidentID)))
		assert.Contains(t, s.handler.IncidentGrants(uuid.UUID(res.IncidentID)), projection.IncidentGrantRow{
			IncidentID: uuid.UUID(
				res.IncidentID,
			),
			PrincipalKind: access.UserPrincipal,
			PrincipalID:   testActor.Sub,
			Role:          access.Owner,
		})
	})
}

func TestIncidentServiceCreateWithParentAndExplicitMode(t *testing.T) {
	s := newIncidentAccessStack(t, nil)

	parent, err := s.svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
	require.NoError(t, err)

	child, err := s.svc.CreateIncidentWithParent(ctx(), "Municipal", nil, nil, nil, &parent.IncidentID, testActor)
	require.NoError(t, err)
	require.NotNil(t, child.ParentID)
	assert.Equal(t, parent.IncidentID, *child.ParentID)

	explicit, err := s.svc.CreateIncidentWithParentMode(
		ctx(), "Quartier", nil, nil, nil, &parent.IncidentID, access.OpenOperational, testActor)
	require.NoError(t, err)
	assert.Equal(t, access.OpenOperational, explicit.AccessMode)

	missing := shared.IncidentID(newID())
	_, err = s.svc.CreateIncidentWithParent(ctx(), "Orphan", nil, nil, nil, &missing, testActor)
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = s.svc.CreateIncidentWithParentMode(
		ctx(), "Bad mode", nil, nil, nil, nil, access.IncidentMode("bogus"), testActor)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestIncidentServiceUpdateIncident(t *testing.T) {
	newOpen := func(t *testing.T) (*incidentAccessStack, shared.IncidentID) {
		t.Helper()

		s := newIncidentAccessStack(t, nil)
		res, err := s.svc.CreateIncident(ctx(), "Alt", nil, nil, nil, testActor)
		require.NoError(t, err)
		s.catchUp()

		return s, res.IncidentID
	}

	t.Run("renames and relocates", func(t *testing.T) {
		s, id := newOpen(t)
		name := "Neu"
		loc := &incident.LocationData{Name: "Bern"}

		state, err := s.svc.UpdateIncident(ctx(), id, &name, loc, nil, testActor)
		require.NoError(t, err)
		assert.Equal(t, "Neu", state.Name)

		inc, err := s.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.Equal(t, "Neu", inc.Name())
		require.NotNil(t, inc.Location())
		assert.Equal(t, "Bern", inc.Location().Name)
	})

	t.Run("blank name is rejected and nothing is saved", func(t *testing.T) {
		s, id := newOpen(t)
		blank := "  "

		_, err := s.svc.UpdateIncident(ctx(), id, &blank, nil, nil, testActor)
		require.Error(t, err)

		inc, err := s.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.Equal(t, "Alt", inc.Name())
	})

	t.Run("a stranger cannot write on a restricted incident", func(t *testing.T) {
		s, id := newOpen(t)
		s.catchUp()

		name := "Hijack"

		// The default (restricted) mode means only the creator holds incident.write.
		_, err := s.svc.UpdateIncident(ctx(), id, &name, nil, nil, identity.Actor{Sub: "stranger"})
		require.ErrorIs(t, err, shared.ErrForbidden)

		inc, err := s.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.Equal(t, "Alt", inc.Name())
	})

	t.Run("unknown incident", func(t *testing.T) {
		s, _ := newOpen(t)
		name := "x"

		_, err := s.svc.UpdateIncident(ctx(), shared.IncidentID(newID()), &name, nil, nil, testActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("closed incidents cannot be updated", func(t *testing.T) {
		s, id := newOpen(t)
		_, err := s.svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		name := "Late"
		_, err = s.svc.UpdateIncident(ctx(), id, &name, nil, nil, testActor)
		require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})
}

func TestIncidentServiceUnlinkIncidentParentGuards(t *testing.T) {
	t.Run("a stranger cannot unlink", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)

		parent, err := s.svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := s.svc.CreateIncidentWithParent(ctx(), "Municipal", nil, nil, nil, &parent.IncidentID, testActor)
		require.NoError(t, err)
		s.catchUp()

		_, err = s.svc.UnlinkIncidentParent(ctx(), child.IncidentID, identity.Actor{Sub: "stranger"})
		require.ErrorIs(t, err, shared.ErrForbidden)

		loaded, err := s.svc.LoadIncident(ctx(), child.IncidentID)
		require.NoError(t, err)
		assert.NotNil(t, loaded.ParentID(), "the link survives a refused unlink")
	})

	t.Run("unknown child", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)

		_, err := s.svc.UnlinkIncidentParent(ctx(), shared.IncidentID(newID()), testActor)
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("closed child cannot be unlinked", func(t *testing.T) {
		s := newIncidentAccessStack(t, nil)

		parent, err := s.svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := s.svc.CreateIncidentWithParent(ctx(), "Municipal", nil, nil, nil, &parent.IncidentID, testActor)
		require.NoError(t, err)
		s.catchUp()

		_, err = s.svc.CloseIncident(ctx(), child.IncidentID, testActor)
		require.NoError(t, err)

		_, err = s.svc.UnlinkIncidentParent(ctx(), child.IncidentID, testActor)
		require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})
}

func TestIncidentServiceLinkRejectsCycles(t *testing.T) {
	s := newIncidentAccessStack(t, nil)

	a, err := s.svc.CreateIncident(ctx(), "A", nil, nil, nil, testActor)
	require.NoError(t, err)
	b, err := s.svc.CreateIncidentWithParent(ctx(), "B", nil, nil, nil, &a.IncidentID, testActor)
	require.NoError(t, err)
	s.catchUp()

	_, err = s.svc.LinkIncidentParent(ctx(), a.IncidentID, a.IncidentID, testActor)
	require.Error(t, err, "an incident cannot be its own parent")

	_, err = s.svc.LinkIncidentParent(ctx(), a.IncidentID, b.IncidentID, testActor)
	require.Error(t, err, "linking a parent under its own child would form a cycle")

	loaded, err := s.svc.LoadIncident(ctx(), a.IncidentID)
	require.NoError(t, err)
	assert.Nil(t, loaded.ParentID())
}
