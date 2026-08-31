package layer_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at         = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor      = "sub-123"
	incidentID = shared.IncidentID(uuid.New())
)

func created(id shared.LayerID) eventsourcing.Event {
	l := layer.New(id)
	require.NoError(nil, l.Create(incidentID, "Lage", actor, at))
	return l.Root().PendingEvents()[0]
}

func replay(t *testing.T, id shared.LayerID, events []eventsourcing.Event) *layer.Layer {
	t.Helper()
	l := layer.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(l, e))
	}
	return l
}

func TestLayer_Create(t *testing.T) {
	id := shared.LayerID(uuid.New())

	t.Run("valid name creates event", func(t *testing.T) {
		l := layer.New(id)
		err := l.Create(incidentID, "Lage", actor, at)
		require.NoError(t, err)
		pending := l.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Created", pending[0].EventType)
		assert.Equal(t, "Lage", l.Name())
	})

	t.Run("empty name is rejected", func(t *testing.T) {
		l := layer.New(id)
		err := l.Create(incidentID, "", actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Empty(t, l.Root().PendingEvents())
	})
}

func TestLayer_Rename(t *testing.T) {
	id := shared.LayerID(uuid.New())

	t.Run("rename updates name", func(t *testing.T) {
		l := replay(t, id, []eventsourcing.Event{created(id)})
		err := l.Rename("Hauptlage", actor, at)
		require.NoError(t, err)
		assert.Equal(t, "Hauptlage", l.Name())
		pending := l.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Renamed", pending[0].EventType)
	})

	t.Run("empty name is rejected", func(t *testing.T) {
		l := replay(t, id, []eventsourcing.Event{created(id)})
		err := l.Rename("", actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("rename on removed layer is rejected", func(t *testing.T) {
		l := replay(t, id, []eventsourcing.Event{created(id)})
		require.NoError(t, l.Remove(shared.DeleteReasonManual, actor, at))
		l.Root().ClearPending()

		err := l.Rename("New Name", actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestLayer_Remove(t *testing.T) {
	id := shared.LayerID(uuid.New())

	t.Run("removes a layer", func(t *testing.T) {
		l := replay(t, id, []eventsourcing.Event{created(id)})
		err := l.Remove(shared.DeleteReasonManual, actor, at)
		require.NoError(t, err)
		assert.True(t, l.IsRemoved())
		pending := l.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Removed", pending[0].EventType)
	})

	t.Run("double-remove is rejected", func(t *testing.T) {
		l := replay(t, id, []eventsourcing.Event{created(id)})
		require.NoError(t, l.Remove(shared.DeleteReasonManual, actor, at))
		l.Root().ClearPending()

		err := l.Remove(shared.DeleteReasonManual, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}
