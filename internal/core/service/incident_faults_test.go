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
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// incidentRig is an incident service on the in-memory store whose repositories can be made to
// fail, and whose access check can be switched off.
type incidentRig struct {
	svc       *service.IncidentService
	store     *inmem.EventStore
	incidents *faultyIncidents
	layers    *faultyLayers
	access    *accessState
	factory   *service.Factory
}

func newIncidentRig(t *testing.T, opts ...service.FactoryOption) incidentRig {
	t.Helper()

	store := inmem.NewEventStore()
	checker := &accessState{}
	incidents, _, layers, _ := repos(store)
	rig := incidentRig{
		store:     store,
		incidents: &faultyIncidents{IncidentRepository: incidents},
		layers:    &faultyLayers{LayerRepository: layers},
		access:    checker,
	}

	factory := service.NewFactory(append([]service.FactoryOption{
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
		service.WithIncidentAccessChecker(checker),
	}, opts...)...)
	rig.factory = factory
	rig.svc = factory.IncidentService(rig.incidents, rig.layers)

	return rig
}

// create opens an incident while everything still works.
func (r incidentRig) create(t *testing.T, name string) shared.IncidentID {
	t.Helper()

	res, err := r.svc.CreateIncident(ctx(), name, nil, nil, nil, testActor)
	require.NoError(t, err)

	return res.IncidentID
}

func (r incidentRig) closed(t *testing.T, name string) shared.IncidentID {
	t.Helper()

	id := r.create(t, name)
	_, err := r.svc.CloseIncident(ctx(), id, testActor)
	require.NoError(t, err)

	return id
}

