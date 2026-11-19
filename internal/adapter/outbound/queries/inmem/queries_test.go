package inmem_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	queries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

type obj = map[string]any

func tm(minutes int) time.Time {
	return time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC).Add(time.Duration(minutes) * time.Minute)
}

func evt(streamType string, id uuid.UUID, eventType string, data any, at time.Time) eventsourcing.Event {
	return eventsourcing.Event{
		StreamType: streamType, StreamID: id, EventType: eventType, Data: data, OccurredAt: at, RecordedAt: at,
	}
}

// readable allows reading the listed incidents; every other incident, and any lookup that
// fails, is refused.
type readable struct {
	allowed map[uuid.UUID]bool
	failOn  uuid.UUID
}

func (r readable) Can(_ context.Context, _ string, id shared.IncidentID, action access.Action) (bool, error) {
	if uuid.UUID(id) == r.failOn {
		return false, errors.New("checker down")
	}

	return action == access.IncidentRead && r.allowed[uuid.UUID(id)], nil
}

// world is a small set of projected handlers shared by the tests.
type world struct {
	incidents *projection.IncidentHandler
	divisions *projection.IncidentDivisionHandler
	messages  *projection.MessageHandler
	layers    *projection.LayerFeaturesHandler
	sites     *projection.SchadenplatzHandler
	resources *projection.ResourceHandler
}

func newWorld(t *testing.T, events ...eventsourcing.Event) *world {
	t.Helper()

	w := &world{
		incidents: projection.NewIncidentHandler(),
		divisions: projection.NewIncidentDivisionHandler(),
		messages:  projection.NewMessageHandler(),
		layers:    projection.NewLayerFeaturesHandler(),
		sites:     projection.NewSchadenplatzHandler(),
		resources: projection.NewResourceHandler(),
	}

	for _, e := range events {
		for _, h := range []projection.Handler{w.incidents, w.divisions, w.messages, w.layers, w.sites, w.resources} {
			if h.Handles(e.StreamType, e.EventType) {
				require.NoError(t, h.Apply(t.Context(), e), "%s/%s", e.StreamType, e.EventType)
			}
		}
	}

	return w
}

func (w *world) queries(checker ...readable) *queries.Queries {
	if len(checker) == 0 {
		return queries.NewQueries(w.incidents, w.divisions, w.messages, w.layers, w.sites, w.resources)
	}

	return queries.NewQueries(w.incidents, w.divisions, w.messages, w.layers, w.sites, w.resources, checker[0])
}

func opened(id uuid.UUID, name string, minute int) eventsourcing.Event {
	return evt("Incident", id, "Opened", obj{"name": name}, tm(minute))
}

func linked(child, parent uuid.UUID) eventsourcing.Event {
	return evt("Incident", child, "ParentLinked", obj{"parentId": parent.String()}, tm(10))
}

func layerOf(layer, inc uuid.UUID, name string) eventsourcing.Event {
	return evt("Layer", layer, "Created", obj{"incidentId": inc.String(), "name": name, "kind": ""}, tm(0))
}

func messageOf(msg, inc uuid.UUID, minute, createdMinute int) eventsourcing.Event {
	return evt("Message", msg, "Recorded", obj{
		"incidentId": inc.String(), "content": "c", "time": tm(minute), "authorSub": "a",
	}, tm(createdMinute))
}

func withActor(ctx context.Context) context.Context {
	return identity.WithActor(ctx, identity.Actor{Sub: "reader"})
}

