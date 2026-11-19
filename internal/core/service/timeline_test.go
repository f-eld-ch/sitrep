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
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// timelineRig records an incident over an hour and can then be asked what it looked like when.
type timelineRig struct {
	clock    *steppedClock
	store    *inmem.EventStore
	incident inbound.IncidentService
	sp       inbound.SchadenplatzService
	res      inbound.ResourceService

	incidentID shared.IncidentID
	// resources and schadenplaetze are what the read model would list.
	resources      []*outbound.ResourceRM
	schadenplaetze []*outbound.SchadenplatzRM
}

func (r *timelineRig) at(minutes int) time.Time {
	return testAt.Add(time.Duration(minutes) * time.Minute)
}

func (r *timelineRig) advanceTo(minutes int) { r.clock.advance(r.at(minutes).Sub(r.clock.Now())) }

func (r *timelineRig) timeline() *service.TimelineService {
	return service.NewTimelineService(r.store, failingQueries{
		resources:    r.resources,
		schadenplatz: r.schadenplaetze,
	})
}

func (r *timelineRig) alert(t *testing.T, name string) {
	t.Helper()

	in := alertInput(r.incidentID)
	in.Name = name

	state, err := r.res.AlertResource(ctx(), in, testActor)
	require.NoError(t, err)

	r.resources = append(
		r.resources,
		&outbound.ResourceRM{ID: uuid.UUID(state.ID), IncidentID: uuid.UUID(r.incidentID)},
	)
}

func (r *timelineRig) addSchadenplatz(t *testing.T, state inbound.SchadenplatzState) {
	t.Helper()

	r.schadenplaetze = append(r.schadenplaetze, &outbound.SchadenplatzRM{
		ID: uuid.UUID(state.ID), IncidentID: uuid.UUID(r.incidentID),
	})
}

func newTimelineRig(t *testing.T) *timelineRig {
	t.Helper()

	store := inmem.NewEventStore()
	clock := &steppedClock{t: testAt}
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(clock),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
	)

	incidents := eventstore.NewIncidentRepository(store)
	layers := eventstore.NewLayerRepository(store)
	spRepo := eventstore.NewSchadenplatzRepository(store)
	incSvc := factory.IncidentService(incidents, layers)
	incSvc.WithSchadenplatzRepository(spRepo)

	rig := &timelineRig{
		clock:    clock,
		store:    store,
		incident: incSvc,
		sp:       factory.SchadenplatzService(spRepo, incidents),
		res:      factory.ResourceService(eventstore.NewResourceRepository(store), incidents, spRepo),
	}

	// 0 min: the incident opens, with its default Schadenplatz.
	res, err := incSvc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)

	rig.incidentID = res.IncidentID

	inc, err := incSvc.LoadIncident(ctx(), res.IncidentID)
	require.NoError(t, err)
	require.NotNil(t, inc.DefaultSchadenplatzID())

	rig.addSchadenplatz(t, inbound.SchadenplatzState{ID: *inc.DefaultSchadenplatzID()})

	return rig
}

func names(states []inbound.ResourceState) []string {
	out := make([]string, len(states))
	for i, s := range states {
		out[i] = s.Name
	}

	return out
}

func spNames(states []inbound.SchadenplatzState) []string {
	out := make([]string, len(states))
	for i, s := range states {
		out[i] = s.Name
	}

	return out
}

func TestTimelineService_ResourcesAsOf(t *testing.T) {
	r := newTimelineRig(t)

	r.advanceTo(10)
	r.alert(t, "Zug A")
	r.advanceTo(20)
	r.alert(t, "Zug B")

	tl := r.timeline()

	tests := []struct {
		name    string
		minutes int
		want    []string
	}{
		{"before anything was alerted", 5, []string{}},
		{"when the first was alerted", 10, []string{"Zug A"}},
		{"between the two", 15, []string{"Zug A"}},
		{"when both were", 20, []string{"Zug A", "Zug B"}},
		{"long after", 600, []string{"Zug A", "Zug B"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tl.ResourcesAsOf(ctx(), r.incidentID, r.at(tt.minutes))
			require.NoError(t, err)
			assert.ElementsMatch(t, tt.want, names(got))
		})
	}
}

