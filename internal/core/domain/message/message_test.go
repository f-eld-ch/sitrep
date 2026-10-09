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
	if err := m.Record(
		incidentID, 1,
		"Wasserstand steigt", "Beobachter Nord", "", "Führungsstab", "",
		shared.MediumRadio, at, actor, at, actor,
	); err != nil {
		panic(err)
	}

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
		{"whitespace content rejected", " \t", "Sender", "Receiver", shared.ErrInvalidInput},
		{"empty sender rejected", "Content", "", "Receiver", shared.ErrInvalidInput},
		{"whitespace sender rejected", "Content", " \t", "Receiver", shared.ErrInvalidInput},
		{"empty receiver rejected", "Content", "Sender", "", shared.ErrInvalidInput},
		{"whitespace receiver rejected", "Content", "Sender", " \t", shared.ErrInvalidInput},
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

	t.Run("Phone and Email messages require details", func(t *testing.T) {
		m := message.New(id)
		err := m.Record(incidentID, 1, "Content", "Sender", "", "Receiver", "555-2222",
			shared.MediumPhone, at, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)

		m = message.New(id)
		err = m.Record(incidentID, 1, "Content", "Sender", "sender@example.test", "Receiver", " \t",
			shared.MediumEmail, at, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("rejects timestamps more than five minutes in the future", func(t *testing.T) {
		m := message.New(id)
		err := m.Record(incidentID, 1, "Content", "Sender", "", "Receiver", "", shared.MediumRadio,
			at.Add(5*time.Minute+time.Nanosecond), actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("allows timestamps up to five minutes in the future", func(t *testing.T) {
		m := message.New(id)
		err := m.Record(incidentID, 1, "Content", "Sender", "", "Receiver", "", shared.MediumRadio,
			at.Add(5*time.Minute), actor, at, actor)
		require.NoError(t, err)
	})
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

	t.Run("whitespace receiver is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Correct(nil, nil, nil, str(" \t"), nil, nil, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("changing to Phone requires details", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		medium := shared.MediumPhone
		err := m.Correct(nil, nil, nil, nil, nil, &medium, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("cannot correct a timestamp more than five minutes in the future", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		futureTime := at.Add(5*time.Minute + time.Nanosecond)
		err := m.Correct(nil, nil, nil, nil, nil, nil, &futureTime, actor, at, actor)
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

func TestMessage_TimeLockedOnceTriaged(t *testing.T) {
	id := shared.MessageID(uuid.New())
	divID := shared.DivisionID(uuid.New())
	earlier := at.Add(-time.Hour)

	triaged := func(t *testing.T, status shared.TriageStatus) *message.Message {
		t.Helper()

		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Triage(status, shared.PriorityNormal, []shared.DivisionID{divID}, nil, actor, at, actor))
		m.Root().ClearPending()

		return m
	}

	t.Run("a message that is not triaged yet can change its time", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})

		require.NoError(t, m.Correct(nil, nil, nil, nil, nil, nil, &earlier, actor, at, actor))
		assert.True(t, earlier.Equal(m.Time()))
	})

	t.Run("a triaged message cannot", func(t *testing.T) {
		m := triaged(t, shared.TriageDone)

		err := m.Correct(nil, nil, nil, nil, nil, nil, &earlier, actor, at, actor)

		require.ErrorIs(t, err, shared.ErrMessageTimeLocked)
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("a message waiting for more information is not triaged yet", func(t *testing.T) {
		m := triaged(t, shared.TriageMoreInfo)

		require.NoError(t, m.Correct(nil, nil, nil, nil, nil, nil, &earlier, actor, at, actor))
	})

	t.Run("a triaged message may repeat its time, and change anything else", func(t *testing.T) {
		m := triaged(t, shared.TriageDone)
		same := m.Time()
		content := "korrigiert"

		require.NoError(t, m.Correct(&content, nil, nil, nil, nil, nil, &same, actor, at, actor))
		assert.Equal(t, "korrigiert", m.Content())
	})
}

func TestMessage_Triage(t *testing.T) {
	id := shared.MessageID(uuid.New())
	divID := shared.DivisionID(uuid.New())

	t.Run("triage replaces division set atomically", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Triage(shared.TriageDone, shared.PriorityHigh, []shared.DivisionID{divID}, nil, actor, at, actor)
		require.NoError(t, err)
		assert.Equal(t, shared.TriageDone, m.TriageStatus())
		assert.Equal(t, shared.PriorityHigh, m.PriorityStatus())
		require.Len(t, m.DivisionIDs(), 1)
		assert.Equal(t, divID, m.DivisionIDs()[0])
	})

	t.Run("needs more information resets priority to normal", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.Triage(shared.TriageMoreInfo, shared.PriorityHigh, nil, nil, actor, at, actor)
		require.NoError(t, err)
		assert.Equal(t, shared.PriorityNormal, m.PriorityStatus())
	})

	t.Run("triage on deleted message is rejected", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.Triage(shared.TriageDone, shared.PriorityHigh, nil, nil, actor, at, actor)
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

func TestMessage_AddAttachment(t *testing.T) {
	id := shared.MessageID(uuid.New())
	attID := shared.AttachmentID(uuid.New())

	validAdd := func(m *message.Message) error {
		return m.AddAttachment(attID, "photo.jpg", "image/jpeg", 1024,
			"sha256:abc", "incidents/x/y", actor, at, actor)
	}

	t.Run("adds attachment to recorded message", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, validAdd(m))

		attachments := m.Attachments()
		require.Len(t, attachments, 1)
		assert.Equal(t, attID, attachments[0].ID)
		assert.Equal(t, "photo.jpg", attachments[0].Filename)
		assert.Equal(t, "image/jpeg", attachments[0].ContentType)
		assert.Equal(t, int64(1024), attachments[0].Size)
		assert.Equal(t, "sha256:abc", attachments[0].Checksum)
		assert.Equal(t, actor, attachments[0].UploaderSub)

		pending := m.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "AttachmentAdded", pending[0].EventType)
	})

	t.Run("adding same attachment ID twice is idempotent", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, validAdd(m))
		m.Root().ClearPending()

		// Second add with the same ID: no error and no new pending event.
		require.NoError(t, validAdd(m))
		assert.Empty(t, m.Root().PendingEvents())
		assert.Len(t, m.Attachments(), 1)
	})

	t.Run("rejected on deleted message", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := validAdd(m)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("rejected for empty filename", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.AddAttachment(shared.AttachmentID(uuid.New()), "", "image/jpeg", 1024,
			"sha256:x", "k", actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("rejected for zero size", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.AddAttachment(shared.AttachmentID(uuid.New()), "f.jpg", "image/jpeg", 0,
			"sha256:x", "k", actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("rejected for over-cap size", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.AddAttachment(shared.AttachmentID(uuid.New()), "f.jpg", "image/jpeg",
			message.MaxAttachmentSize+1, "sha256:x", "k", actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("rejected for disallowed content type", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		err := m.AddAttachment(shared.AttachmentID(uuid.New()), "f.html", "text/html", 100,
			"sha256:x", "k", actor, at, actor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("Attachments returns a copy — mutation does not affect aggregate", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, validAdd(m))

		got := m.Attachments()
		got[0].Filename = "tampered"

		assert.Equal(t, "photo.jpg", m.Attachments()[0].Filename)
	})

	t.Run("replay via Transition restores attachment state", func(t *testing.T) {
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, validAdd(m))

		// Collect all events and replay on a fresh aggregate.
		events := m.Root().PendingEvents()
		m2 := replay(t, id, events)
		require.Len(t, m2.Attachments(), 1)
		assert.Equal(t, attID, m2.Attachments()[0].ID)
	})
}

func TestMessage_RemoveAttachment(t *testing.T) {
	id := shared.MessageID(uuid.New())
	attID := shared.AttachmentID(uuid.New())

	msgWithAttachment := func(t *testing.T) *message.Message {
		t.Helper()
		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.AddAttachment(attID, "photo.jpg", "image/jpeg", 1024,
			"sha256:abc", "incidents/x/y", actor, at, actor))
		m.Root().ClearPending()

		return m
	}

	t.Run("removes known attachment", func(t *testing.T) {
		m := msgWithAttachment(t)
		require.NoError(t, m.RemoveAttachment(attID, actor, at, actor))

		assert.Empty(t, m.Attachments())
		pending := m.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "AttachmentRemoved", pending[0].EventType)
	})

	t.Run("unknown attachment ID returns ErrNotFound", func(t *testing.T) {
		m := msgWithAttachment(t)
		err := m.RemoveAttachment(shared.AttachmentID(uuid.New()), actor, at, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("rejected on deleted message", func(t *testing.T) {
		m := msgWithAttachment(t)
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.RemoveAttachment(attID, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("replay via Transition removes attachment from state", func(t *testing.T) {
		m := msgWithAttachment(t)
		require.NoError(t, m.RemoveAttachment(attID, actor, at, actor))

		events := m.Root().PendingEvents()
		m2 := replay(t, id, events)
		assert.Empty(t, m2.Attachments())
	})
}

func TestMessage_DivisionAcknowledgement(t *testing.T) {
	id := shared.MessageID(uuid.New())
	mapDiv := shared.DivisionID(uuid.New())
	otherDiv := shared.DivisionID(uuid.New())

	triaged := func(t *testing.T, divisions ...shared.DivisionID) *message.Message {
		t.Helper()

		m := replay(t, id, []eventsourcing.Event{recorded(id)})
		require.NoError(t, m.Triage(
			shared.TriageDone, shared.PriorityNormal, divisions, nil, actor, at, actor))
		m.Root().ClearPending()

		return m
	}

	t.Run("a triaged division can acknowledge", func(t *testing.T) {
		m := triaged(t, mapDiv, otherDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))

		pending := m.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "DivisionAcknowledged", pending[0].EventType)
		assert.True(t, m.IsAcknowledgedBy(mapDiv))
		assert.False(t, m.IsAcknowledgedBy(otherDiv), "acknowledgements are per division")
	})

	t.Run("a division the message is not triaged to cannot acknowledge", func(t *testing.T) {
		m := triaged(t, otherDiv)
		err := m.AcknowledgeForDivision(mapDiv, actor, at)
		require.ErrorIs(t, err, shared.ErrNotTriagedToDivision)
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("acknowledging twice is a no-op", func(t *testing.T) {
		m := triaged(t, mapDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		m.Root().ClearPending()

		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("revoking withdraws, and revoking nothing is a no-op", func(t *testing.T) {
		m := triaged(t, mapDiv)
		require.NoError(t, m.RevokeDivisionAcknowledgement(mapDiv, actor, at))
		assert.Empty(t, m.Root().PendingEvents())

		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		require.NoError(t, m.RevokeDivisionAcknowledgement(mapDiv, actor, at))
		assert.False(t, m.IsAcknowledgedBy(mapDiv))
	})

	t.Run("re-triage that removes a division drops its acknowledgement", func(t *testing.T) {
		m := triaged(t, mapDiv, otherDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		require.NoError(t, m.AcknowledgeForDivision(otherDiv, actor, at))

		require.NoError(
			t,
			m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{otherDiv}, nil, actor, at, actor),
		)
		assert.False(t, m.IsAcknowledgedBy(mapDiv))
		assert.True(t, m.IsAcknowledgedBy(otherDiv), "unrelated divisions keep their acknowledgement")

		// Adding the division back requires a fresh acknowledgement.
		require.NoError(
			t,
			m.Triage(
				shared.TriageDone,
				shared.PriorityNormal,
				[]shared.DivisionID{otherDiv, mapDiv},
				nil,
				actor,
				at,
				actor,
			),
		)
		assert.False(t, m.IsAcknowledgedBy(mapDiv))
	})

	t.Run("correcting the content clears all acknowledgements", func(t *testing.T) {
		newContent := "Wasserstand sinkt"

		m := triaged(t, mapDiv, otherDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		require.NoError(t, m.AcknowledgeForDivision(otherDiv, actor, at))
		require.NoError(t, m.Correct(&newContent, nil, nil, nil, nil, nil, nil, actor, at, actor))
		assert.Empty(t, m.Acknowledgements())
	})

	t.Run("the time cannot be corrected, so acknowledgements stay", func(t *testing.T) {
		newTime := at.Add(-time.Minute)

		m := triaged(t, mapDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))
		require.ErrorIs(t,
			m.Correct(nil, nil, nil, nil, nil, nil, &newTime, actor, at, actor),
			shared.ErrMessageTimeLocked)
		assert.True(t, m.IsAcknowledgedBy(mapDiv))
	})

	t.Run("correcting other fields keeps acknowledgements", func(t *testing.T) {
		m := triaged(t, mapDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))

		sender := "Neuer Absender"
		require.NoError(t, m.Correct(nil, &sender, nil, nil, nil, nil, nil, actor, at, actor))
		assert.True(t, m.IsAcknowledgedBy(mapDiv))
	})

	t.Run("state is rebuilt from events", func(t *testing.T) {
		m := triaged(t, mapDiv)
		require.NoError(t, m.AcknowledgeForDivision(mapDiv, actor, at))

		replayed := replay(t, id, append([]eventsourcing.Event{recorded(id)}, m.Root().PendingEvents()...))
		assert.True(t, replayed.IsAcknowledgedBy(mapDiv))
		require.Len(t, replayed.Acknowledgements(), 1)
		assert.Equal(t, actor, replayed.Acknowledgements()[0].By)
	})

	t.Run("deleted messages reject acknowledgements", func(t *testing.T) {
		m := triaged(t, mapDiv)
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		require.ErrorIs(t, m.AcknowledgeForDivision(mapDiv, actor, at), shared.ErrNotFound)
	})
}
