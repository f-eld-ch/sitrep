package projection_test

import (
	"encoding/json/v2"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/featurechange"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func movedEvt(feature uuid.UUID, version int, x float64, effectiveMinute int) eventsourcing.Event {
	return featureEvt(
		feature,
		version,
		"Moved",
		obj{"geometry": point(x), "effectiveAt": tm(effectiveMinute)},
		tm(version),
	)
}

func restyledEvt(feature uuid.UUID, version int, name string, effectiveMinute int) eventsourcing.Event {
	return featureEvt(feature, version, "Restyled",
		obj{"properties": obj{"name": name}, "effectiveAt": tm(effectiveMinute)}, tm(version))
}

func TestLayerFeaturesHandler_FeatureStateFollowsEffectiveTime(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, layerCreated(layer, inc), placed(feature, layer, inc, point(1), tm(10)))

	state := func() (geometry, properties string) {
		item := layerFeatures(t, h, inc).Features[feature]

		return string(item.Geometry), string(item.Properties)
	}

	tests := []struct {
		name       string
		event      eventsourcing.Event
		wantGeom   float64
		wantName   string
		wantChange bool // whether the layer state (and so its revision) is updated
	}{
		{"a later move wins", movedEvt(feature, 2, 2, 20), 2, "p", true},
		{
			"a move that took effect earlier than the current one is only recorded",
			movedEvt(feature, 3, 3, 15),
			2,
			"p",
			false,
		},
		{"a move at the same time as the current one wins the tie", movedEvt(feature, 4, 4, 20), 4, "p", true},
		{"a restyle before the placement is only recorded", restyledEvt(feature, 5, "early", 5), 4, "p", false},
		{"a later restyle wins", restyledEvt(feature, 6, "late", 30), 4, "late", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			before := layerFeatures(t, h, inc).Revision

			applyAll(t, h, tc.event)

			geometry, properties := state()
			wantGeometry, err := json.Marshal(point(tc.wantGeom))
			require.NoError(t, err)
			assert.JSONEq(t, string(wantGeometry), geometry)
			assert.JSONEq(t, `{"name":"`+tc.wantName+`"}`, properties)

			after := layerFeatures(t, h, inc).Revision
			if tc.wantChange {
				assert.Equal(t, before+1, after)
			} else {
				assert.Equal(t, before, after)
			}
		})
	}

	changes := h.ChangesForIncidents(inc)
	assert.Len(t, changes, 1+len(tests), "every change is recorded, applied or not")
}

func TestLayerFeaturesHandler_RemoveAndRestore(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, layerCreated(layer, inc), placed(feature, layer, inc, point(1), tm(1)))

	got, ok := h.FindFeatureIncidentID(feature)
	require.True(t, ok)
	assert.Equal(t, inc, got)

	applyAll(t, h, featureEvt(feature, 2, "Removed", obj{"effectiveAt": tm(2)}, tm(2)))

	assert.Empty(t, layerFeatures(t, h, inc).Features)

	_, ok = h.FindFeatureIncidentID(feature)
	assert.False(t, ok, "a removed feature is no longer in any layer")

	got, ok = h.IncidentIDForFeature(feature)
	require.True(t, ok, "the change history still knows where it was placed")
	assert.Equal(t, inc, got)

	applyAll(t, h, featureEvt(feature, 3, "Restored", obj{
		"layerId": layer.String(), "geometry": point(9), "properties": obj{"name": "back"}, "effectiveAt": tm(3),
	}, tm(3)))

	item, found := layerFeatures(t, h, inc).Features[feature]
	require.True(t, found)
	assert.JSONEq(t, `{"type":"Point","coordinates":[9,9]}`, string(item.Geometry))
	assert.JSONEq(t, `{"name":"back"}`, string(item.Properties))

	_, ok = h.FindFeatureIncidentID(uuid.New())
	assert.False(t, ok)

	_, ok = h.IncidentIDForFeature(uuid.New())
	assert.False(t, ok)
}

func TestLayerFeaturesHandler_ImportedFeatureIsPlaced(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, layerCreated(layer, inc), featureEvt(feature, 1, "Imported", obj{
		"incidentId": inc.String(), "layerId": layer.String(), "geometry": point(5), "properties": obj{"name": "i"},
	}, tm(1)))

	assert.Contains(t, layerFeatures(t, h, inc).Features, feature)

	changes := h.ChangesForIncidents(inc)
	require.Len(t, changes, 1)
	assert.Equal(t, string(featurechange.Placed), changes[0].Kind, "an import counts as a placement")
	assert.Equal(t, tm(1), changes[0].EffectiveAt, "without an effective time the event time is used")
}

