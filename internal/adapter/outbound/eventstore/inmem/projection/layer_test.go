package projection_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// layerStack wires the full inmem stack including the LayerFeaturesHandler.
type layerStack struct {
	factory  *service.Factory
	store    *inmem.EventStore
	proj     *projection.Projector
	layers   *projection.LayerFeaturesHandler
}

func newLayerStack(t *testing.T) *layerStack {
	t.Helper()
	store := inmem.NewEventStore()
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
	)
	layers := projection.NewLayerFeaturesHandler()
	proj := projection.NewProjector(store, []projection.Handler{
		projection.NewIncidentHandler(),
		projection.NewIncidentDivisionHandler(),
		projection.NewMessageHandler(),
		layers,
	})
	return &layerStack{factory: factory, store: store, proj: proj, layers: layers}
}

func (s *layerStack) incidentSvc() inbound.IncidentService {
	return s.factory.IncidentService(
		eventstore.NewIncidentRepository(s.store),
		eventstore.NewLayerRepository(s.store),
	)
}

func (s *layerStack) layerSvc() inbound.LayerService {
	return s.factory.LayerService(eventstore.NewLayerRepository(s.store))
}

func (s *layerStack) featureSvc() inbound.FeatureService {
	return s.factory.FeatureService(eventstore.NewFeatureRepository(s.store))
}

// ── Layer events ──────────────────────────────────────────────────────────────

