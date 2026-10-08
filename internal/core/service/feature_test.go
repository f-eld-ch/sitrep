package service_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

var (
	testGeometry   = map[string]any{"type": "Point", "coordinates": []any{8.5417, 47.3769}}
	testProperties = map[string]any{"icon": "fire-station", "label": "FW Zürich"}
)

// featureFixture wires an incident with one standard layer and the services needed
// to draw on the message map.
type featureFixture struct {
	incidents  inbound.IncidentService
	messages   inbound.MessageService
	features   inbound.FeatureService
	incidentID shared.IncidentID
	layerID    shared.LayerID // standard layer
	mapLayerID shared.LayerID // message map layer
	mapDivID   shared.DivisionID
}

func newFeatureFixture(t *testing.T) featureFixture {
	t.Helper()

	factory, store := testStack(t)
	incidents, messages, layers, features := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)

	res, err := incidentSvc.CreateIncident(ctx(), "Lagebild", nil, nil, []string{"Lage"}, testActor)
	require.NoError(t, err)

	return featureFixture{
		incidents:  incidentSvc,
		messages:   factory.MessageService(messages, incidents),
		features:   factory.FeatureService(features, incidents, layers, messages),
		incidentID: res.IncidentID,
		layerID:    res.LayerIDs[0],
		mapLayerID: res.MessageMapLayerID,
		mapDivID:   incident.MessageMapDivisionID(res.IncidentID),
	}
}

// message records a message at the given time and triages it to the given divisions.
func (f featureFixture) message(t *testing.T, at time.Time, divisions ...shared.DivisionID) shared.MessageID {
	t.Helper()

	ms, err := f.messages.RecordMessage(
		ctx(), f.incidentID, "content", "A", "", "B", "", shared.MediumRadio, &at, testActor)
	require.NoError(t, err)

	_, err = f.messages.TriageMessage(
		ctx(), ms.ID, shared.TriageDone, shared.PriorityNormal, divisions, nil, testActor)
	require.NoError(t, err)

	return ms.ID
}

func TestFeatureService_PlaceMoveRestyle(t *testing.T) {
	f := newFeatureFixture(t)

	state, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-1",
		testGeometry, testProperties, inbound.FeatureChange{}, testActor)
	require.NoError(t, err)
	assert.Equal(t, feature.DeriveID(f.incidentID, "draw-1"), state.ID)
	assert.Equal(t, testGeometry, state.Geometry)

	t.Run("move feature", func(t *testing.T) {
		newGeom := map[string]any{"type": "Point", "coordinates": []any{8.5418, 47.3770}}
		got, err := f.features.ModifyFeature(ctx(), state.ID, newGeom, nil, inbound.FeatureChange{}, testActor)
		require.NoError(t, err)
		assert.Equal(t, newGeom, got.Geometry)
		assert.Equal(t, testProperties, got.Properties, "unchanged field is returned from aggregate state")
	})

	t.Run("restyle feature", func(t *testing.T) {
		newProps := map[string]any{"icon": "police-car"}
		got, err := f.features.ModifyFeature(ctx(), state.ID, nil, newProps, inbound.FeatureChange{}, testActor)
		require.NoError(t, err)
		assert.Equal(t, newProps, got.Properties)
	})

	t.Run("remove feature", func(t *testing.T) {
		require.NoError(t, f.features.RemoveFeature(ctx(), state.ID, inbound.FeatureChange{}, testActor))
	})
}

func TestFeatureService_PlaceIsIdempotentPerClientKey(t *testing.T) {
	f := newFeatureFixture(t)

	first, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-1",
		testGeometry, testProperties, inbound.FeatureChange{}, testActor)
	require.NoError(t, err)

	t.Run("same key and payload returns the existing feature", func(t *testing.T) {
		again, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-1",
			testGeometry, testProperties, inbound.FeatureChange{}, testActor)
		require.NoError(t, err)
		assert.Equal(t, first.ID, again.ID)
	})

	t.Run("same key with a different payload conflicts", func(t *testing.T) {
		other := map[string]any{"type": "Point", "coordinates": []any{1.0, 2.0}}
		_, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-1",
			other, testProperties, inbound.FeatureChange{}, testActor)
		require.ErrorIs(t, err, shared.ErrConflict)
	})

	t.Run("another key yields another feature", func(t *testing.T) {
		second, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-2",
			testGeometry, testProperties, inbound.FeatureChange{}, testActor)
		require.NoError(t, err)
		assert.NotEqual(t, first.ID, second.ID)
	})

	t.Run("invalid client keys are rejected", func(t *testing.T) {
		for _, key := range []string{"", string(make([]byte, 129))} {
			_, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, key,
				testGeometry, testProperties, inbound.FeatureChange{}, testActor)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
		}
	})
}

