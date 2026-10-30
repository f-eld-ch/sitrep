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
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
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
	// attachMessageSource gives the incident service the means to review messages after the fact,
	// as it has once a deployment has been brought up to date.
	attachMessageSource func()
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

		attachMessageSource: func() { incidentSvc.WithMessageSource(queries, messages) },
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

// closedIncident opens an incident, has one message triaged after `triageAfter`, and closes it.
func (s *kpiStack) closedIncident(t *testing.T, name string, triageAfter time.Duration) shared.IncidentID {
	t.Helper()

	created, err := s.incidents.CreateIncident(ctx(), name, nil, nil, nil, testActor)
	require.NoError(t, err)

	id := created.IncidentID
	msg := s.record(t, id)

	s.clock.advance(triageAfter)
	s.triage(t, msg)
	require.NoError(t, s.proj.CatchUp(ctx()))

	_, err = s.incidents.CloseIncident(ctx(), id, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	return id
}

func TestIncidentService_ClosingKeepsAReviewSummary(t *testing.T) {
	t.Run("the headline of the review is kept with the closed incident", func(t *testing.T) {
		s := newKPIStack(t, true)
		id := s.closedIncident(t, "Hochwasser", 3*time.Minute)

		inc, err := s.incidents.LoadIncident(ctx(), id)
		require.NoError(t, err)

		summary := inc.ReviewSummary()
		require.NotNil(t, summary)
		assert.Equal(t, kpi.SummaryVersion, summary.Version)
		assert.Equal(t, 1, summary.Messages)
		assert.Equal(t, 1, summary.TriageCompleted)
		assert.Equal(t, int64(3*60*1000), summary.TriageMedianMs)
	})

	t.Run("reopening drops it, and closing again keeps a new one", func(t *testing.T) {
		s := newKPIStack(t, true)
		id := s.closedIncident(t, "Hochwasser", time.Minute)

		_, err := s.incidents.ReopenIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err := s.incidents.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.Nil(t, inc.ReviewSummary())

		_, err = s.incidents.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err = s.incidents.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.NotNil(t, inc.ReviewSummary())
	})

	t.Run("an incident still closes when the headline cannot be kept", func(t *testing.T) {
		s := newKPIStack(t, false) // no way to look at the messages

		created, err := s.incidents.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		_, err = s.incidents.CloseIncident(ctx(), created.IncidentID, testActor)
		require.NoError(t, err)

		inc, err := s.incidents.LoadIncident(ctx(), created.IncidentID)
		require.NoError(t, err)
		assert.True(t, inc.IsClosed())
		assert.Nil(t, inc.ReviewSummary())
	})
}

func TestIncidentService_CompareIncident(t *testing.T) {
	t.Run("places an incident among the other closed ones, leaving itself out", func(t *testing.T) {
		s := newKPIStack(t, true)

		var ids []shared.IncidentID

		for i, minutes := range []int{1, 2, 3, 4, 5, 6} {
			ids = append(ids, s.closedIncident(t, "Einsatz "+string(rune('A'+i)), time.Duration(minutes)*time.Minute))
		}

		// The incident being looked at is one of the closed ones: it must not be its own peer.
		report, err := s.incidents.IncidentReview(ctx(), ids[2]) // 3 minutes
		require.NoError(t, err)

		cmp, err := s.incidents.CompareIncident(ctx(), ids[2], kpi.Summarize(*report))
		require.NoError(t, err)

		b := cmp.TriageMedian
		assert.Equal(t, 5, b.Peers, "the other five")
		assert.True(t, b.Sufficient)
		require.NotNil(t, b.Value)
		assert.InDelta(t, 180.0, *b.Value, 1e-9)
		require.NotNil(t, b.BetterThan)
		assert.InDelta(t, 0.6, *b.BetterThan, 1e-9, "faster than 4, 5 and 6 minutes, slower than 1 and 2")
	})

	t.Run("says nothing with too few other incidents", func(t *testing.T) {
		s := newKPIStack(t, true)
		id := s.closedIncident(t, "Einziger", time.Minute)

		report, err := s.incidents.IncidentReview(ctx(), id)
		require.NoError(t, err)

		cmp, err := s.incidents.CompareIncident(ctx(), id, kpi.Summarize(*report))
		require.NoError(t, err)
		assert.Zero(t, cmp.TriageMedian.Peers)
		assert.False(t, cmp.TriageMedian.Sufficient)
		assert.Nil(t, cmp.TriageMedian.BetterThan)
	})
}

func TestIncidentService_BackfillReviewSummaries(t *testing.T) {
	t.Run("keeps the headline of incidents that were closed without one", func(t *testing.T) {
		// Closed before the headline was kept: nothing to look at the messages with.
		s := newKPIStack(t, false)
		id := s.closedIncident(t, "Alt", 4*time.Minute)

		inc, err := s.incidents.LoadIncident(ctx(), id)
		require.NoError(t, err)
		require.Nil(t, inc.ReviewSummary())

		s.attachMessageSource()

		result, err := s.incidents.BackfillReviewSummaries(ctx(), "system")
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{Recorded: 1}, result)
		require.NoError(t, s.proj.CatchUp(ctx()))

		inc, err = s.incidents.LoadIncident(ctx(), id)
		require.NoError(t, err)
		require.NotNil(t, inc.ReviewSummary())
		assert.Equal(t, int64(4*60*1000), inc.ReviewSummary().TriageMedianMs)
	})

	t.Run("can be run again without touching what has a headline", func(t *testing.T) {
		s := newKPIStack(t, false)
		s.closedIncident(t, "Alt", time.Minute)
		s.attachMessageSource()

		_, err := s.incidents.BackfillReviewSummaries(ctx(), "system")
		require.NoError(t, err)
		require.NoError(t, s.proj.CatchUp(ctx()))

		again, err := s.incidents.BackfillReviewSummaries(ctx(), "system")
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{}, again)
	})

	t.Run("leaves open incidents alone", func(t *testing.T) {
		s := newKPIStack(t, true)

		_, err := s.incidents.CreateIncident(ctx(), "Offen", nil, nil, nil, testActor)
		require.NoError(t, err)
		require.NoError(t, s.proj.CatchUp(ctx()))

		result, err := s.incidents.BackfillReviewSummaries(ctx(), "system")
		require.NoError(t, err)
		assert.Equal(t, inbound.BackfillResult{}, result)
	})

	t.Run("refuses without a way to look at the messages", func(t *testing.T) {
		s := newKPIStack(t, false)

		_, err := s.incidents.BackfillReviewSummaries(ctx(), "system")
		require.Error(t, err)
	})
}
