package projection_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// obj is a JSON object payload.
type obj = map[string]any

// evt builds an event the way the store delivers it: Data is a plain value that the handler
// round-trips through JSON.
func evt(streamType string, id uuid.UUID, eventType string, data any, at time.Time) eventsourcing.Event {
	return eventsourcing.Event{
		StreamType: streamType,
		StreamID:   id,
		EventType:  eventType,
		Data:       data,
		OccurredAt: at,
		RecordedAt: at,
	}
}

// applyAll applies the events in order and fails the test on the first error.
func applyAll(t *testing.T, h projection.Handler, events ...eventsourcing.Event) {
	t.Helper()

	for _, e := range events {
		require.NoError(t, h.Apply(t.Context(), e), "%s/%s", e.StreamType, e.EventType)
	}
}

// tm returns a fixed time offset by the given number of minutes.
func tm(minutes int) time.Time {
	return time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC).Add(time.Duration(minutes) * time.Minute)
}
