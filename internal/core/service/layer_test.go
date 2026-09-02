package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestLayerService_CreateAndRename(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	layerSvc := factory.LayerService(layers, incidents)

	res, err := incidentSvc.CreateIncident(ctx(), "Lagebild", nil, nil, nil, testActor)
	require.NoError(t, err)

	layerID, err := layerSvc.CreateLayer(ctx(), res.IncidentID, "Kräfte", testActor)
	require.NoError(t, err)
	assert.NotEqual(t, shared.LayerID{}, layerID)

	require.NoError(t, layerSvc.RenameLayer(ctx(), layerID, "Kräfte (aktualisiert)", testActor))
}

func TestLayerService_Remove(t *testing.T) {
	t.Run("remove existing layer", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		layerSvc := factory.LayerService(layers, incidents)

		res, _ := incidentSvc.CreateIncident(ctx(), "Lagebild", nil, nil, nil, testActor)
		layerID, err := layerSvc.CreateLayer(ctx(), res.IncidentID, "Temporär", testActor)
		require.NoError(t, err)

		require.NoError(t, layerSvc.RemoveLayer(ctx(), layerID, testActor))
	})

	t.Run("remove unknown layer returns not-found", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		layerSvc := factory.LayerService(layers, incidents)

		err := layerSvc.RemoveLayer(ctx(), shared.LayerID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestLayerService_RejectsWritesOnClosedIncident(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	layerSvc := factory.LayerService(layers, incidents)

	res, err := incidentSvc.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
	require.NoError(t, err)
	layerID, err := layerSvc.CreateLayer(ctx(), res.IncidentID, "Kräfte", testActor)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)

	err = layerSvc.RenameLayer(ctx(), layerID, "Umbenannt", testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	err = layerSvc.RemoveLayer(ctx(), layerID, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}