func TestLayerHandler_LayerCreatedViaIncident(t *testing.T) {
	s := newLayerStack(t)

	res, err := s.incidentSvc().CreateIncident(ctx(), "Hochwasser", nil, nil, []string{"Ops Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(res.IncidentID))
	require.Len(t, rows, 1)
	assert.Equal(t, "Ops Map", rows[0].Name)
	assert.Equal(t, uuid.UUID(res.IncidentID), rows[0].IncidentID)
}

func TestLayerHandler_LayerCreatedExplicitly(t *testing.T) {
	s := newLayerStack(t)

	// CreateIncident always creates one default layer; add one more explicitly.
	inc, err := s.incidentSvc().CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	require.NoError(t, err)

	_, err = s.layerSvc().CreateLayer(ctx(), inc.IncidentID, "Sector A", testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	assert.Len(t, rows, 2, "default layer + explicitly created layer")
	names := make([]string, len(rows))
	for i, r := range rows {
		names[i] = r.Name
	}
	assert.Contains(t, names, "Sector A")
}

func TestLayerHandler_MultipleLayersForIncident(t *testing.T) {
	s := newLayerStack(t)

	// CreateIncident creates one default layer; add two more explicitly → 3 total.
	inc, err := s.incidentSvc().CreateIncident(ctx(), "Multi-Layer", nil, nil, nil, testActor)
	require.NoError(t, err)

	_, err = s.layerSvc().CreateLayer(ctx(), inc.IncidentID, "Alpha", testActor)
	require.NoError(t, err)
	_, err = s.layerSvc().CreateLayer(ctx(), inc.IncidentID, "Bravo", testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	assert.Len(t, rows, 3)
}

func TestLayerHandler_LayersSegregatedByIncident(t *testing.T) {
	s := newLayerStack(t)

	incA, err := s.incidentSvc().CreateIncident(ctx(), "A", nil, nil, []string{"Map A"}, testActor)
	require.NoError(t, err)
	incB, err := s.incidentSvc().CreateIncident(ctx(), "B", nil, nil, []string{"Map B"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rowsA := s.layers.ForIncident(uuid.UUID(incA.IncidentID))
	rowsB := s.layers.ForIncident(uuid.UUID(incB.IncidentID))
	require.Len(t, rowsA, 1)
	require.Len(t, rowsB, 1)
	assert.Equal(t, "Map A", rowsA[0].Name)
	assert.Equal(t, "Map B", rowsB[0].Name)
}

// ── Feature events ────────────────────────────────────────────────────────────

var (
	testGeometry   = map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}
	testProperties = map[string]any{"label": "Station 1"}
)

func TestLayerHandler_FeaturePlaced(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Feature Test", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	layerID := inc.LayerIDs[0]
	featureID := shared.FeatureID(uuid.New())

	err = s.featureSvc().PlaceFeature(ctx(), featureID, inc.IncidentID, layerID, testGeometry, testProperties, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	require.Len(t, rows, 1)
	assert.Len(t, rows[0].Features, 1)
	assert.Equal(t, 1, rows[0].Revision)
}

func TestLayerHandler_FeaturePlaced_GeoJSONContainsFeature(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "GeoJSON Test", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	layerID := inc.LayerIDs[0]
	featureID := shared.FeatureID(uuid.New())

	err = s.featureSvc().PlaceFeature(ctx(), featureID, inc.IncidentID, layerID, testGeometry, testProperties, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	gj := s.layers.ForIncident(uuid.UUID(inc.IncidentID))[0].GeoJSON()
	var fc struct {
		Type     string `json:"type"`
		Features []struct {
			ID string `json:"id"`
		} `json:"features"`
	}
	require.NoError(t, json.Unmarshal(gj, &fc))
	assert.Equal(t, "FeatureCollection", fc.Type)
	require.Len(t, fc.Features, 1)
	assert.Equal(t, uuid.UUID(featureID).String(), fc.Features[0].ID)
}

func TestLayerHandler_FeatureRemoved(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Remove Test", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	layerID := inc.LayerIDs[0]
	featureID := shared.FeatureID(uuid.New())

	err = s.featureSvc().PlaceFeature(ctx(), featureID, inc.IncidentID, layerID, testGeometry, testProperties, testActor)
	require.NoError(t, err)

	err = s.featureSvc().RemoveFeature(ctx(), featureID, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	require.Len(t, rows, 1)
	assert.Empty(t, rows[0].Features)
	assert.Equal(t, 2, rows[0].Revision, "place+remove = 2 revisions")
}

func TestLayerHandler_MultipleFeatures_RevisionTracked(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Revision Test", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	layerID := inc.LayerIDs[0]
	f1 := shared.FeatureID(uuid.New())
	f2 := shared.FeatureID(uuid.New())

	require.NoError(t, s.featureSvc().PlaceFeature(ctx(), f1, inc.IncidentID, layerID, testGeometry, testProperties, testActor))
	require.NoError(t, s.featureSvc().PlaceFeature(ctx(), f2, inc.IncidentID, layerID, testGeometry, testProperties, testActor))
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	require.Len(t, rows, 1)
	assert.Len(t, rows[0].Features, 2)
	assert.Equal(t, 2, rows[0].Revision)
}

// ── GeoJSON helpers ───────────────────────────────────────────────────────────

func TestLayerHandler_GeoJSON_EmptyLayer(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Empty Layer", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	require.Len(t, rows, 1)

	var fc struct {
		Type     string        `json:"type"`
		Features []interface{} `json:"features"`
	}
	require.NoError(t, json.Unmarshal(rows[0].GeoJSON(), &fc))
	assert.Equal(t, "FeatureCollection", fc.Type)
	assert.Empty(t, fc.Features)
}

// ── Reset ─────────────────────────────────────────────────────────────────────

func TestLayerHandler_Reset_RebuildsFromLog(t *testing.T) {
	s := newLayerStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Reset", nil, nil, []string{"Map"}, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))
	require.Len(t, s.layers.ForIncident(uuid.UUID(inc.IncidentID)), 1)

	require.NoError(t, s.proj.Reset(ctx()))

	rows := s.layers.ForIncident(uuid.UUID(inc.IncidentID))
	require.Len(t, rows, 1, "Reset must replay from event log")
	assert.Equal(t, "Map", rows[0].Name)
}
