package message_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at         = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor      = "sub-123"
	incidentID = shared.IncidentID(uuid.New())
)

func recorded(id shared.MessageID) eventsourcing.Event {
	m := message.New(id)
	require.NoError(nil, m.Record(
		incidentID, 1,
		"Wasserstand steigt", "Beobachter Nord", "", "Führungsstab", "",
		shared.MediumRadio, at, actor, at, actor,
	))
	return m.Root().PendingEvents()[0]
}

func replay(t *testing.T, id shared.MessageID, events []eventsourcing.Event) *message.Message {
	t.Helper()
	m := message.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(m, e))
	}
	return m
}

func TestMessage_Record(t *testing.T) {
	id := shared.MessageID(uuid.New())

	tests := []struct {
		name    string
		content string
		sender  string
		recv    string
		wantErr error
	}{
		{"valid fields", "Wasserstand steigt", "Beobachter Nord", "Führungsstab", nil},
		{"empty content rejected", "", "Sender", "Receiver", shared.ErrInvalidInput},
		{"empty sender rejected", "Content", "", "Receiver", shared.ErrInvalidInput},
		{"empty receiver rejected", "Content", "Sender", "", shared.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := message.New(id)
			err := m.Record(incidentID, 1, tt.content, tt.sender, "", tt.recv, "",
				shared.MediumRadio, at, actor, at, actor)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, m.Root().PendingEvents())
				return
			}
			require.NoError(t, err)
			pending := m.Root().PendingEvents()
			require.Len(t, pending, 1)
			assert.Equal(t, "Recorded", pending[0].EventType)
		})
	}
}

func TestMessage_Correct(t *testing.T) {
	id := shared.MessageID(uuid.New())

	str := func(s string) *string { return &s }

	t.Run("correction updates content", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		newContent := "Wasserstand sinkt"
		err := m.Correct(&newContent, nil, nil, nil, nil, nil, nil, actor, at, actor)
		require.NoError(t, err)
		assert.Equal(t, "Wasserstand sinkt", m.Content())
		pending := m.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Corrected", pending[0].EventType)
	})

	t.Run("empty content is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Correct(str(""), nil, nil, nil, nil, nil, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("empty sender is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Correct(nil, str(""), nil, nil, nil, nil, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("correction on deleted message is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.Correct(str("new"), nil, nil, nil, nil, nil, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestMessage_Triage(t *testing.T) {
	id := shared.MessageID(uuid.New())
	divID := shared.DivisionID(uuid.New())

	t.Run("triage replaces division set atomically", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Triage(shared.TriageDone, shared.PriorityHigh, []shared.DivisionID{divID}, actor, at, actor)
		require.NoError(t, err)
		assert.Equal(t, shared.TriageDone, m.TriageStatus())
		assert.Equal(t, shared.PriorityHigh, m.PriorityStatus())
		require.Len(t, m.DivisionIDs(), 1)
		assert.Equal(t, divID, m.DivisionIDs()[0])
	})

	t.Run("triage on deleted message is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.Triage(shared.TriageDone, shared.PriorityHigh, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestMessage_Delete(t *testing.T) {
	id := shared.MessageID(uuid.New())

	t.Run("delete marks as deleted", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Delete(shared.DeleteReasonManual, actor, at)
		require.NoError(t, err)
		assert.True(t, m.IsDeleted())
		pending := m.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Deleted", pending[0].EventType)
	})

	t.Run("double-delete is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.Delete(shared.DeleteReasonManual, actor, at)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}
