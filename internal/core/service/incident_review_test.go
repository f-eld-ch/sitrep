package service_test

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// steppedClock is a clock the test moves forward by hand, so durations are exact.
type steppedClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *steppedClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.t
}

func (c *steppedClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.t = c.t.Add(d)
}

type kpiStack struct {
	clock     *steppedClock
	incidents *service.IncidentService
	messages  *service.MessageService
	proj      *projection.Projector
}

func newKPIStack(t *testing.T, withMessageSource bool) *kpiStack {
	t.Helper()

	store := inmem.NewEventStore()
	incH := projection.NewIncidentHandler()
	divH := projection.NewIncidentDivisionHandler()
	msgH := projection.NewMessageHandler()
	layerH := projection.NewLayerFeaturesHandler()
	spH := projection.NewSchadenplatzHandler()
	resourceH := projection.NewResourceHandler()

	clock := &steppedClock{t: testAt}
	queries := inmemqueries.NewQueries(incH, divH, msgH, layerH, spH, resourceH)
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(clock),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
		service.WithQueries(queries),
	)

	incidents := eventstore.NewIncidentRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)

	incidentSvc := factory.IncidentService(incidents, layers)
	if withMessageSource {
		incidentSvc.WithMessageSource(queries, messages)
	}

	return &kpiStack{
		clock:     clock,
		incidents: incidentSvc,
		messages:  factory.MessageService(messages, incidents),
		proj:      projection.NewProjector(store, []projection.Handler{incH, divH, msgH, layerH, spH}),
	}
}

func (s *kpiStack) record(t *testing.T, incidentID shared.IncidentID) shared.MessageID {
	t.Helper()

	state, err := s.messages.RecordMessage(ctx(), incidentID,
		"Pegel steigt", "Beobachter", "", "Führungsstab", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)

	return state.ID
}

func (s *kpiStack) triage(t *testing.T, id shared.MessageID, divisions ...shared.DivisionID) {
	t.Helper()

	_, err := s.messages.TriageMessage(ctx(), id, shared.TriageDone, shared.PriorityNormal, divisions, nil, testActor)
	require.NoError(t, err)
}

func TestIncidentService_IncidentReview(t *testing.T) {
	t.Run("reviews the messages of an incident", func(t *testing.T) {
		s := newKPIStack(t, true)

		created, err := s.incidents.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		id := created.IncidentID
		mapDivision := incident.MessageMapDivisionID(id)

		drawn := s.record(t, id)
		notDrawn := s.record(t, id)
		triagedOnly := s.record(t, id)
		_ = s.record(t, id) // never triaged

		s.clock.advance(5 * time.Minute)
		s.triage(t, drawn, mapDivision)
		s.triage(t, notDrawn, mapDivision)
		s.triage(t, triagedOnly)

		s.clock.advance(3 * time.Minute)
		_, err = s.messages.AcknowledgeMessage(ctx(), drawn, mapDivision, testActor)
		require.NoError(t, err)

		require.NoError(t, s.proj.CatchUp(ctx()))

		report, err := s.incidents.IncidentReview(ctx(), id)
		require.NoError(t, err)
		require.NotNil(t, report)

		assert.Equal(t, 4, report.Messages)
		assert.Equal(t, 4, report.Triage.Total)
		assert.Equal(t, 3, report.Triage.Completed)
		assert.Equal(t, 5*time.Minute, report.Triage.Duration.Median)

		assert.Equal(t, 2, report.Draw.Total, "the two triaged to the Nachrichtenkarte")
		assert.Equal(t, 1, report.Draw.Completed)
		assert.Equal(t, 3*time.Minute, report.Draw.Duration.Max)

		assert.Equal(t, 1, report.Unassigned, "triaged, but no division was given the message")
		assert.Nil(t, report.ClosedAt, "an open incident gets an interim status")
		require.NotEmpty(t, report.Divisions)

		var mapStat *kpi.DivisionStat

		for i := range report.Divisions {
			if report.Divisions[i].Division.Kind == shared.DivisionKindMessageMap {
				mapStat = &report.Divisions[i]
			}
		}

		require.NotNil(t, mapStat, "the Nachrichtenkarte is one of the divisions")
		assert.Equal(t, 2, mapStat.Assigned)
		assert.Equal(t, 1, mapStat.Acknowledged)
	})

	t.Run("a closed incident gives the same review, with when it was closed", func(t *testing.T) {
		s := newKPIStack(t, true)

		created, err := s.incidents.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		id := created.IncidentID

		msg := s.record(t, id)
		s.clock.advance(4 * time.Minute)
		s.triage(t, msg)
		require.NoError(t, s.proj.CatchUp(ctx()))

		before, err := s.incidents.IncidentReview(ctx(), id)
		require.NoError(t, err)

		s.clock.advance(time.Hour)

		_, err = s.incidents.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		after, err := s.incidents.IncidentReview(ctx(), id)
		require.NoError(t, err)
		require.NotNil(t, after.ClosedAt)

		assert.Equal(t, before.Triage, after.Triage)
		assert.Equal(t, before.Messages, after.Messages)
	})

	t.Run("an incident without messages has a review without ratios", func(t *testing.T) {
		s := newKPIStack(t, true)

		created, err := s.incidents.CreateIncident(ctx(), "Leer", nil, nil, nil, testActor)
		require.NoError(t, err)

		report, err := s.incidents.IncidentReview(ctx(), created.IncidentID)
		require.NoError(t, err)
		require.NotNil(t, report)
		assert.Zero(t, report.Messages)
		assert.Nil(t, report.Triage.Ratio())
	})

	t.Run("there is none without a message source", func(t *testing.T) {
		s := newKPIStack(t, false)

		created, err := s.incidents.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		report, err := s.incidents.IncidentReview(ctx(), created.IncidentID)
		require.NoError(t, err)
		assert.Nil(t, report)
	})

	t.Run("an unknown incident is not found", func(t *testing.T) {
		s := newKPIStack(t, true)

		_, err := s.incidents.IncidentReview(ctx(), shared.IncidentID(newID()))
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})
}