func TestLayerFeaturesHandler_ChangesAreOrderedAndFiltered(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, gone, inc, otherInc := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	f1, f2, f3 := uuid.New(), uuid.New(), uuid.New()
	m1, m2 := uuid.New(), uuid.New()

	withMessage := func(e eventsourcing.Event, msg uuid.UUID) eventsourcing.Event {
		e.Data.(obj)["messageId"] = msg.String()

		return e
	}

	applyAll(t, h,
		layerCreated(layer, inc),
		layerCreated(gone, inc),
		withMessage(placed(f1, layer, inc, point(1), tm(30)), m1),
		placed(f2, layer, inc, point(2), tm(10)),
		placed(f3, gone, inc, point(3), tm(5)),
		withMessage(movedEvt(f1, 2, 4, 40), m2),
		withMessage(restyledEvt(f1, 3, "x", 35), m1),
	)
	applyAll(t, h, evt("Layer", gone, "Removed", obj{}, tm(50)))

	changes := h.ChangesForIncidents(inc)
	require.Len(t, changes, 4, "changes of the removed layer are left out")

	order := make([]uuid.UUID, len(changes))
	for i, c := range changes {
		order[i] = c.FeatureID
	}

	assert.Equal(t, []uuid.UUID{f2, f1, f1, f1}, order, "ordered by effective time")
	assert.Equal(t, []string{"placed", "placed", "restyled", "moved"}, kinds(changes))
	assert.Equal(t, "sub-draw", changes[0].Actor)
	assert.Equal(t, layer, changes[0].LayerID)
	assert.Equal(t, inc, changes[0].IncidentID)
	assert.Nil(t, changes[0].MessageID)
	require.NotNil(t, changes[1].MessageID)
	assert.Equal(t, m1, *changes[1].MessageID)

	assert.Empty(t, h.ChangesForIncidents(otherInc))
	assert.Len(t, h.ChangesForIncidents(otherInc, inc), 4, "several incidents may be asked for at once")

	assert.Equal(t, []uuid.UUID{m1, m2}, h.MessageIDsForFeature(f1), "distinct messages in effective order")
	assert.Empty(t, h.MessageIDsForFeature(f2))
}

func kinds(changes []*projection.FeatureChangeRow) []string {
	out := make([]string, len(changes))
	for i, c := range changes {
		out[i] = c.Kind
	}

	return out
}

func TestLayerFeaturesHandler_FeatureEventsWithoutPlacementAreIgnored(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		layerCreated(layer, inc),
		movedEvt(feature, 2, 2, 5),
		restyledEvt(feature, 3, "x", 5),
		featureEvt(feature, 4, "Removed", obj{}, tm(4)),
		featureEvt(feature, 5, "Unknown", obj{}, tm(5)),
		evt("Other", feature, "Placed", obj{}, tm(6)),
	)

	assert.Empty(t, h.ChangesForIncidents(inc))
	assert.Empty(t, layerFeatures(t, h, inc).Features)
}

func TestLayerFeaturesHandler_MovedAndRestyledOnMissingFeatureAreNoOps(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		layerCreated(layer, inc),
		placed(feature, layer, inc, point(1), tm(1)),
		featureEvt(feature, 2, "Removed", obj{"effectiveAt": tm(2)}, tm(2)),
	)

	revision := layerFeatures(t, h, inc).Revision

	applyAll(t, h,
		movedEvt(feature, 3, 2, 3),
		restyledEvt(feature, 4, "x", 4),
		featureEvt(feature, 5, "Removed", obj{"effectiveAt": tm(5)}, tm(5)),
	)

	row := layerFeatures(t, h, inc)
	assert.Empty(t, row.Features)
	assert.Equal(t, revision, row.Revision)
}

func TestLayerFeaturesHandler_FeatureMalformedPayloads(t *testing.T) {
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	tests := []struct {
		name  string
		setup []eventsourcing.Event
		event eventsourcing.Event
	}{
		{"undecodable", nil, featureEvt(feature, 1, "Placed", nil, tm(0))},
		{
			"bad incident id",
			nil,
			featureEvt(feature, 1, "Placed", obj{"incidentId": "nope", "layerId": layer.String()}, tm(0)),
		},
		{
			"bad layer id",
			nil,
			featureEvt(feature, 1, "Placed", obj{"incidentId": inc.String(), "layerId": "nope"}, tm(0)),
		},
		{"bad message id", nil, featureEvt(feature, 1, "Placed", obj{
			"incidentId": inc.String(), "layerId": layer.String(), "messageId": "nope",
		}, tm(0))},
		{"unknown layer", nil, placed(feature, uuid.New(), inc, point(1), tm(0))},
		{"restored into a bad layer id", []eventsourcing.Event{
			layerCreated(layer, inc), placed(feature, layer, inc, point(1), tm(0)),
		}, featureEvt(feature, 2, "Restored", obj{"layerId": "nope"}, tm(2))},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewLayerFeaturesHandler()
			if tc.setup == nil {
				applyAll(t, h, layerCreated(layer, inc))
			}

			applyAll(t, h, tc.setup...)
			require.Error(t, h.Apply(t.Context(), tc.event))
		})
	}
}

func TestLayerFeaturesHandler_GeoJSONAndSnapshots(t *testing.T) {
	h := projection.NewLayerFeaturesHandler()
	layer, inc, feature := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, layerCreated(layer, inc), placed(feature, layer, inc, point(7), tm(1)))

	row := layerFeatures(t, h, inc)
	assert.JSONEq(t, `{"type":"FeatureCollection","features":[{"type":"Feature","id":"`+feature.String()+
		`","geometry":{"type":"Point","coordinates":[7,7]},"properties":{"name":"p"}}]}`, string(row.GeoJSON()))

	delete(row.Features, feature)
	assert.Len(t, layerFeatures(t, h, inc).Features, 1, "ForIncident hands out copies of the feature map")

	require.NoError(t, h.Reset(t.Context()))
	assert.Empty(t, h.ForIncident(inc))
	assert.Empty(t, h.ChangesForIncidents(inc))
}
