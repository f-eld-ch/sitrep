package feature_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at         = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor      = "sub-123"
	incidentID = shared.IncidentID(uuid.New())
	layerID    = shared.LayerID(uuid.New())
	geom       = map[string]any{"type": "Point", "coordinates": []any{8.53, 47.37}}
	props      = map[string]any{"icon": "marker"}
)

func placed(id shared.FeatureID) eventsourcing.Event {
	f := feature.New(id)
	if err := f.Place(incidentID, layerID, geom, props, actor, at); err != nil {
		panic(err)
	}

	return f.Root().PendingEvents()[0]
}

func replay(t *testing.T, id shared.FeatureID, events []eventsourcing.Event) *feature.Feature {
	t.Helper()

	f := feature.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(f, e))
	}

	return f
}

func TestFeature_Place(t *testing.T) {
	id := shared.FeatureID(uuid.New())

	t.Run("creates placed event with geometry and properties", func(t *testing.T) {
		f := feature.New(id)
		err := f.Place(incidentID, layerID, geom, props, actor, at)
		require.NoError(t, err)

		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Placed", pending[0].EventType)
		assert.Equal(t, geom, f.Geometry())
		assert.Equal(t, props, f.Properties())
	})
}

func TestFeature_Move(t *testing.T) {
	id := shared.FeatureID(uuid.New())
	newGeom := map[string]any{"type": "Point", "coordinates": []any{8.60, 47.40}}

	t.Run("updates geometry", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		err := f.Move(newGeom, actor, at)
		require.NoError(t, err)
		assert.Equal(t, newGeom, f.Geometry())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Moved", pending[0].EventType)
	})

	t.Run("move on removed feature is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, actor, at))
		f.Root().ClearPending()

		err := f.Move(newGeom, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_Restyle(t *testing.T) {
	id := shared.FeatureID(uuid.New())
	newProps := map[string]any{"icon": "flag", "color": "red"}

	t.Run("updates properties", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		err := f.Restyle(newProps, actor, at)
		require.NoError(t, err)
		assert.Equal(t, newProps, f.Properties())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Restyled", pending[0].EventType)
	})

	t.Run("restyle on removed feature is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, actor, at))
		f.Root().ClearPending()

		err := f.Restyle(newProps, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_Remove(t *testing.T) {
	id := shared.FeatureID(uuid.New())

	t.Run("removes a feature", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		err := f.Remove(shared.DeleteReasonManual, actor, at)
		require.NoError(t, err)
		assert.True(t, f.IsRemoved())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Removed", pending[0].EventType)
	})

	t.Run("double-remove is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, actor, at))
		f.Root().ClearPending()

		err := f.Remove(shared.DeleteReasonManual, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_NewWithUUID(t *testing.T) {
	id := uuid.New()
	f := feature.NewWithUUID(id)
	assert.Equal(t, id, f.Root().ID())
}
