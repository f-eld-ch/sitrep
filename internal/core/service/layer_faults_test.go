package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// layerRig is a layer service on an incident with one layer, with repositories that can fail.
type layerRig struct {
	incidentRig

	svc        *service.LayerService
	incidentID shared.IncidentID
	layerID    shared.LayerID
	// mapLayerID is the system-managed message map layer.
	mapLayerID shared.LayerID
}

func newLayerRig(t *testing.T) layerRig {
	t.Helper()

	r := newIncidentRig(t)
	rig := layerRig{incidentRig: r, svc: r.factory.LayerService(r.layers, r.incidents)}

	res, err := r.svc.CreateIncident(ctx(), "Lagebild", nil, nil, nil, testActor)
	require.NoError(t, err)

	rig.incidentID = res.IncidentID
	rig.layerID = res.LayerIDs[0]
	rig.mapLayerID = res.MessageMapLayerID

	return rig
}

type layerOp struct {
	name string
	// run is given the layer to work on and the incident to create one on.
	run func(r layerRig, layerID shared.LayerID, incidentID shared.IncidentID) error
}

func layerOps() []layerOp {
	return []layerOp{
		{"CreateLayer", func(r layerRig, _ shared.LayerID, incidentID shared.IncidentID) error {
			_, err := r.svc.CreateLayer(ctx(), incidentID, "Kräfte", testActor)

			return err
		}},
		{"RenameLayer", func(r layerRig, id shared.LayerID, _ shared.IncidentID) error {
			return r.svc.RenameLayer(ctx(), id, "Umbenannt", testActor)
		}},
		{"RemoveLayer", func(r layerRig, id shared.LayerID, _ shared.IncidentID) error {
			return r.svc.RemoveLayer(ctx(), id, testActor)
		}},
	}
}

func TestLayerService_CommandsReportFailures(t *testing.T) {
	for _, op := range layerOps() {
		create := op.name == "CreateLayer"

		// Creating works on an incident, the others on a layer: what is not there is not found.
		missing := func(r layerRig) (shared.LayerID, shared.IncidentID) {
			if create {
				return r.layerID, shared.IncidentID(newID())
			}

			return shared.LayerID(newID()), r.incidentID
		}

		t.Run(op.name+" without permission", func(t *testing.T) {
			r := newLayerRig(t)
			r.access.denied = true

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r := newLayerRig(t)
			r.access.err = errBoom

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), errBoom)
		})

		t.Run(op.name+" on something that does not exist", func(t *testing.T) {
			r := newLayerRig(t)
			layerID, incidentID := missing(r)

			require.ErrorIs(t, op.run(r, layerID, incidentID), shared.ErrNotFound)
		})

		t.Run(op.name+" when the layer cannot be loaded", func(t *testing.T) {
			if create {
				t.Skip("creating a layer loads none")
			}

			r := newLayerRig(t)
			r.layers.load = errBoom

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), errBoom)
		})

		t.Run(op.name+" when the layer cannot be saved", func(t *testing.T) {
			r := newLayerRig(t)
			r.layers.save = errBoom

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), errBoom)
		})

		t.Run(op.name+" on a closed incident", func(t *testing.T) {
			r := newLayerRig(t)
			_, err := r.incidentRig.svc.CloseIncident(ctx(), r.incidentID, testActor)
			require.NoError(t, err)

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), shared.ErrIncidentNotOpen)
		})

		t.Run(op.name+" when the incident cannot be loaded", func(t *testing.T) {
			r := newLayerRig(t)
			r.incidents.load = errBoom

			require.ErrorIs(t, op.run(r, r.layerID, r.incidentID), errBoom)
		})
	}
}

func TestLayerService_RejectsInvalidChanges(t *testing.T) {
	t.Run("a layer without a name", func(t *testing.T) {
		r := newLayerRig(t)

		_, err := r.svc.CreateLayer(ctx(), r.incidentID, "", testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)

		require.ErrorIs(t, r.svc.RenameLayer(ctx(), r.layerID, "", testActor), shared.ErrInvalidInput)
	})

	t.Run("the message map layer cannot be renamed or removed", func(t *testing.T) {
		r := newLayerRig(t)

		require.ErrorIs(t, r.svc.RenameLayer(ctx(), r.mapLayerID, "Anders", testActor), shared.ErrInvalidInput)
		require.ErrorIs(t, r.svc.RemoveLayer(ctx(), r.mapLayerID, testActor), shared.ErrInvalidInput)
	})

	t.Run("a removed layer is gone", func(t *testing.T) {
		r := newLayerRig(t)
		require.NoError(t, r.svc.RemoveLayer(ctx(), r.layerID, testActor))

		require.ErrorIs(t, r.svc.RenameLayer(ctx(), r.layerID, "Anders", testActor), shared.ErrNotFound)
		require.ErrorIs(t, r.svc.RemoveLayer(ctx(), r.layerID, testActor), shared.ErrNotFound)

		l, err := r.layers.LayerRepository.Load(ctx(), r.layerID)
		require.NoError(t, err)
		assert.True(t, l.IsRemoved())
	})
}