func TestFeatureService_RemoveUnknown(t *testing.T) {
	f := newFeatureFixture(t)

	err := f.features.RemoveFeature(ctx(), shared.FeatureID(newID()), inbound.FeatureChange{}, testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

func TestFeatureService_ModifyUnknown(t *testing.T) {
	f := newFeatureFixture(t)

	_, err := f.features.ModifyFeature(
		ctx(), shared.FeatureID(newID()), testGeometry, nil, inbound.FeatureChange{}, testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

func TestFeatureService_RejectsWritesOnClosedIncident(t *testing.T) {
	f := newFeatureFixture(t)

	state, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "draw-1",
		testGeometry, testProperties, inbound.FeatureChange{}, testActor)
	require.NoError(t, err)

	_, err = f.incidents.CloseIncident(ctx(), f.incidentID, testActor)
	require.NoError(t, err)

	_, err = f.features.ModifyFeature(ctx(), state.ID, testGeometry, nil, inbound.FeatureChange{}, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	err = f.features.RemoveFeature(ctx(), state.ID, inbound.FeatureChange{}, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

func TestFeatureService_MessageMapLayerRequiresMessageContext(t *testing.T) {
	f := newFeatureFixture(t)
	msgTime := testAt.Add(-time.Hour)
	mapMsg := f.message(t, msgTime, f.mapDivID)
	otherMsg := f.message(t, msgTime) // triaged to no division

	place := func(layerID shared.LayerID, key string, change inbound.FeatureChange) (inbound.FeatureState, error) {
		return f.features.PlaceFeature(ctx(), f.incidentID, layerID, key,
			testGeometry, testProperties, change, testActor)
	}

	t.Run("map layer without a message is rejected", func(t *testing.T) {
		_, err := place(f.mapLayerID, "a", inbound.FeatureChange{})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("standard layer rejects a message", func(t *testing.T) {
		_, err := place(f.layerID, "b", inbound.FeatureChange{MessageID: &mapMsg})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("message must be triaged to the Nachrichtenkarte", func(t *testing.T) {
		_, err := place(f.mapLayerID, "c", inbound.FeatureChange{MessageID: &otherMsg})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("unknown message", func(t *testing.T) {
		unknown := shared.MessageID(newID())
		_, err := place(f.mapLayerID, "d", inbound.FeatureChange{MessageID: &unknown})
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("message time and link are applied", func(t *testing.T) {
		state, err := place(f.mapLayerID, "e", inbound.FeatureChange{MessageID: &mapMsg})
		require.NoError(t, err)
		assert.Equal(t, []shared.MessageID{mapMsg}, state.MessageIDs)
	})

	t.Run("effectiveAt cannot be combined with a message", func(t *testing.T) {
		at := testAt.Add(-time.Minute)
		_, err := place(f.mapLayerID, "f", inbound.FeatureChange{MessageID: &mapMsg, EffectiveAt: &at})
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

func TestFeatureService_MessageOfAnotherIncidentIsRejected(t *testing.T) {
	f := newFeatureFixture(t)
	other := newFeatureFixture(t)
	foreignMsg := other.message(t, testAt.Add(-time.Hour), other.mapDivID)

	_, err := f.features.PlaceFeature(ctx(), f.incidentID, f.mapLayerID, "x",
		testGeometry, testProperties, inbound.FeatureChange{MessageID: &foreignMsg}, testActor)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestFeatureService_OutOfOrderMessagesFollowMessageTime(t *testing.T) {
	f := newFeatureFixture(t)
	early := f.message(t, testAt.Add(-3*time.Hour), f.mapDivID)
	late := f.message(t, testAt.Add(-time.Hour), f.mapDivID)
	earlyGeom := map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}}
	lateGeom := map[string]any{"type": "Point", "coordinates": []any{9.0, 47.0}}

	// The late message is drawn first; its placement defines the feature's timeline start.
	state, err := f.features.PlaceFeature(ctx(), f.incidentID, f.mapLayerID, "k",
		lateGeom, testProperties, inbound.FeatureChange{MessageID: &late}, testActor)
	require.NoError(t, err)

	t.Run("an older message cannot change a feature before it was placed", func(t *testing.T) {
		_, err := f.features.ModifyFeature(ctx(), state.ID, earlyGeom, nil,
			inbound.FeatureChange{MessageID: &early}, testActor)
		require.ErrorIs(t, err, shared.ErrBeforeFeaturePlaced)
	})

	t.Run("a later message changes it and both messages are linked", func(t *testing.T) {
		latest := f.message(t, testAt.Add(-time.Minute), f.mapDivID)
		got, err := f.features.ModifyFeature(ctx(), state.ID, earlyGeom, nil,
			inbound.FeatureChange{MessageID: &latest}, testActor)
		require.NoError(t, err)
		assert.Equal(t, earlyGeom, got.Geometry)
		assert.Equal(t, []shared.MessageID{late, latest}, got.MessageIDs)
	})
}

func TestFeatureService_EffectiveAtOnStandardLayer(t *testing.T) {
	f := newFeatureFixture(t)
	past := testAt.Add(-time.Hour)
	future := testAt.Add(time.Hour)

	t.Run("a past effective time is accepted", func(t *testing.T) {
		_, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "p",
			testGeometry, testProperties, inbound.FeatureChange{EffectiveAt: &past}, testActor)
		require.NoError(t, err)
	})

	t.Run("a future effective time is rejected", func(t *testing.T) {
		_, err := f.features.PlaceFeature(ctx(), f.incidentID, f.layerID, "q",
			testGeometry, testProperties, inbound.FeatureChange{EffectiveAt: &future}, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}