func TestQueries_ReadAccessIsEnforcedPerIncident(t *testing.T) {
	visible, hidden, childOK, childHidden := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	layerVisible, layerHidden, layerChildOK, layerChildHidden := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	msgVisible, msgHidden := uuid.New(), uuid.New()
	feature := uuid.New()
	resVisible, resChildHidden := uuid.New(), uuid.New()

	w := newWorld(t,
		opened(visible, "Visible", 0),
		opened(hidden, "Hidden", 1),
		opened(childOK, "Child ok", 2),
		opened(childHidden, "Child hidden", 3),
		linked(childOK, visible),
		linked(childHidden, visible),
		evt("Incident", visible, "ReviewSummarised", obj{"summary": obj{"version": 1}}, tm(4)),
		evt("Incident", hidden, "ReviewSummarised", obj{"summary": obj{"version": 1}}, tm(4)),
		layerOf(layerVisible, visible, "Own"),
		layerOf(layerHidden, hidden, "Hidden layer"),
		layerOf(layerChildOK, childOK, "Child layer"),
		layerOf(layerChildHidden, childHidden, "Hidden child layer"),
		messageOf(msgVisible, visible, 1, 1),
		messageOf(msgHidden, hidden, 1, 1),
		evt("Feature", feature, "Placed", obj{
			"incidentId": childOK.String(), "layerId": layerChildOK.String(),
			"geometry": obj{"type": "Point", "coordinates": []int{1, 1}}, "properties": obj{},
		}, tm(5)),
		evt("Resource", resVisible, "Alerted", obj{
			"incidentId": visible.String(), "schadenplatzId": uuid.NewString(), "name": "R", "personnelCount": 1,
		}, tm(5)),
		evt("Resource", resChildHidden, "Alerted", obj{
			"incidentId": childHidden.String(), "schadenplatzId": uuid.NewString(), "name": "RH", "personnelCount": 1,
		}, tm(5)),
	)

	// Reading is refused for the incidents the checker does not allow.
	q := w.queries(readable{allowed: map[uuid.UUID]bool{visible: true, childOK: true}})
	ctx := withActor(t.Context())

	t.Run("incident listings leave out what cannot be read", func(t *testing.T) {
		list, err := q.ListIncidents(ctx)
		require.NoError(t, err)

		ids := []uuid.UUID{}
		for _, i := range list {
			ids = append(ids, i.ID)
		}

		assert.ElementsMatch(t, []uuid.UUID{visible, childOK}, ids)

		children, err := q.ListChildIncidents(ctx, visible)
		require.NoError(t, err)
		require.Len(t, children, 1)
		assert.Equal(t, childOK, children[0].ID)

		summaries, err := q.ListReviewSummaries(ctx)
		require.NoError(t, err)
		require.Len(t, summaries, 1)
		assert.Equal(t, visible, summaries[0].IncidentID)
	})

	t.Run("single reads of an unreadable incident look like a missing one", func(t *testing.T) {
		_, err := q.GetIncident(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.GetMessage(ctx, msgHidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.ListMessages(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.ListLayers(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.ListVisibleLayers(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.ListFeatureChanges(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		_, err = q.ListResourcesForIncident(ctx, hidden)
		require.ErrorIs(t, err, shared.ErrNotFound)

		got, err := q.GetMessage(ctx, msgVisible)
		require.NoError(t, err)
		assert.Equal(t, msgVisible, got.ID)
	})

	t.Run("the map of an incident includes the layers of readable children only", func(t *testing.T) {
		layers, err := q.ListVisibleLayers(ctx, visible)
		require.NoError(t, err)

		names := []string{}
		for _, l := range layers {
			names = append(names, l.Name)
		}

		assert.Equal(t, []string{"Own", "Child layer"}, names, "own layers first")
		assert.Equal(t, "Child ok", layers[1].SourceIncidentName)
		assert.Equal(t, childOK, layers[1].SourceIncidentID)

		own, err := q.ListLayers(ctx, visible)
		require.NoError(t, err)
		require.Len(t, own, 1, "ListLayers does not look at children")
		assert.Equal(t, "Own", own[0].Name)
	})

	t.Run("feature changes and resources include readable children only", func(t *testing.T) {
		changes, err := q.ListFeatureChanges(ctx, visible)
		require.NoError(t, err)
		require.Len(t, changes, 1)
		assert.Equal(t, feature, changes[0].FeatureID)
		assert.Equal(t, "placed", changes[0].Change)

		resources, err := q.ListResourcesForIncident(ctx, visible)
		require.NoError(t, err)
		require.Len(t, resources, 1)
		assert.Equal(t, resVisible, resources[0].ID)
	})

	t.Run("without an actor nothing can be read", func(t *testing.T) {
		list, err := q.ListIncidents(t.Context())
		require.NoError(t, err)
		assert.Empty(t, list)

		_, err = q.GetIncident(t.Context(), visible)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a failing access check counts as no access", func(t *testing.T) {
		failing := w.queries(readable{allowed: map[uuid.UUID]bool{visible: true}, failOn: visible})

		_, err := failing.GetIncident(ctx, visible)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("without a checker everything is readable", func(t *testing.T) {
		list, err := w.queries().ListIncidents(t.Context())
		require.NoError(t, err)
		assert.Len(t, list, 4)
	})
}

func TestQueries_Ordering(t *testing.T) {
	a, b, c, d := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	m1, m2, m3 := uuid.New(), uuid.New(), uuid.New()

	w := newWorld(t,
		opened(a, "A", 1),
		opened(b, "B", 3),
		opened(c, "C", 2),
		evt("Incident", d, "Opened", obj{"name": "Deleted"}, tm(9)),
		evt("Incident", d, "Deleted", obj{}, tm(10)),
		linked(a, c),
		linked(b, c),
		messageOf(m1, a, 5, 1),
		messageOf(m2, a, 9, 2),
		messageOf(m3, a, 9, 3),
		evt("Message", uuid.New(), "Recorded", obj{
			"incidentId": uuid.NewString(), "content": "other", "time": tm(1),
		}, tm(1)),
		layerOf(uuid.New(), c, "Zeta"),
		layerOf(uuid.New(), c, "Alpha"),
		layerOf(uuid.New(), a, "Map of A"),
		layerOf(uuid.New(), b, "Map of B"),
		layerOf(uuid.New(), b, "Another of B"),
	)

	q := w.queries()

	t.Run("incidents come newest first and without deleted ones", func(t *testing.T) {
		list, err := q.ListIncidents(t.Context())
		require.NoError(t, err)

		names := []string{}
		for _, i := range list {
			names = append(names, i.Name)
		}

		assert.Equal(t, []string{"B", "C", "A"}, names)
	})

	t.Run("child incidents come newest first", func(t *testing.T) {
		children, err := q.ListChildIncidents(t.Context(), c)
		require.NoError(t, err)
		require.Len(t, children, 2)
		assert.Equal(t, b, children[0].ID)
		assert.Equal(t, a, children[1].ID)
		require.NotNil(t, children[0].ParentID)
		assert.Equal(t, c, *children[0].ParentID)
	})

	t.Run("messages come by time, newest first, and the later recorded first on a tie", func(t *testing.T) {
		list, err := q.ListMessages(t.Context(), a)
		require.NoError(t, err)

		ids := []uuid.UUID{}
		for _, m := range list {
			ids = append(ids, m.ID)
		}

		assert.Equal(t, []uuid.UUID{m3, m2, m1}, ids)
	})

	t.Run("a deleted or unknown message is not found", func(t *testing.T) {
		_, err := q.GetMessage(t.Context(), uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		w2 := newWorld(t, messageOf(m1, a, 1, 1), evt("Message", m1, "Deleted", obj{}, tm(2)))
		_, err = w2.queries().GetMessage(t.Context(), m1)
		require.ErrorIs(t, err, shared.ErrNotFound)

		list, err := w2.queries().ListIncidentMessageIDs(t.Context(), a)
		require.NoError(t, err)
		assert.Empty(t, list)
	})

	t.Run("visible layers: own first, then other incidents by name, each by layer name", func(t *testing.T) {
		layers, err := q.ListVisibleLayers(t.Context(), c)
		require.NoError(t, err)

		names := []string{}
		for _, l := range layers {
			names = append(names, l.Name)
		}

		assert.Equal(t, []string{"Alpha", "Zeta", "Map of A", "Another of B", "Map of B"}, names)
	})
}

func TestQueries_IncidentRMCarriesDivisionsAndReview(t *testing.T) {
	inc, d1 := uuid.New(), uuid.New()

	w := newWorld(
		t,
		evt(
			"Incident",
			inc,
			"Opened",
			obj{"name": "X", "divisions": []obj{{"id": d1.String(), "name": "Fire"}}},
			tm(0),
		),
		evt("Incident", inc, "DivisionKindAssigned", obj{"id": d1.String(), "kind": "FIRE"}, tm(1)),
		evt("Incident", inc, "Closed", obj{}, tm(2)),
	)
	q := w.queries()

	got, err := q.GetIncident(t.Context(), inc)
	require.NoError(t, err)
	assert.True(t, got.IsClosed)
	assert.False(t, got.HasReview)
	require.Len(t, got.Divisions, 1)
	assert.Equal(t, "Fire", got.Divisions[0].Name)
	assert.Equal(t, "FIRE", got.Divisions[0].Kind)

	t.Run("a closed incident is due for review until its headline is up to date", func(t *testing.T) {
		due, err := q.ListClosedIncidentsForReview(t.Context(), 1)
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{inc}, due)

		w := newWorld(t,
			opened(inc, "X", 0),
			evt("Incident", inc, "Closed", obj{}, tm(1)),
			evt("Incident", inc, "ReviewSummarised", obj{"summary": obj{"version": 2}}, tm(2)),
		)

		due, err = w.queries().ListClosedIncidentsForReview(t.Context(), 2)
		require.NoError(t, err)
		assert.Empty(t, due, "a summary at the current version is not stale")

		due, err = w.queries().ListClosedIncidentsForReview(t.Context(), 3)
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{inc}, due, "an older summary is due again")

		got, err := w.queries().GetIncident(t.Context(), inc)
		require.NoError(t, err)
		assert.True(t, got.HasReview)
	})
}

func TestQueries_ResourcesCarryTheirDeploymentLocationAndHistory(t *testing.T) {
	inc, sp, res := uuid.New(), uuid.New(), uuid.New()

	w := newWorld(
		t,
		opened(inc, "X", 0),
		evt("Resource", res, "Alerted", obj{
			"incidentId": inc.String(), "schadenplatzId": sp.String(), "formation": "FW", "name": "Zug",
			"personnelCount": 5, "hauptaufgabe": "Löschen",
		}, tm(1)),
		evt("Resource", res, "MarkedReady", obj{}, tm(2)),
		evt(
			"Resource",
			res,
			"DeploymentLocationUpdated",
			obj{"location": obj{"lat": 1.0, "lng": 2.0, "label": "Brücke"}},
			tm(3),
		),
		evt("Resource", res, "Deployed", obj{"deploymentLocation": obj{"label": "Brücke"}}, tm(4)),
		evt("Resource", res, "StoodDown", obj{}, tm(5)),
	)
	q := w.queries()

	got, err := q.GetResource(t.Context(), res)
	require.NoError(t, err)
	require.NotNil(t, got.DeploymentLocation)
	assert.InDelta(t, 1.0, *got.DeploymentLocation.Lat, 1e-9)
	assert.InDelta(t, 2.0, *got.DeploymentLocation.Lng, 1e-9)
	assert.Equal(t, "Brücke", got.DeploymentLocation.Label)
	assert.Equal(t, "EINSATZBEREIT", got.Status)

	require.Len(t, got.DeploymentHistory, 1)
	assert.Equal(t, tm(4), got.DeploymentHistory[0].StartedAt)
	require.NotNil(t, got.DeploymentHistory[0].EndedAt)
	assert.Equal(t, tm(5), *got.DeploymentHistory[0].EndedAt)
	assert.Equal(t, "Löschen", got.DeploymentHistory[0].Hauptaufgabe)
	require.NotNil(t, got.DeploymentHistory[0].DeploymentLabel)
	assert.Equal(t, "Brücke", *got.DeploymentHistory[0].DeploymentLabel)

	t.Run("a location without a label has an empty one; without coordinates there is none", func(t *testing.T) {
		w := newWorld(t,
			evt("Resource", res, "Alerted", obj{
				"incidentId": inc.String(), "schadenplatzId": sp.String(), "name": "Zug", "personnelCount": 1,
			}, tm(1)),
			evt("Resource", res, "DeploymentLocationUpdated", obj{"location": obj{"lat": 1.0, "lng": 2.0}}, tm(2)),
		)

		got, err := w.queries().GetResource(t.Context(), res)
		require.NoError(t, err)
		require.NotNil(t, got.DeploymentLocation)
		assert.Empty(t, got.DeploymentLocation.Label)

		w = newWorld(t,
			evt("Resource", res, "Alerted", obj{
				"incidentId": inc.String(), "schadenplatzId": sp.String(), "name": "Zug", "personnelCount": 1,
			}, tm(1)),
			evt("Resource", res, "DeploymentLocationUpdated", obj{"location": obj{"label": "only a label"}}, tm(2)),
		)

		got, err = w.queries().GetResource(t.Context(), res)
		require.NoError(t, err)
		assert.Nil(t, got.DeploymentLocation)
	})
}

func TestQueries_ListUsersHasNoUserDirectory(t *testing.T) {
	users, err := queries.NewAccessQueries(projection.NewAccessHandler()).ListUsers(t.Context())
	require.NoError(t, err)
	assert.NotNil(t, users)
	assert.Empty(t, users, "the in-memory stack has no user repository to list")
}
