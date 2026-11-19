package projection_test

import (
	"database/sql"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type storedFeature struct {
	ID         string          `json:"id"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties json.RawMessage `json:"properties"`
}

func point(lng, lat float64) map[string]any {
	return map[string]any{"type": "Point", "coordinates": []float64{lng, lat}}
}

// layerFeatures returns the features of the layer in z-order.
func layerFeatures(t *testing.T, h *harness) []storedFeature {
	t.Helper()

	var doc struct {
		Features []storedFeature `json:"features"`
	}

	require.NoError(t, json.Unmarshal([]byte(h.col("readmodel_layer_features", "geojson", idLayer)), &doc))

	return doc.Features
}

func newLayerHarness(t *testing.T) *harness {
	t.Helper()

	return newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewLayerFeaturesHandler(db) })
}

func TestLayerHandler_LayerLifecycle(t *testing.T) {
	h := newLayerHarness(t)

	events := []eventsourcing.Event{
		h.event(
			"Layer",
			idLayer,
			1,
			"Created",
			0,
			map[string]any{"incidentId": idInc1, "name": "Roads", "kind": "NONE"},
		),
		h.event("Layer", idLayer, 2, "KindAssigned", 1, map[string]any{"kind": "MESSAGE_MAP"}),
		h.event("Layer", idLayer, 3, "Renamed", 2, map[string]any{"name": "Nachrichtenkarte"}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_layer_features")

	assert.Equal(t, idInc1, h.col("readmodel_layer_features", "incident_id", idLayer))
	assert.Equal(t, "Nachrichtenkarte", h.col("readmodel_layer_features", "name", idLayer))
	assert.Equal(t, "MESSAGE_MAP", h.col("readmodel_layer_features", "kind", idLayer))
	assert.Equal(t, "0", h.col("readmodel_layer_features", "removed", idLayer))
	assert.JSONEq(
		t,
		`{"type":"FeatureCollection","features":[]}`,
		h.col("readmodel_layer_features", "geojson", idLayer),
	)

	h.apply(h.event("Layer", idLayer, 4, "Removed", 3, map[string]any{}))
	assert.Equal(t, "1", h.col("readmodel_layer_features", "removed", idLayer))

	// Imported layers are created the same way.
	h.apply(h.event("Layer", idLayer, 1, "Imported", 4,
		map[string]any{"incidentId": idInc1, "name": "Imported", "kind": "NONE"}))
	assert.Equal(t, "Imported", h.col("readmodel_layer_features", "name", idLayer))
}

func TestLayerHandler_FeatureLifecycle(t *testing.T) {
	h := newLayerHarness(t)

	h.apply(h.event("Layer", idLayer, 1, "Created", 0, map[string]any{"incidentId": idInc1, "name": "L"}))

	events := []eventsourcing.Event{
		h.event("Feature", idFeat1, 1, "Placed", 1, map[string]any{
			"incidentId": idInc1,
			"layerId":    idLayer,
			"geometry":   point(8, 47),
			"properties": map[string]any{"label": "A"},
		}),
		h.event("Feature", idFeat2, 1, "Placed", 2, map[string]any{
			"incidentId": idInc1,
			"layerId":    idLayer,
			"geometry":   point(9, 48),
			"properties": map[string]any{"label": "B"},
		}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_layer_features", "readmodel_feature_change")

	features := layerFeatures(t, h)
	require.Len(t, features, 2)
	assert.Equal(t, idFeat1, features[0].ID, "features keep their drawing order")
	assert.Equal(t, idFeat2, features[1].ID)
	assert.Equal(t, "2", h.col("readmodel_layer_features", "revision", idLayer))

	h.apply(h.event("Feature", idFeat1, 2, "Moved", 3, map[string]any{"geometry": point(10, 49)}))
	h.apply(h.event("Feature", idFeat2, 2, "Restyled", 4, map[string]any{"properties": map[string]any{"label": "B2"}}))

	features = layerFeatures(t, h)
	require.Len(t, features, 2)
	assert.JSONEq(t, `{"type":"Point","coordinates":[10,49]}`, string(features[0].Geometry))
	assert.JSONEq(t, `{"label":"B2"}`, string(features[1].Properties))
	assert.Equal(t, "4", h.col("readmodel_layer_features", "revision", idLayer))

	// Restyling with the same properties is no change.
	h.apply(h.event("Feature", idFeat2, 3, "Restyled", 5, map[string]any{"properties": map[string]any{"label": "B2"}}))
	assert.Equal(t, "4", h.col("readmodel_layer_features", "revision", idLayer))

	h.apply(h.event("Feature", idFeat1, 3, "Removed", 6, map[string]any{}))

	features = layerFeatures(t, h)
	require.Len(t, features, 1)
	assert.Equal(t, idFeat2, features[0].ID)

	// Removing again finds nothing and changes nothing.
	revision := h.col("readmodel_layer_features", "revision", idLayer)
	h.apply(h.event("Feature", idFeat1, 4, "Removed", 7, map[string]any{}))
	assert.Equal(t, revision, h.col("readmodel_layer_features", "revision", idLayer))

	// Restoring puts the feature back, at the end, with the state carried by the event.
	h.apply(h.event("Feature", idFeat1, 5, "Restored", 8, map[string]any{
		"incidentId": idInc1, "layerId": idLayer, "geometry": point(11, 50), "properties": map[string]any{"label": "A"},
	}))

	features = layerFeatures(t, h)
	require.Len(t, features, 2)
	assert.Equal(t, idFeat1, features[1].ID)
	assert.JSONEq(t, `{"type":"Point","coordinates":[11,50]}`, string(features[1].Geometry))

	assert.Equal(t, 8, h.count("readmodel_feature_change", ""), "every change is kept as history")
}

func TestLayerHandler_OlderChangesAreHistoryOnly(t *testing.T) {
	h := newLayerHarness(t)

	h.apply(h.event("Layer", idLayer, 1, "Created", 0, map[string]any{"incidentId": idInc1, "name": "L"}))
	h.apply(h.event("Feature", idFeat1, 1, "Placed", 1, map[string]any{
		"incidentId": idInc1, "layerId": idLayer, "geometry": point(1, 1), "properties": map[string]any{},
		"effectiveAt": "2026-03-01T12:00:00Z", "messageId": idMsg1,
	}))

	// Drawn later, but connected to an earlier message: the placed state stays.
	h.apply(h.event("Feature", idFeat1, 2, "Moved", 2, map[string]any{
		"geometry": point(2, 2), "effectiveAt": "2026-03-01T11:00:00Z", "messageId": idMsg2,
	}))

	features := layerFeatures(t, h)
	require.Len(t, features, 1)
	assert.JSONEq(t, `{"type":"Point","coordinates":[1,1]}`, string(features[0].Geometry),
		"a change effective before the current state does not overwrite it")
	assert.Equal(t, 2, h.count("readmodel_feature_change", "feature_id = ?", idFeat1))
	assert.Equal(t, 1, h.count("readmodel_feature_change", "message_id = ?", idMsg2))

	// A change effective at or after the current state wins.
	h.apply(h.event("Feature", idFeat1, 3, "Moved", 3, map[string]any{
		"geometry": point(3, 3), "effectiveAt": "2026-03-01T12:00:00Z", "messageId": idMsg2,
	}))

	features = layerFeatures(t, h)
	assert.JSONEq(
		t,
		`{"type":"Point","coordinates":[3,3]}`,
		string(features[0].Geometry),
		"ties go to the later change",
	)
}

func TestLayerHandler_ChangeWithoutPlacementIsSkipped(t *testing.T) {
	h := newLayerHarness(t)

	h.apply(h.event("Layer", idLayer, 1, "Created", 0, map[string]any{"incidentId": idInc1, "name": "L"}))
	h.apply(h.event("Feature", idFeat1, 2, "Moved", 1, map[string]any{"geometry": point(5, 5)}))
	h.apply(h.event("Feature", idFeat1, 3, "Removed", 2, map[string]any{}))

	assert.Zero(t, h.count("readmodel_feature_change", ""), "nothing to attach the change to")
	assert.Empty(t, layerFeatures(t, h))
}

func TestLayerHandler_MalformedFeatureEventFails(t *testing.T) {
	h := newLayerHarness(t)

	require.Error(t, h.proj.ApplySingle(t.Context(), h.handler.Name(),
		h.event("Feature", idFeat1, 1, "Placed", 0, map[string]any{"effectiveAt": "not a time"})))
}

func TestLayerHandler_ResetClearsLayersAndChanges(t *testing.T) {
	h := newLayerHarness(t)

	h.apply(h.event("Layer", idLayer, 1, "Created", 0, map[string]any{"incidentId": idInc1, "name": "L"}))
	h.apply(h.event("Feature", idFeat1, 1, "Placed", 1, map[string]any{
		"incidentId": idInc1, "layerId": idLayer, "geometry": point(1, 1), "properties": map[string]any{},
	}))
	require.Equal(t, 1, h.count("readmodel_feature_change", ""))

	require.NoError(t, h.proj.ResetAll(t.Context()))
	assert.Zero(t, h.count("readmodel_layer_features", ""))
	assert.Zero(t, h.count("readmodel_feature_change", ""))
}
