package featurechange_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/featurechange"
	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	occurred  = time.Date(2026, 1, 15, 18, 0, 0, 0, time.UTC)
	effective = time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)
	geom      = map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}}
	props     = map[string]any{"label": "A"}
)

func event(eventType string, data any) eventsourcing.Event {
	return eventsourcing.Event{
		StreamType: "Feature", StreamID: uuid.New(), Version: 3, EventType: eventType, Data: data,
		Metadata: map[string]any{"actor": "alice"}, OccurredAt: occurred, RecordedAt: occurred.Add(time.Minute),
	}
}

func TestDecode(t *testing.T) {
	msg := shared.MessageID(uuid.New())
	incident := shared.IncidentID(uuid.New())
	layer := shared.LayerID(uuid.New())

	tests := []struct {
		name      string
		event     eventsourcing.Event
		wantKind  featurechange.Kind
		wantGeom  bool
		wantProps bool
	}{
		{"placed", event("Placed", feature.Placed{
			IncidentID:  incident,
			LayerID:     layer,
			Geometry:    geom,
			Properties:  props,
			EffectiveAt: &effective,
			MessageID:   &msg,
		}), featurechange.Placed, true, true},
		{"imported counts as placed", event("Imported", feature.Imported{
			IncidentID: incident, LayerID: layer, Geometry: geom, Properties: props,
		}), featurechange.Placed, true, true},
		{
			"moved", event("Moved", feature.Moved{Geometry: geom, EffectiveAt: &effective, MessageID: &msg}),
			featurechange.Moved, true, false,
		},
		{
			"restyled",
			event("Restyled", feature.Restyled{Properties: props, EffectiveAt: &effective, MessageID: &msg}),
			featurechange.Restyled,
			false,
			true,
		},
		{
			"removed", event("Removed", feature.Removed{EffectiveAt: &effective, MessageID: &msg}),
			featurechange.Removed, false, false,
		},
		{"restored carries the state", event("Restored", feature.Restored{
			IncidentID:  incident,
			LayerID:     layer,
			Geometry:    geom,
			Properties:  props,
			EffectiveAt: &effective,
			MessageID:   &msg,
		}), featurechange.Restored, true, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, ok, err := featurechange.Decode(tt.event)
			require.NoError(t, err)
			require.True(t, ok)

			assert.Equal(t, tt.wantKind, c.Kind)
			assert.Equal(t, 3, c.Version)
			assert.Equal(t, "alice", c.Actor)
			assert.Equal(t, occurred.Add(time.Minute), c.RecordedAt)
			assert.Equal(t, tt.wantGeom, len(c.Geometry) > 0)
			assert.Equal(t, tt.wantProps, len(c.Properties) > 0)
		})
	}

	t.Run("a feature event ties the change to its message and effective time", func(t *testing.T) {
		c, _, err := featurechange.Decode(
			event("Moved", feature.Moved{Geometry: geom, EffectiveAt: &effective, MessageID: &msg}),
		)
		require.NoError(t, err)
		assert.Equal(t, uuid.UUID(msg).String(), c.MessageID)
		assert.True(t, effective.Equal(c.EffectiveAt))
	})

	t.Run("legacy events without an effective time use when they occurred", func(t *testing.T) {
		c, _, err := featurechange.Decode(event("Moved", feature.Moved{Geometry: geom}))
		require.NoError(t, err)
		assert.True(t, occurred.Equal(c.EffectiveAt))
		assert.Empty(t, c.MessageID)
	})

	t.Run("placed and restored say where the feature lives", func(t *testing.T) {
		for _, data := range []any{
			feature.Placed{IncidentID: incident, LayerID: layer, Geometry: geom, Properties: props},
			feature.Restored{IncidentID: incident, LayerID: layer, Geometry: geom, Properties: props},
		} {
			c, _, err := featurechange.Decode(event("Placed", data))
			require.NoError(t, err)
			assert.Equal(t, uuid.UUID(incident).String(), c.IncidentID)
			assert.Equal(t, uuid.UUID(layer).String(), c.LayerID)
		}
	})

	t.Run("other events are not feature changes", func(t *testing.T) {
		_, ok, err := featurechange.Decode(event("SomethingElse", struct{}{}))
		require.NoError(t, err)
		assert.False(t, ok)
	})
}

func TestGuardKinds(t *testing.T) {
	tests := map[featurechange.Kind][]featurechange.Kind{
		featurechange.Moved:    {featurechange.Placed, featurechange.Moved, featurechange.Restored},
		featurechange.Restyled: {featurechange.Placed, featurechange.Restyled, featurechange.Restored},
		featurechange.Placed:   nil,
		featurechange.Removed:  nil,
		featurechange.Restored: nil,
	}

	for kind, want := range tests {
		t.Run(string(kind), func(t *testing.T) {
			assert.Equal(t, want, featurechange.Change{Kind: kind}.GuardKinds())
		})
	}
}

func TestUpdatesCurrentState(t *testing.T) {
	c := featurechange.Change{Kind: featurechange.Moved, EffectiveAt: effective}
	earlier, later := effective.Add(-time.Minute), effective.Add(time.Minute)

	assert.True(t, c.UpdatesCurrentState(nil), "nothing earlier gates it")
	assert.True(t, c.UpdatesCurrentState(&earlier), "newer than the latest applied")
	assert.True(t, c.UpdatesCurrentState(&effective), "ties go to the later change")
	assert.False(t, c.UpdatesCurrentState(&later), "older than the latest applied is history only")
}
