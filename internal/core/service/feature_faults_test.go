package service_test

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// featureRig is a feature service on an incident with a standard layer, the message map layer
// and a message triaged to the map, with repositories that can be made to fail.
type featureRig struct {
	incidentRig

	features   *faultyFeatures
	messages   *service.MessageService
	svc        *service.FeatureService
	incidentID shared.IncidentID
	layerID    shared.LayerID
	mapLayerID shared.LayerID
	mapMessage shared.MessageID
	// placed is a feature on the standard layer, removed one that was taken off it again.
	placed, removed shared.FeatureID
}

func newFeatureRig(t *testing.T) featureRig {
	t.Helper()

	r := newIncidentRig(t)
	_, messages, _, features := repos(r.store)

	rig := featureRig{
		incidentRig: r,
		features:    &faultyFeatures{FeatureRepository: features},
		messages:    r.factory.MessageService(messages, r.incidents),
	}
	rig.svc = r.factory.FeatureService(rig.features, r.incidents, r.layers, messages)

	res, err := r.svc.CreateIncident(ctx(), "Lagebild", nil, nil, []string{"Lage"}, testActor)
	require.NoError(t, err)

	rig.incidentID = res.IncidentID
	rig.layerID = res.LayerIDs[0]
	rig.mapLayerID = res.MessageMapLayerID

	msg, err := rig.messages.RecordMessage(ctx(), rig.incidentID,
		"Brand", "A", "", "B", "", shared.MediumRadio, new(testAt.Add(-time.Hour)), testActor)
	require.NoError(t, err)

	_, err = rig.messages.TriageMessage(ctx(), msg.ID, shared.TriageDone, shared.PriorityNormal,
		[]shared.DivisionID{incident.MessageMapDivisionID(rig.incidentID)}, nil, testActor)
	require.NoError(t, err)

	rig.mapMessage = msg.ID

	state, err := rig.svc.PlaceFeature(ctx(), rig.incidentID, rig.layerID, "placed",
		testGeometry, testProperties, inbound.FeatureChange{}, testActor)
	require.NoError(t, err)

	rig.placed = state.ID

	state, err = rig.svc.PlaceFeature(ctx(), rig.incidentID, rig.layerID, "removed",
		testGeometry, testProperties, inbound.FeatureChange{}, testActor)
	require.NoError(t, err)
	require.NoError(t, rig.svc.RemoveFeature(ctx(), state.ID, inbound.FeatureChange{}, testActor))

	rig.removed = state.ID
	rig.features.saves = 0

	return rig
}

type featureOp struct {
	name string
	// target says which feature the command is given, if it acts on one.
	target func(r featureRig) shared.FeatureID
	run    func(r featureRig, id shared.FeatureID) error
}

func featureOps() []featureOp {
	return []featureOp{
		{"PlaceFeature", nil, func(r featureRig, _ shared.FeatureID) error {
			_, err := r.svc.PlaceFeature(ctx(), r.incidentID, r.layerID, "new",
				testGeometry, testProperties, inbound.FeatureChange{}, testActor)

			return err
		}},
		{
			"ModifyFeature",
			func(r featureRig) shared.FeatureID { return r.placed },
			func(r featureRig, id shared.FeatureID) error {
				_, err := r.svc.ModifyFeature(
					ctx(),
					id,
					testGeometry,
					testProperties,
					inbound.FeatureChange{},
					testActor,
				)

				return err
			},
		},
		{
			"RemoveFeature",
			func(r featureRig) shared.FeatureID { return r.placed },
			func(r featureRig, id shared.FeatureID) error {
				return r.svc.RemoveFeature(ctx(), id, inbound.FeatureChange{}, testActor)
			},
		},
		{
			"RestoreFeature",
			func(r featureRig) shared.FeatureID { return r.removed },
			func(r featureRig, id shared.FeatureID) error {
				_, err := r.svc.RestoreFeature(ctx(), id, inbound.FeatureChange{}, testActor)

				return err
			},
		},
	}
}