func TestIncidentService_CreateIncident_Failures(t *testing.T) {
	tests := []struct {
		name    string
		incName string
		layers  []string
		divs    []incident.DivisionData
	}{
		{name: "an empty name", incName: " "},
		{name: "a division without a description", incName: "Brand", divs: []incident.DivisionData{{Name: "Alpha"}}},
		{name: "a layer without a name", incName: "Brand", layers: []string{""}},
	}

	for _, tt := range tests {
		t.Run(tt.name+" is rejected", func(t *testing.T) {
			r := newIncidentRig(t)

			_, err := r.svc.CreateIncident(ctx(), tt.incName, nil, tt.divs, tt.layers, testActor)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
		})
	}

	t.Run("an incident that cannot be saved", func(t *testing.T) {
		r := newIncidentRig(t)
		r.incidents.save = errBoom

		res, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.ErrorIs(t, err, errBoom)
		assert.Equal(t, inbound.CreateIncidentResult{}, res)
	})

	t.Run("a layer that cannot be saved", func(t *testing.T) {
		r := newIncidentRig(t)
		r.layers.save = errBoom

		_, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.ErrorIs(t, err, errBoom)
		assert.Equal(t, 1, r.layers.saves, "stops at the first layer")
	})

	t.Run("the second layer cannot be saved", func(t *testing.T) {
		r := newIncidentRig(t)
		r.layers.save = errBoom
		r.layers.saveOK = 1 // the message map layer

		_, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, []string{"Lage"}, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("the default Schadenplatz cannot be saved", func(t *testing.T) {
		r := newIncidentRig(t)
		sp := &faultySchadenplaetze{SchadenplatzRepository: eventstore.NewSchadenplatzRepository(r.store)}
		sp.save = errBoom
		r.svc.WithSchadenplatzRepository(sp)

		_, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("the incident cannot be saved again once it knows its Schadenplatz", func(t *testing.T) {
		r := newIncidentRig(t)
		r.svc.WithSchadenplatzRepository(eventstore.NewSchadenplatzRepository(r.store))
		r.incidents.save = errBoom
		r.incidents.saveOK = 1

		_, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.ErrorIs(t, err, errBoom)
		assert.Equal(t, 2, r.incidents.saves)
	})

	t.Run("an access aggregate that cannot be saved", func(t *testing.T) {
		store := inmem.NewEventStore()
		accessRepo := &faultyAccessRepo{IncidentAccessRepository: eventstore.NewIncidentAccessRepository(store)}
		accessRepo.save = errBoom

		r := newIncidentRig(t, service.WithIncidentAccessRepository(accessRepo))

		_, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("an actor without a subject cannot own a restricted incident", func(t *testing.T) {
		r := newIncidentRig(t, service.WithIncidentAccessRepository(
			eventstore.NewIncidentAccessRepository(inmem.NewEventStore())))

		_, err := r.svc.CreateIncidentWithParentMode(
			ctx(), "Brand", nil, nil, nil, nil, access.Restricted, identity.Actor{})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestIncidentService_CreateIncident_DefaultAccessTemplate(t *testing.T) {
	everyone := access.Grant{
		Principal: access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID},
		Role:      access.Viewer,
	}
	// An owner cannot be given to everyone: the grant is skipped, not fatal.
	invalid := access.Grant{
		Principal: access.Principal{Kind: access.AllPrincipal, ID: access.AllPrincipalID},
		Role:      access.Owner,
	}

	newRig := func(t *testing.T, queries outbound.AccessQueries) incidentRig {
		t.Helper()

		return newIncidentRig(t,
			service.WithAccessQueries(queries),
			service.WithIncidentAccessRepository(eventstore.NewIncidentAccessRepository(inmem.NewEventStore())),
		)
	}

	t.Run("an incident takes the mode and the grants of the template", func(t *testing.T) {
		r := newRig(t, accessTemplates{template: outbound.DefaultAccessTemplateRM{
			Mode: access.Restricted, Grants: []access.Grant{everyone, invalid},
		}})

		res, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.NoError(t, err)

		assert.Equal(t, access.Restricted, res.AccessMode)
		assert.Contains(t, res.AccessGrants, everyone)
		assert.Contains(t, res.AccessGrants, access.Grant{
			Principal: access.Principal{Kind: access.UserPrincipal, ID: testActor.Sub}, Role: access.Owner,
		}, "the creator owns it")
		assert.NotContains(t, res.AccessGrants, invalid)
	})

	t.Run("a child incident takes it too", func(t *testing.T) {
		r := newRig(t, accessTemplates{template: outbound.DefaultAccessTemplateRM{Mode: access.Restricted}})
		parent := r.create(t, "Eltern")

		res, err := r.svc.CreateIncidentWithParent(ctx(), "Kind", nil, nil, nil, &parent, testActor)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, res.AccessMode)
		assert.Equal(t, &parent, res.ParentID)
	})

	t.Run("without a readable template an incident is open for operations", func(t *testing.T) {
		r := newRig(t, accessTemplates{err: errBoom})

		res, err := r.svc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
		require.NoError(t, err)
		assert.Equal(t, access.OpenOperational, res.AccessMode)
	})

	t.Run("without access queries the mode is the one asked for", func(t *testing.T) {
		r := newIncidentRig(t, service.WithIncidentAccessRepository(
			eventstore.NewIncidentAccessRepository(inmem.NewEventStore())))

		res, err := r.svc.CreateIncidentWithParentMode(ctx(), "Brand", nil, nil, nil, nil, access.Restricted, testActor)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, res.AccessMode)
	})

	t.Run("without an access repository only the mode is reported", func(t *testing.T) {
		r := newIncidentRig(t)

		res, err := r.svc.CreateIncidentWithParentMode(ctx(), "Brand", nil, nil, nil, nil, access.Restricted, testActor)
		require.NoError(t, err)
		assert.Equal(t, access.Restricted, res.AccessMode)
		assert.Empty(t, res.AccessGrants)
	})
}

func TestIncidentService_CreateIncidentWithParent_Failures(t *testing.T) {
	t.Run("a hierarchy that cannot be locked", func(t *testing.T) {
		hs := &hierarchyStub{lockErr: errBoom}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		parent := shared.IncidentID(newID())

		_, err := r.svc.CreateIncidentWithParent(ctx(), "Kind", nil, nil, nil, &parent, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("a parent that does not exist", func(t *testing.T) {
		r := newIncidentRig(t)
		parent := shared.IncidentID(newID())

		_, err := r.svc.CreateIncidentWithParent(ctx(), "Kind", nil, nil, nil, &parent, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("the lock is let go again", func(t *testing.T) {
		hs := &hierarchyStub{}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		parent := r.create(t, "Eltern")

		_, err := r.svc.CreateIncidentWithParent(ctx(), "Kind", nil, nil, nil, &parent, testActor)
		require.NoError(t, err)
		assert.Equal(t, 1, hs.locks)
		assert.Equal(t, 1, hs.released)
	})

	t.Run("a closed parent is only allowed when it is not deleted", func(t *testing.T) {
		r := newIncidentRig(t)
		parent := r.closed(t, "Eltern")

		_, err := r.svc.CreateIncidentWithParent(ctx(), "Kind", nil, nil, nil, &parent, testActor)
		require.NoError(t, err)
	})
}

// incidentOp is a command on one existing incident.
type incidentOp struct {
	name string
	// closed says the incident has to be closed before the command makes sense.
	closed bool
	// run is given the incident and, for a link, the parent to link it to.
	run func(r incidentRig, id, parent shared.IncidentID) error
}

func incidentOps() []incidentOp {
	return []incidentOp{
		{name: "UpdateIncident", run: func(r incidentRig, id, _ shared.IncidentID) error {
			name := "Neu"
			_, err := r.svc.UpdateIncident(ctx(), id, &name, nil, nil, testActor)

			return err
		}},
		{name: "CloseIncident", run: func(r incidentRig, id, _ shared.IncidentID) error {
			_, err := r.svc.CloseIncident(ctx(), id, testActor)

			return err
		}},
		{name: "ReopenIncident", closed: true, run: func(r incidentRig, id, _ shared.IncidentID) error {
			_, err := r.svc.ReopenIncident(ctx(), id, testActor)

			return err
		}},
		{name: "DeleteIncident", closed: true, run: func(r incidentRig, id, _ shared.IncidentID) error {
			return r.svc.DeleteIncident(ctx(), id, testActor)
		}},
		{name: "LinkIncidentParent", run: func(r incidentRig, id, parent shared.IncidentID) error {
			_, err := r.svc.LinkIncidentParent(ctx(), id, parent, testActor)

			return err
		}},
		{name: "UnlinkIncidentParent", run: func(r incidentRig, id, _ shared.IncidentID) error {
			_, err := r.svc.UnlinkIncidentParent(ctx(), id, testActor)

			return err
		}},
	}
}

func TestIncidentService_CommandsReportFailures(t *testing.T) {
	for _, op := range incidentOps() {
		// The incidents are written straight to the store, so that setting up does not depend on
		// the failure under test.
		prepare := func(t *testing.T) (r incidentRig, id, parent shared.IncidentID) {
			t.Helper()

			r = newIncidentRig(t)

			return r, seedIncident(t, r, op.closed), seedIncident(t, r, false)
		}

		t.Run(op.name+" without permission", func(t *testing.T) {
			r, id, parent := prepare(t)
			r.access.denied = true

			require.ErrorIs(t, op.run(r, id, parent), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r, id, parent := prepare(t)
			r.access.err = errBoom

			require.ErrorIs(t, op.run(r, id, parent), errBoom)
		})

		t.Run(op.name+" on an incident that does not exist", func(t *testing.T) {
			r, _, parent := prepare(t)

			require.ErrorIs(t, op.run(r, shared.IncidentID(newID()), parent), shared.ErrNotFound)
		})

		t.Run(op.name+" when the incident cannot be loaded", func(t *testing.T) {
			r, id, parent := prepare(t)
			r.incidents.load = errBoom

			require.ErrorIs(t, op.run(r, id, parent), errBoom)
		})

		t.Run(op.name+" when the incident cannot be saved", func(t *testing.T) {
			r, id, parent := prepare(t)
			r.incidents.save = errBoom

			require.ErrorIs(t, op.run(r, id, parent), errBoom)
		})
	}
}

// seedIncident writes an incident straight to the store, for tests whose access check fails.
func seedIncident(t *testing.T, r incidentRig, closed bool) shared.IncidentID {
	t.Helper()

	id := shared.IncidentID(newID())
	inc := incident.New(id)
	require.NoError(t, inc.Open("Einsatz", nil, nil, testAt, "seed"))

	if closed {
		require.NoError(t, inc.Close(shared.ReasonManual, "seed", testAt))
	}

	_, err := r.incidents.IncidentRepository.Save(ctx(), inc)
	require.NoError(t, err)

	return id
}

func TestIncidentService_UpdateIncident(t *testing.T) {
	t.Run("changes the name and the location, and says so", func(t *testing.T) {
		r := newIncidentRig(t)
		id := r.create(t, "Alt")
		name := "Neu"
		coords := &[2]float64{8.5, 47.3}

		state, err := r.svc.UpdateIncident(
			ctx(),
			id,
			&name,
			&incident.LocationData{Name: "Bern", Coordinates: coords},
			nil,
			testActor,
		)
		require.NoError(t, err)

		assert.Equal(t, "Neu", state.Name)
		require.NotNil(t, state.Location)
		assert.Equal(t, "Bern", state.Location.Name)
		assert.Equal(t, coords, state.Location.Coordinates)
		assert.Equal(t, testAt, state.UpdatedAt)
	})

	tests := []struct {
		name  string
		given func(name *string, divs *[]incident.DivisionData)
	}{
		{"an empty name", func(n *string, _ *[]incident.DivisionData) { *n = " " }},
		{"a division without a description", func(_ *string, d *[]incident.DivisionData) {
			*d = []incident.DivisionData{{Name: "Alpha"}}
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name+" is rejected", func(t *testing.T) {
			r := newIncidentRig(t)
			id := r.create(t, "Alt")
			name := "Neu"
			divs := []incident.DivisionData(nil)
			tt.given(&name, &divs)

			_, err := r.svc.UpdateIncident(ctx(), id, &name, nil, divs, testActor)
			require.ErrorIs(t, err, shared.ErrInvalidInput)

			inc, err := r.svc.LoadIncident(ctx(), id)
			require.NoError(t, err)
			assert.Equal(t, "Alt", inc.Name(), "nothing is half applied")
		})
	}

	t.Run("a closed incident cannot be changed", func(t *testing.T) {
		r := newIncidentRig(t)
		id := r.closed(t, "Alt")
		name := "Neu"

		_, err := r.svc.UpdateIncident(ctx(), id, &name, nil, nil, testActor)
		require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})

	t.Run("a location can be set without a name", func(t *testing.T) {
		r := newIncidentRig(t)
		id := r.create(t, "Alt")

		state, err := r.svc.UpdateIncident(ctx(), id, nil, &incident.LocationData{}, nil, testActor)
		require.NoError(t, err)
		assert.Nil(t, state.Location, "a zero location clears it")
	})
}

func TestIncidentService_HierarchyFailures(t *testing.T) {
	t.Run("a hierarchy that cannot be locked stops a link and an unlink", func(t *testing.T) {
		hs := &hierarchyStub{lockErr: errBoom}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")

		_, err := r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.ErrorIs(t, err, errBoom)

		_, err = r.svc.UnlinkIncidentParent(ctx(), child, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("the lock is let go again, whatever happens", func(t *testing.T) {
		hs := &hierarchyStub{}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")

		_, err := r.svc.LinkIncidentParent(ctx(), child, shared.IncidentID(newID()), testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.NoError(t, err)

		_, err = r.svc.UnlinkIncidentParent(ctx(), child, testActor)
		require.NoError(t, err)

		assert.Equal(t, 3, hs.locks)
		assert.Equal(t, hs.locks, hs.released)
	})

	t.Run("an incident can be unlinked without a hierarchy guard", func(t *testing.T) {
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(nil))
		child := r.create(t, "Kind")

		state, err := r.svc.UnlinkIncidentParent(ctx(), child, testActor)
		require.NoError(t, err)
		assert.Nil(t, state.ParentID)
	})

	t.Run("a question about children that cannot be answered", func(t *testing.T) {
		hs := &hierarchyStub{hasChildrenErr: errBoom}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")

		_, err := r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("an incident with children cannot become a child", func(t *testing.T) {
		hs := &hierarchyStub{hasChildren: true}
		r := newIncidentRig(t, service.WithIncidentHierarchyGuard(hs))
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")

		_, err := r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidParent)
	})

	t.Run("an incident cannot be its own parent", func(t *testing.T) {
		r := newIncidentRig(t)
		id := r.create(t, "Einsatz")

		_, err := r.svc.LinkIncidentParent(ctx(), id, id, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)

		inc, err := r.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.Nil(t, inc.ParentID())
	})

	t.Run("the parent is read again to check for a cycle, and that can fail", func(t *testing.T) {
		r := newIncidentRig(t)
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")
		r.incidents.load = errBoom
		r.incidents.loadOK = 2 // the child, then the parent for the first check

		_, err := r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("a linked child is reported with its parent", func(t *testing.T) {
		r := newIncidentRig(t)
		child, parent := r.create(t, "Kind"), r.create(t, "Eltern")

		state, err := r.svc.LinkIncidentParent(ctx(), child, parent, testActor)
		require.NoError(t, err)
		require.NotNil(t, state.ParentID)
		assert.Equal(t, parent, *state.ParentID)

		state, err = r.svc.UnlinkIncidentParent(ctx(), child, testActor)
		require.NoError(t, err)
		assert.Nil(t, state.ParentID)
	})
}

func TestIncidentService_LoadIncident(t *testing.T) {
	r := newIncidentRig(t)
	id := r.create(t, "Einsatz")

	inc, err := r.svc.LoadIncident(ctx(), id)
	require.NoError(t, err)
	assert.Equal(t, "Einsatz", inc.Name())

	r.incidents.load = errBoom
	_, err = r.svc.LoadIncident(ctx(), id)
	require.ErrorIs(t, err, errBoom)
}

// ── Review ───────────────────────────────────────────────────────────────────

// reviewQueries is the part of the read model the review reads, with scripted answers.
type reviewQueries struct {
	outbound.Queries

	messageIDs    []uuid.UUID
	messageIDsErr error
	summaries     []outbound.ReviewSummaryRM
	summariesErr  error
	closed        []uuid.UUID
	closedErr     error
	staleBefore   *int
}

func (q *reviewQueries) ListIncidentMessageIDs(context.Context, uuid.UUID) ([]uuid.UUID, error) {
	return q.messageIDs, q.messageIDsErr
}

func (q *reviewQueries) ListReviewSummaries(context.Context) ([]outbound.ReviewSummaryRM, error) {
	return q.summaries, q.summariesErr
}

func (q *reviewQueries) ListClosedIncidentsForReview(_ context.Context, staleBefore int) ([]uuid.UUID, error) {
	q.staleBefore = &staleBefore

	return q.closed, q.closedErr
}

// reviewRig is an incident service that can review messages, without a projection.
type reviewRig struct {
	incidentRig
	queries  *reviewQueries
	messages *faultyMessages
}

func newReviewRig(t *testing.T) reviewRig {
	t.Helper()

	r := newIncidentRig(t)
	_, messages, _, _ := repos(r.store)
	rig := reviewRig{
		incidentRig: r,
		queries:     &reviewQueries{},
		messages:    &faultyMessages{MessageRepository: messages},
	}
	r.svc.WithMessageSource(rig.queries, rig.messages)

	return rig
}

// importedIncident writes an incident the way the legacy import does.
func (r incidentRig) importedIncident(t *testing.T, closed bool) shared.IncidentID {
	t.Helper()

	id := shared.IncidentID(newID())
	inc := incident.New(id)
	data := incident.Imported{Name: "Altes Ereignis", CreatedAt: testAt.Add(-time.Hour)}

	if closed {
		at := testAt
		data.ClosedAt = &at
	}

	eventsourcing.TrackChange(inc, data, testAt, map[string]any{"actor": "import"})

	_, err := r.incidents.IncidentRepository.Save(ctx(), inc)
	require.NoError(t, err)

	return id
}

func TestIncidentService_IncidentReview_Failures(t *testing.T) {
	t.Run("the incident cannot be loaded", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.create(t, "Einsatz")
		r.incidents.load = errBoom

		_, err := r.svc.IncidentReview(ctx(), id)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("the messages cannot be listed", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.create(t, "Einsatz")
		r.queries.messageIDsErr = errBoom

		report, err := r.svc.IncidentReview(ctx(), id)
		require.ErrorIs(t, err, errBoom)
		assert.Nil(t, report)
	})

	t.Run("the messages cannot be loaded", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.create(t, "Einsatz")
		r.queries.messageIDs = []uuid.UUID{newID()}
		r.messages.loadManyErr = errBoom

		_, err := r.svc.IncidentReview(ctx(), id)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("an imported incident has no review", func(t *testing.T) {
		r := newReviewRig(t)

		report, err := r.svc.IncidentReview(ctx(), r.importedIncident(t, true))
		require.NoError(t, err)
		assert.Nil(t, report)
	})

	t.Run("the divisions are listed by name", func(t *testing.T) {
		r := newReviewRig(t)
		res, err := r.svc.CreateIncident(ctx(), "Einsatz", nil, []incident.DivisionData{
			{Name: "Zug", Description: "z"}, {Name: "Alpha", Description: "a"},
		}, nil, testActor)
		require.NoError(t, err)

		report, err := r.svc.IncidentReview(ctx(), res.IncidentID)
		require.NoError(t, err)
		require.NotNil(t, report)
		require.Len(t, report.Divisions, 3, "the message map and the two divisions")

		names := make([]string, len(report.Divisions))
		for i, d := range report.Divisions {
			names[i] = d.Division.Name
		}

		assert.IsIncreasing(t, names, "sorted by name, not by the order they were given in")
	})
}

func TestIncidentService_CloseIncident_ReviewSummary(t *testing.T) {
	t.Run("an imported incident closes without a summary", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.importedIncident(t, false)

		_, err := r.svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err := r.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.True(t, inc.IsClosed())
		assert.Nil(t, inc.ReviewSummary())
	})

	t.Run("an incident closes when its review cannot be worked out", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.create(t, "Einsatz")
		r.queries.messageIDsErr = errBoom

		_, err := r.svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err := r.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.True(t, inc.IsClosed())
		assert.Nil(t, inc.ReviewSummary(), "it is left out of comparisons until it is backfilled")
	})

	t.Run("closing keeps the headline", func(t *testing.T) {
		r := newReviewRig(t)
		id := r.create(t, "Einsatz")

		_, err := r.svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err := r.svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		require.NotNil(t, inc.ReviewSummary())
		assert.Equal(t, kpi.SummaryVersion, inc.ReviewSummary().Version)
	})
}

func TestIncidentService_CompareIncident_Failures(t *testing.T) {
	current := kpi.Summary{Version: kpi.SummaryVersion, Messages: 5}

	t.Run("without a read model there is nothing to compare with", func(t *testing.T) {
		r := newIncidentRig(t)

		cmp, err := r.svc.CompareIncident(ctx(), shared.IncidentID(newID()), current)
		require.NoError(t, err)
		assert.Equal(t, kpi.Compare(current, nil), cmp)
	})

	t.Run("a read model that cannot be listed", func(t *testing.T) {
		r := newReviewRig(t)
		r.queries.summariesErr = errBoom

		_, err := r.svc.CompareIncident(ctx(), shared.IncidentID(newID()), current)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("an incident is not its own peer", func(t *testing.T) {
		r := newReviewRig(t)
		self := shared.IncidentID(newID())
		r.queries.summaries = []outbound.ReviewSummaryRM{
			{IncidentID: uuid.UUID(self), Summary: current},
			{IncidentID: newID(), Summary: current},
		}

		cmp, err := r.svc.CompareIncident(ctx(), self, current)
		require.NoError(t, err)
		assert.Equal(t, kpi.Compare(current, []kpi.Summary{current}), cmp)
	})
}

func TestIncidentService_BackfillReviewSummaries_Failures(t *testing.T) {
	t.Run("an incident that cannot be listed", func(t *testing.T) {
		r := newReviewRig(t)
		r.queries.closedErr = errBoom

		result, err := r.svc.BackfillReviewSummaries(ctx(), "system", false)
		require.ErrorIs(t, err, errBoom)
		assert.Equal(t, inbound.BackfillResult{}, result)
	})

	t.Run("one that fails does not stop the others", func(t *testing.T) {
		r := newReviewRig(t)

		good := r.closed(t, "Gut")
		imported := r.importedIncident(t, true)
		stillOpen := r.create(t, "Offen") // not closed: there is no headline to keep for it
		unknown := shared.IncidentID(newID())

		r.queries.closed = []uuid.UUID{uuid.UUID(unknown), uuid.UUID(imported), uuid.UUID(stillOpen), uuid.UUID(good)}

		result, err := r.svc.BackfillReviewSummaries(ctx(), "system", false)
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{Recorded: 1, Skipped: 1, Failed: 2}, result)
	})

	t.Run("an incident whose messages cannot be loaded is counted as failed", func(t *testing.T) {
		r := newReviewRig(t)
		r.queries.closed = []uuid.UUID{uuid.UUID(r.closed(t, "Einsatz"))}
		r.queries.messageIDs = []uuid.UUID{newID()}
		r.messages.loadManyErr = errBoom

		result, err := r.svc.BackfillReviewSummaries(ctx(), "system", false)
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{Failed: 1}, result)
	})

	t.Run("an incident that cannot be saved is counted as failed", func(t *testing.T) {
		r := newReviewRig(t)
		r.queries.closed = []uuid.UUID{uuid.UUID(r.closed(t, "Einsatz"))}
		r.incidents.save = errBoom

		result, err := r.svc.BackfillReviewSummaries(ctx(), "system", false)
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{Failed: 1}, result)
	})

	t.Run("forcing asks for every closed incident, not only the stale ones", func(t *testing.T) {
		r := newReviewRig(t)

		_, err := r.svc.BackfillReviewSummaries(ctx(), "system", false)
		require.NoError(t, err)
		require.NotNil(t, r.queries.staleBefore)
		assert.Equal(t, kpi.SummaryVersion, *r.queries.staleBefore)

		_, err = r.svc.BackfillReviewSummaries(ctx(), "system", true)
		require.NoError(t, err)
		assert.Greater(t, *r.queries.staleBefore, kpi.SummaryVersion)
	})
}