func TestTimelineService_SchadenplaetzeAsOf(t *testing.T) {
	r := newTimelineRig(t)

	r.advanceTo(5)

	zeta, err := r.sp.CreateSchadenplatz(ctx(), r.incidentID, "Zeta", nil, testActor)
	require.NoError(t, err)
	r.addSchadenplatz(t, zeta)

	r.advanceTo(6)

	beta, err := r.sp.CreateSchadenplatz(ctx(), r.incidentID, "Beta", nil, testActor)
	require.NoError(t, err)
	r.addSchadenplatz(t, beta)

	// Recorded an hour in, for a message of minute 10: the casualties belong to minute 10.
	r.advanceTo(60)

	lateMessage := r.at(10)
	_, err = r.sp.RecordCasualties(ctx(), zeta.ID, shared.MessageID(newID()),
		schadenplatz.CasualtyDeltas{Verletzte: 3}, &lateMessage, testActor)
	require.NoError(t, err)

	tl := r.timeline()

	t.Run("the default one comes first, the others by name", func(t *testing.T) {
		got, err := tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(30))
		require.NoError(t, err)
		assert.Equal(t, []string{"Allgemein", "Beta", "Zeta"}, spNames(got))
		assert.True(t, got[0].IsDefault)
	})

	t.Run("one that did not exist yet is left out", func(t *testing.T) {
		got, err := tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(5))
		require.NoError(t, err)
		assert.Equal(t, []string{"Allgemein", "Zeta"}, spNames(got))
	})

	t.Run("before the incident there is nothing", func(t *testing.T) {
		got, err := tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(-1))
		require.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("casualties count from the time of their message, not of their record", func(t *testing.T) {
		before, err := tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(9))
		require.NoError(t, err)

		after, err := tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(11))
		require.NoError(t, err)

		assert.Zero(t, casualtiesOf(t, before, "Zeta").Verletzte)
		assert.Equal(t, 3, casualtiesOf(t, after, "Zeta").Verletzte)
	})
}

func casualtiesOf(t *testing.T, states []inbound.SchadenplatzState, name string) schadenplatz.CasualtyTotals {
	t.Helper()

	for _, s := range states {
		if s.Name == name {
			return s.Casualties
		}
	}

	require.Failf(t, "not listed", "no Schadenplatz %q in %v", name, spNames(states))

	return schadenplatz.CasualtyTotals{}
}

// A Schadenplatz exists from the start however late it was recorded: a casualty stamped before its
// creation must not leave it without a name.
func TestTimelineService_SchadenplatzCreatedAfterItsCasualties(t *testing.T) {
	r := newTimelineRig(t)

	r.advanceTo(30)

	late, err := r.sp.CreateSchadenplatz(ctx(), r.incidentID, "Spät", nil, testActor)
	require.NoError(t, err)
	r.addSchadenplatz(t, late)

	earlier := r.at(10)
	_, err = r.sp.RecordCasualties(ctx(), late.ID, shared.MessageID(newID()),
		schadenplatz.CasualtyDeltas{Tote: 2}, &earlier, testActor)
	require.NoError(t, err)

	got, err := r.timeline().SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(15))
	require.NoError(t, err)
	assert.Equal(t, []string{"Allgemein", "Spät"}, spNames(got), "named, although created at minute 30")
	assert.Equal(t, 2, casualtiesOf(t, got, "Spät").Tote)

	none, err := r.timeline().SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(5))
	require.NoError(t, err)
	assert.Equal(t, []string{"Allgemein"}, spNames(none), "nothing had taken effect yet at minute 5")
}

// foreignStore replays an event the aggregate does not know.
type foreignStore struct{ outbound.EventStore }

func (foreignStore) LoadMany(
	_ context.Context,
	_ string,
	ids []uuid.UUID,
) (map[uuid.UUID][]eventsourcing.Event, error) {
	out := make(map[uuid.UUID][]eventsourcing.Event, len(ids))
	for _, id := range ids {
		out[id] = []eventsourcing.Event{{EventType: "Unheard", Version: 1, OccurredAt: testAt, Data: 42}}
	}

	return out, nil
}

func TestTimelineService_ReportsAStreamItCannotReplay(t *testing.T) {
	r := newTimelineRig(t)
	r.advanceTo(10)
	r.alert(t, "Zug A")

	tl := service.NewTimelineService(foreignStore{r.store}, failingQueries{
		resources: r.resources, schadenplatz: r.schadenplaetze,
	})

	_, err := tl.ResourcesAsOf(ctx(), r.incidentID, r.at(20))
	require.Error(t, err)

	_, err = tl.SchadenplaetzeAsOf(ctx(), r.incidentID, r.at(20))
	require.Error(t, err)
}
