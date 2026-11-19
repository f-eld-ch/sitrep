package projection_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func point(x float64) obj {
	return obj{"type": "Point", "coordinates": []float64{x, x}}
}

func featureEvt(id uuid.UUID, version int, eventType string, data obj, recorded time.Time) eventsourcing.Event {
	e := evt("Feature", id, eventType, data, recorded)
	e.Version = version
	e.Metadata = obj{"actor": "sub-draw"}

	return e
}

func layerCreated(layer, inc uuid.UUID) eventsourcing.Event {
	return evt("Layer", layer, "Created", obj{"incidentId": inc.String(), "name": "Map", "kind": "USER"}, tm(0))
}

func placed(feature, layer, inc uuid.UUID, geometry obj, effective time.Time) eventsourcing.Event {
	return featureEvt(feature, 1, "Placed", obj{
		"incidentId": inc.String(), "layerId": layer.String(),
		"geometry": geometry, "properties": obj{"name": "p"}, "effectiveAt": effective,
	}, tm(0))
}

func layerFeatures(t *testing.T, h *projection.LayerFeaturesHandler, inc uuid.UUID) *projection.LayerRow {
	t.Helper()

	rows := h.ForIncident(inc)
	require.Len(t, rows, 1)

	return rows[0]
}

func TestLayerFeaturesHandler_Metadata(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()

	assert.Equal(t, "readmodel.layer_features", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{"Created", "KindAssigned", "Renamed", "Removed", "Imported"} {
		assert.True(t, h.Handles("Layer", typ), "Layer/%s", typ)
	}

	for _, typ := range []string{"Placed", "Moved", "Restyled", "Imported", "Removed", "Restored"} {
		assert.True(t, h.Handles("Feature", typ), "Feature/%s", typ)
	}

	assert.False(t, h.Handles("Layer", "Placed"))
	assert.False(t, h.Handles("Feature", "Created"))
	assert.False(t, h.Handles("Message", "Created"))
}

func TestLayerFeaturesHandler_LayerEvents(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, imported := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		layerCreated(layer, inc),
		evt("Layer", layer, "KindAssigned", obj{"kind": "MESSAGES"}, tm(1)),
		evt("Layer", layer, "Renamed", obj{"name": "Renamed"}, tm(2)),
		evt("Layer", imported, "Imported", obj{"incidentId": inc.String(), "name": "Old", "kind": "USER"}, tm(3)),
	)

	rows := h.ForIncident(inc)
	require.Len(t, rows, 2)

	byID := map[uuid.UUID]*projection.LayerRow{}
	for _, r := range rows {
		byID[r.ID] = r
	}

	assert.Equal(t, "Renamed", byID[layer].Name)
	assert.Equal(t, "MESSAGES", byID[layer].Kind)
	assert.Equal(t, inc, byID[layer].IncidentID)
	assert.Equal(t, "Old", byID[imported].Name)

	applyAll(t, h, evt("Layer", layer, "Removed", obj{}, tm(4)))

	rows = h.ForIncident(inc)
	require.Len(t, rows, 1, "removed layers are not listed")
	assert.Equal(t, imported, rows[0].ID)
	assert.Empty(t, h.ForIncident(uuid.New()))

	t.Run("events for an unknown layer are ignored", func(t *testing.T) {
		unknown := uuid.New()
		applyAll(t, h,
			evt("Layer", unknown, "KindAssigned", obj{"kind": "x"}, tm(5)),
			evt("Layer", unknown, "Renamed", obj{"name": "x"}, tm(5)),
			evt("Layer", unknown, "Removed", obj{}, tm(5)),
			evt("Layer", unknown, "Unknown", obj{}, tm(5)),
			evt("Other", unknown, "Created", obj{}, tm(5)),
		)
		assert.Len(t, h.ForIncident(inc), 1)
	})
}

func TestLayerFeaturesHandler_LayerMalformedPayloads(t *testing.T) {
	layer := uuid.New()

	tests := []struct {
		name  string
		event eventsourcing.Event
	}{
		{"created undecodable", evt("Layer", layer, "Created", "x", tm(0))},
		{"created bad incident id", evt("Layer", layer, "Created", obj{"incidentId": "nope"}, tm(0))},
		{"kind undecodable", evt("Layer", layer, "KindAssigned", "x", tm(0))},
		{"renamed undecodable", evt("Layer", layer, "Renamed", "x", tm(0))},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewLayerFeaturesHandler()
			require.Error(t, h.Apply(t.Context(), tc.event))
		})
	}
}

func TestLayerFeaturesHandler_ReplayedVersionIsIgnored(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	place := placed(feature, layer, inc, point(1), tm(1))
	applyAll(t, h, layerCreated(layer, inc), place)

	revision := layerFeatures(t, h, inc).Revision
	require.Positive(t, revision)

	applyAll(t, h, place, place)

	row := layerFeatures(t, h, inc)
	assert.Equal(t, revision, row.Revision, "a replayed event must not bump the revision again")
	assert.Len(t, row.Features, 1)
	assert.Len(t, h.ChangesForIncidents(inc), 1, "nor record the change twice")
}

func TestLayerFeaturesHandler_ImportedAsDeletedIsNotListed(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	inc, kept, dropped := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		evt("Layer", kept, "Imported", obj{"incidentId": inc.String(), "name": "Kept", "kind": "USER"}, tm(1)),
		evt("Layer", dropped, "Imported", obj{
			"incidentId": inc.String(), "name": "Dropped", "kind": "USER", "deletedAt": tm(2),
		}, tm(1)),
	)

	rows := h.ForIncident(inc)
	require.Len(t, rows, 1)
	assert.Equal(t, kept, rows[0].ID)
}