func TestFeatureService_CommandsReportFailures(t *testing.T) {
	for _, op := range featureOps() {
		target := func(r featureRig) shared.FeatureID {
			if op.target == nil {
				return shared.FeatureID{}
			}

			return op.target(r)
		}

		t.Run(op.name+" without permission", func(t *testing.T) {
			r := newFeatureRig(t)
			r.access.denied = true

			require.ErrorIs(t, op.run(r, target(r)), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r := newFeatureRig(t)
			r.access.err = errBoom

			require.ErrorIs(t, op.run(r, target(r)), errBoom)
		})

		t.Run(op.name+" when the feature cannot be loaded", func(t *testing.T) {
			r := newFeatureRig(t)
			r.features.load = errBoom

			require.ErrorIs(t, op.run(r, target(r)), errBoom)
		})

		t.Run(op.name+" when the feature cannot be saved", func(t *testing.T) {
			r := newFeatureRig(t)
			r.features.save = errBoom

			require.ErrorIs(t, op.run(r, target(r)), errBoom)
		})

		t.Run(op.name+" when the incident cannot be loaded", func(t *testing.T) {
			r := newFeatureRig(t)
			r.incidents.load = errBoom

			require.ErrorIs(t, op.run(r, target(r)), errBoom)
		})

		t.Run(op.name+" when the layer cannot be loaded", func(t *testing.T) {
			r := newFeatureRig(t)
			r.layers.load = errBoom

			require.ErrorIs(t, op.run(r, target(r)), errBoom)
		})

		t.Run(op.name+" on a closed incident", func(t *testing.T) {
			r := newFeatureRig(t)
			_, err := r.incidentRig.svc.CloseIncident(ctx(), r.incidentID, testActor)
			require.NoError(t, err)

			require.ErrorIs(t, op.run(r, target(r)), shared.ErrIncidentNotOpen)
		})

		t.Run(op.name+" goes through once the other writer is done", func(t *testing.T) {
			r := newFeatureRig(t)
			r.features.conflicts = 2

			require.NoError(t, op.run(r, target(r)))
			assert.Equal(t, 3, r.features.saves)
		})

		t.Run(op.name+" gives up after three attempts", func(t *testing.T) {
			r := newFeatureRig(t)
			r.features.conflicts = 10

			require.ErrorIs(t, op.run(r, target(r)), shared.ErrConflict)
			assert.Equal(t, 3, r.features.saves)
		})
	}
}

func TestFeatureService_PlaceFeature_Failures(t *testing.T) {
	r := newFeatureRig(t)

	place := func(r featureRig, incidentID shared.IncidentID, layerID shared.LayerID, key string,
		geometry map[string]any, change inbound.FeatureChange,
	) error {
		_, err := r.svc.PlaceFeature(ctx(), incidentID, layerID, key, geometry, testProperties, change, testActor)

		return err
	}

	t.Run("an incident that does not exist", func(t *testing.T) {
		require.ErrorIs(t,
			place(r, shared.IncidentID(newID()), r.layerID, "k1", testGeometry, inbound.FeatureChange{}),
			shared.ErrNotFound)
	})

	t.Run("a layer that does not exist", func(t *testing.T) {
		require.ErrorIs(t,
			place(r, r.incidentID, shared.LayerID(newID()), "k2", testGeometry, inbound.FeatureChange{}),
			shared.ErrNotFound)
	})

	t.Run("a layer of another incident", func(t *testing.T) {
		second, err := r.incidentRig.svc.CreateIncident(ctx(), "Zweiter", nil, nil, []string{"Lage"}, testActor)
		require.NoError(t, err)

		otherLayer := second.LayerIDs[0]

		require.ErrorIs(t,
			place(r, r.incidentID, otherLayer, "k3", testGeometry, inbound.FeatureChange{}),
			shared.ErrInvalidInput)
	})

	t.Run("a change in the future", func(t *testing.T) {
		future := testAt.Add(time.Hour)

		require.ErrorIs(t,
			place(r, r.incidentID, r.layerID, "k4", testGeometry, inbound.FeatureChange{EffectiveAt: &future}),
			shared.ErrInvalidInput)
	})

	t.Run("a change in the past takes effect then", func(t *testing.T) {
		past := testAt.Add(-time.Hour)

		state, err := r.svc.PlaceFeature(ctx(), r.incidentID, r.layerID, "k5",
			testGeometry, testProperties, inbound.FeatureChange{EffectiveAt: &past}, testActor)
		require.NoError(t, err)
		assert.Equal(t, past, state.PlacedAt)
	})

	t.Run("a message that was deleted", func(t *testing.T) {
		deleted := newFeatureRig(t)
		require.NoError(t, deleted.messages.DeleteMessage(ctx(), deleted.mapMessage, testActor))

		require.ErrorIs(t,
			place(deleted, deleted.incidentID, deleted.mapLayerID, "k6", testGeometry,
				inbound.FeatureChange{MessageID: &deleted.mapMessage}),
			shared.ErrNotFound)
	})

	t.Run("a message that cannot be loaded", func(t *testing.T) {
		broken := newFeatureRig(t)
		_, messages, _, _ := repos(broken.store)
		failing := &faultyMessages{MessageRepository: messages}
		failing.load = errBoom
		svc := broken.factory.FeatureService(broken.features, broken.incidents, broken.layers, failing)

		_, err := svc.PlaceFeature(ctx(), broken.incidentID, broken.mapLayerID, "k7",
			testGeometry, testProperties, inbound.FeatureChange{MessageID: &broken.mapMessage}, testActor)
		require.ErrorIs(t, err, errBoom)
	})
}

func TestFeatureService_PlaceFeature_ResentCreate(t *testing.T) {
	r := newFeatureRig(t)

	place := func(layerID shared.LayerID, key string, geometry map[string]any, msg *shared.MessageID) (inbound.FeatureState, error) {
		return r.svc.PlaceFeature(ctx(), r.incidentID, layerID, key, geometry, testProperties,
			inbound.FeatureChange{MessageID: msg}, testActor)
	}

	t.Run("the same drawing on the message map is the same feature", func(t *testing.T) {
		first, err := place(r.mapLayerID, "map-1", testGeometry, &r.mapMessage)
		require.NoError(t, err)

		again, err := place(r.mapLayerID, "map-1", testGeometry, &r.mapMessage)
		require.NoError(t, err)
		assert.Equal(t, first.ID, again.ID)
		assert.Equal(t, []shared.MessageID{r.mapMessage}, again.MessageIDs)
	})

	t.Run("drawn for another message it is a different payload", func(t *testing.T) {
		other, err := r.messages.RecordMessage(ctx(), r.incidentID,
			"Zweite", "A", "", "B", "", shared.MediumRadio, new(testAt.Add(-time.Hour)), testActor)
		require.NoError(t, err)

		_, err = r.messages.TriageMessage(ctx(), other.ID, shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{incident.MessageMapDivisionID(r.incidentID)}, nil, testActor)
		require.NoError(t, err)

		_, err = place(r.mapLayerID, "map-2", testGeometry, &r.mapMessage)
		require.NoError(t, err)

		_, err = place(r.mapLayerID, "map-2", testGeometry, &other.ID)
		require.ErrorIs(t, err, shared.ErrConflict)
	})

	t.Run("a feature that was removed is not the same as a new drawing", func(t *testing.T) {
		_, err := place(r.layerID, "removed", testGeometry, nil)
		require.ErrorIs(t, err, shared.ErrConflict)
	})

	t.Run("the same key on another layer is a conflict", func(t *testing.T) {
		secondLayer, err := r.factory.LayerService(r.layers, r.incidents).
			CreateLayer(ctx(), r.incidentID, "Zweite Lage", testActor)
		require.NoError(t, err)

		_, err = place(secondLayer, "placed", testGeometry, nil)
		require.ErrorIs(t, err, shared.ErrConflict)
	})

	t.Run("a payload that cannot be compared is a conflict, not a panic", func(t *testing.T) {
		broken := map[string]any{"type": "Point", "coordinates": []any{math.NaN(), 0.0}}

		_, err := place(r.layerID, "placed", broken, nil)
		require.ErrorIs(t, err, shared.ErrConflict)
	})

	t.Run("a feature that cannot be read is not mistaken for a new one", func(t *testing.T) {
		r.features.load = errBoom
		defer func() { r.features.load = nil }()

		_, err := place(r.layerID, "placed", testGeometry, nil)
		require.ErrorIs(t, err, errBoom)
	})
}

func TestFeatureService_ModifyFeature_Failures(t *testing.T) {
	r := newFeatureRig(t)

	t.Run("an unknown feature", func(t *testing.T) {
		_, err := r.svc.ModifyFeature(
			ctx(),
			shared.FeatureID(newID()),
			testGeometry,
			nil,
			inbound.FeatureChange{},
			testActor,
		)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a feature that was removed", func(t *testing.T) {
		_, err := r.svc.ModifyFeature(ctx(), r.removed, testGeometry, nil, inbound.FeatureChange{}, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a change before the feature was placed", func(t *testing.T) {
		before := testAt.Add(-time.Hour)
		placedAt := testAt

		state, err := r.svc.PlaceFeature(ctx(), r.incidentID, r.layerID, "late",
			testGeometry, testProperties, inbound.FeatureChange{EffectiveAt: &placedAt}, testActor)
		require.NoError(t, err)

		_, err = r.svc.ModifyFeature(
			ctx(),
			state.ID,
			testGeometry,
			nil,
			inbound.FeatureChange{EffectiveAt: &before},
			testActor,
		)
		require.ErrorIs(t, err, shared.ErrBeforeFeaturePlaced)
	})

	t.Run("only the geometry or only the properties", func(t *testing.T) {
		state, err := r.svc.ModifyFeature(
			ctx(),
			r.placed,
			nil,
			map[string]any{"label": "neu"},
			inbound.FeatureChange{},
			testActor,
		)
		require.NoError(t, err)
		assert.Equal(t, testGeometry, state.Geometry)
		assert.Equal(t, map[string]any{"label": "neu"}, state.Properties)
	})
}

// A restored feature is a different outcome than a new one.
func TestFeatureService_RestoreFeature_Failures(t *testing.T) {
	r := newFeatureRig(t)

	t.Run("a feature that is on the map", func(t *testing.T) {
		_, err := r.svc.RestoreFeature(ctx(), r.placed, inbound.FeatureChange{}, testActor)
		require.ErrorIs(t, err, shared.ErrFeatureNotRemoved)
	})

	t.Run("a feature that does not exist", func(t *testing.T) {
		_, err := r.svc.RestoreFeature(ctx(), shared.FeatureID(newID()), inbound.FeatureChange{}, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a removed feature comes back as it was", func(t *testing.T) {
		state, err := r.svc.RestoreFeature(ctx(), r.removed, inbound.FeatureChange{}, testActor)
		require.NoError(t, err)
		assert.Equal(t, feature.DeriveID(r.incidentID, "removed"), state.ID)
		assert.Equal(t, testGeometry, state.Geometry)
	})
}
