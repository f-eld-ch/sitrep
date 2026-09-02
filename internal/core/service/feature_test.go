package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

var (
	testGeometry   = map[string]any{"type": "Point", "coordinates": []any{8.5417, 47.3769}}
	testProperties = map[string]any{"icon": "fire-station", "label": "FW Zürich"}
)

func TestFeatureService_PlaceMoveRestyle(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, features := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	layerSvc := factory.LayerService(layers, incidents)
	featureSvc := factory.FeatureService(features, incidents, layers)

	res, err := incidentSvc.CreateIncident(ctx(), "Lagebild", nil, nil, []string{"Lage"}, testActor)
	require.NoError(t, err)

	layerID := res.LayerIDs[0]
	_ = layerSvc // used via incidentSvc; avoid unused-variable error

	featureID := shared.FeatureID(newID())

	t.Run("place feature", func(t *testing.T) {
		err := featureSvc.PlaceFeature(ctx(), featureID, res.IncidentID, layerID,
			testGeometry, testProperties, testActor)
		require.NoError(t, err)
	})

	t.Run("move feature", func(t *testing.T) {
		newGeom := map[string]any{"type": "Point", "coordinates": []any{8.5418, 47.3770}}
		_, err := featureSvc.ModifyFeature(ctx(), featureID, newGeom, nil, testActor)
		require.NoError(t, err)
	})

	t.Run("restyle feature", func(t *testing.T) {
		newProps := map[string]any{"icon": "police-car"}
		_, err := featureSvc.ModifyFeature(ctx(), featureID, nil, newProps, testActor)
		require.NoError(t, err)
	})

	t.Run("remove feature", func(t *testing.T) {
		err := featureSvc.RemoveFeature(ctx(), featureID, testActor)
		require.NoError(t, err)
	})
}

func TestFeatureService_RemoveUnknown(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, features := repos(store)
	featureSvc := factory.FeatureService(features, incidents, layers)

	err := featureSvc.RemoveFeature(ctx(), shared.FeatureID(newID()), testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

func TestFeatureService_ModifyUnknown(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, features := repos(store)
	featureSvc := factory.FeatureService(features, incidents, layers)

	_, err := featureSvc.ModifyFeature(ctx(), shared.FeatureID(newID()), testGeometry, nil, testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

func TestFeatureService_RejectsWritesOnClosedIncident(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, features := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	featureSvc := factory.FeatureService(features, incidents, layers)

	res, err := incidentSvc.CreateIncident(ctx(), "Closed", nil, nil, []string{"Lage"}, testActor)
	require.NoError(t, err)

	featureID := shared.FeatureID(newID())
	err = featureSvc.PlaceFeature(
		ctx(),
		featureID,
		res.IncidentID,
		res.LayerIDs[0],
		testGeometry,
		testProperties,
		testActor,
	)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)

	_, err = featureSvc.ModifyFeature(ctx(), featureID, testGeometry, nil, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	err = featureSvc.RemoveFeature(ctx(), featureID, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}
