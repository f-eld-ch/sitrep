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

func TestFeature_Accessors(t *testing.T) {
	id := shared.FeatureID(uuid.New())
	f := replay(t, id, []eventsourcing.Event{placed(id)})

	assert.Equal(t, uuid.UUID(incidentID), f.OwnerIncidentID())
	assert.Equal(t, incidentID, f.IncidentID())
	assert.Equal(t, layerID, f.LayerID())
}

func TestFeature_Imported(t *testing.T) {
	id := shared.FeatureID(uuid.New())

	f := replay(t, id, []eventsourcing.Event{{
		Version:    1,
		EventType:  "Imported",
		OccurredAt: at,
		Data:       feature.Imported{IncidentID: incidentID, LayerID: layerID, Geometry: geom, Properties: props},
	}})

	assert.Equal(t, incidentID, f.IncidentID())
	assert.Equal(t, layerID, f.LayerID())
	assert.Equal(t, geom, f.Geometry())
	assert.Equal(t, props, f.Properties())
	assert.Equal(t, at, f.PlacedAt(), "an imported feature is placed when it was recorded")
	assert.False(t, f.IsRemoved())
}

func TestFeature_TransitionRejectsForeignEvents(t *testing.T) {
	f := feature.New(shared.FeatureID(uuid.New()))

	require.Error(t, f.Transition(eventsourcing.Event{Data: 42}))
}

// Events recorded out of order (a change drawn for an earlier message after a later one) leave
// the state that is latest by effective time. A restore at the removal time must not rewind it.
func TestFeature_RestoreDoesNotRewindNewerEdits(t *testing.T) {
	t1400 := time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)
	t1405 := t1400.Add(5 * time.Minute)
	t1410 := t1400.Add(10 * time.Minute)
	moved := map[string]any{"type": "Point", "coordinates": []any{9.0, 47.0}}
	older := map[string]any{"type": "Point", "coordinates": []any{1.0, 1.0}}

	f := feature.New(shared.FeatureID(uuid.New()))

	for _, data := range []any{
		feature.Placed{IncidentID: incidentID, LayerID: layerID, Geometry: geom, Properties: props, EffectiveAt: &t1400},
		feature.Moved{Geometry: moved, EffectiveAt: &t1410},
		feature.Removed{EffectiveAt: &t1405},
		feature.Restored{EffectiveAt: &t1405},
		feature.Moved{Geometry: older, EffectiveAt: &t1405},
	} {
		require.NoError(t, f.Transition(eventsourcing.Event{Data: data, OccurredAt: at}))
	}

	assert.False(t, f.IsRemoved())
	assert.Equal(t, moved, f.Geometry(), "the move at 14:10 stays the latest")
}
