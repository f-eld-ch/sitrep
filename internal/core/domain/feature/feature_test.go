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
	if err := f.Place(incidentID, layerID, geom, props, feature.ChangeContext{}, actor, at); err != nil {
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
		err := f.Place(incidentID, layerID, geom, props, feature.ChangeContext{}, actor, at)
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
		err := f.Move(newGeom, feature.ChangeContext{}, actor, at)
		require.NoError(t, err)
		assert.Equal(t, newGeom, f.Geometry())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Moved", pending[0].EventType)
	})

	t.Run("move on removed feature is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, feature.ChangeContext{}, actor, at))
		f.Root().ClearPending()

		err := f.Move(newGeom, feature.ChangeContext{}, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_Restyle(t *testing.T) {
	id := shared.FeatureID(uuid.New())
	newProps := map[string]any{"icon": "flag", "color": "red"}

	t.Run("updates properties", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		err := f.Restyle(newProps, feature.ChangeContext{}, actor, at)
		require.NoError(t, err)
		assert.Equal(t, newProps, f.Properties())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Restyled", pending[0].EventType)
	})

	t.Run("restyle on removed feature is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, feature.ChangeContext{}, actor, at))
		f.Root().ClearPending()

		err := f.Restyle(newProps, feature.ChangeContext{}, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_Remove(t *testing.T) {
	id := shared.FeatureID(uuid.New())

	t.Run("removes a feature", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		err := f.Remove(shared.DeleteReasonManual, feature.ChangeContext{}, actor, at)
		require.NoError(t, err)
		assert.True(t, f.IsRemoved())
		pending := f.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Removed", pending[0].EventType)
	})

	t.Run("double-remove is rejected", func(t *testing.T) {
		f := replay(t, id, []eventsourcing.Event{placed(id)})
		require.NoError(t, f.Remove(shared.DeleteReasonManual, feature.ChangeContext{}, actor, at))
		f.Root().ClearPending()

		err := f.Remove(shared.DeleteReasonManual, feature.ChangeContext{}, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestFeature_NewWithUUID(t *testing.T) {
	id := uuid.New()
	f := feature.NewWithUUID(id)
	assert.Equal(t, id, f.Root().ID())
}

func TestFeature_DeriveID(t *testing.T) {
	inc1 := shared.IncidentID(uuid.New())
	inc2 := shared.IncidentID(uuid.New())

	first := feature.DeriveID(inc1, "draw-1")
	assert.Equal(t, first, feature.DeriveID(inc1, "draw-1"), "same key resolves to same ID")
	assert.NotEqual(t, feature.DeriveID(inc1, "draw-1"), feature.DeriveID(inc1, "draw-2"))
	assert.NotEqual(
		t,
		feature.DeriveID(inc1, "draw-1"),
		feature.DeriveID(inc2, "draw-1"),
		"IDs are scoped to the incident",
	)
}

// Message time drives the timeline: effective times may arrive out of drawing order.
func TestFeature_EffectiveTime(t *testing.T) {
	id := shared.FeatureID(uuid.New())
	t1400 := time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)
	t1405 := t1400.Add(5 * time.Minute)
	t1410 := t1400.Add(10 * time.Minute)
	msgA := shared.MessageID(uuid.New())
	msgB := shared.MessageID(uuid.New())
	drawnLater := t1410.Add(time.Hour) // wall-clock time of every command below

	placeAt := func(t *testing.T, eff time.Time, msg *shared.MessageID) *feature.Feature {
		t.Helper()

		f := feature.New(id)
		require.NoError(t, f.Place(incidentID, layerID, geom, props,
			feature.ChangeContext{EffectiveAt: eff, MessageID: msg}, actor, drawnLater))

		return replay(t, id, f.Root().PendingEvents())
	}

	t.Run("zero effective time falls back to the command time", func(t *testing.T) {
		f := placeAt(t, time.Time{}, nil)
		assert.Equal(t, drawnLater, f.PlacedAt())
	})

	t.Run("an older edit drawn later does not override newer geometry", func(t *testing.T) {
		f := placeAt(t, t1400, &msgA)
		newer := map[string]any{"type": "Point", "coordinates": []any{9.0, 47.0}}
		older := map[string]any{"type": "Point", "coordinates": []any{8.7, 47.1}}

		require.NoError(
			t,
			f.Move(newer, feature.ChangeContext{EffectiveAt: t1410, MessageID: &msgB}, actor, drawnLater),
		)
		require.NoError(
			t,
			f.Move(older, feature.ChangeContext{EffectiveAt: t1405, MessageID: &msgA}, actor, drawnLater),
		)

		assert.Equal(t, newer, f.Geometry(), "state is the latest by effective time")
	})

	t.Run("change before placement is rejected", func(t *testing.T) {
		f := placeAt(t, t1405, &msgA)
		err := f.Move(geom, feature.ChangeContext{EffectiveAt: t1400}, actor, drawnLater)
		require.ErrorIs(t, err, shared.ErrBeforeFeaturePlaced)

		err = f.Restyle(props, feature.ChangeContext{EffectiveAt: t1400}, actor, drawnLater)
		require.ErrorIs(t, err, shared.ErrBeforeFeaturePlaced)

		err = f.Remove(shared.DeleteReasonManual, feature.ChangeContext{EffectiveAt: t1400}, actor, drawnLater)
		require.ErrorIs(t, err, shared.ErrBeforeFeaturePlaced)
	})

	t.Run("removal before later changes is rejected", func(t *testing.T) {
		f := placeAt(t, t1400, &msgA)
		require.NoError(t, f.Restyle(props, feature.ChangeContext{EffectiveAt: t1410}, actor, drawnLater))

		err := f.Remove(shared.DeleteReasonManual, feature.ChangeContext{EffectiveAt: t1405}, actor, drawnLater)
		require.ErrorIs(t, err, shared.ErrFeatureHasLaterChanges)

		require.NoError(
			t,
			f.Remove(shared.DeleteReasonManual, feature.ChangeContext{EffectiveAt: t1410}, actor, drawnLater),
		)
	})

	t.Run("linked messages are collected without duplicates", func(t *testing.T) {
		f := placeAt(t, t1400, &msgA)
		require.NoError(
			t,
			f.Restyle(props, feature.ChangeContext{EffectiveAt: t1405, MessageID: &msgA}, actor, drawnLater),
		)
		require.NoError(t, f.Move(geom, feature.ChangeContext{EffectiveAt: t1410, MessageID: &msgB}, actor, drawnLater))

		assert.Equal(t, []shared.MessageID{msgA, msgB}, f.MessageIDs())
	})

	t.Run("legacy events without effective time use their occurred time", func(t *testing.T) {
		e := eventsourcing.Event{
			EventType: "Placed", OccurredAt: t1400,
			Data: feature.Placed{IncidentID: incidentID, LayerID: layerID, Geometry: geom, Properties: props},
		}
		f := replay(t, id, []eventsourcing.Event{e})
		assert.Equal(t, t1400, f.PlacedAt())
	})
}
