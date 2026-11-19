package message_test

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func newRecorded(t *testing.T) *message.Message {
	t.Helper()

	id := shared.MessageID(uuid.New())
	m := replay(t, id, []eventsourcing.Event{recorded(id)})

	return m
}

func TestMessage_AccessorsAfterRecord(t *testing.T) {
	id := shared.MessageID(uuid.New())
	m := message.New(id)

	require.NoError(t, m.Record(incidentID, 7, "Inhalt", "Sender", "Funk 1", "Empfänger", "Funk 2",
		shared.MediumRadio, at.Add(-time.Minute), "author", at, actor))

	assert.Equal(t, uuid.UUID(incidentID), m.OwnerIncidentID())
	assert.Equal(t, incidentID, m.IncidentID())
	assert.Equal(t, 7, m.Number())
	assert.Equal(t, "Sender", m.Sender())
	assert.Equal(t, "Funk 1", m.SenderDetail())
	assert.Equal(t, "Empfänger", m.Receiver())
	assert.Equal(t, "Funk 2", m.ReceiverDetail())
	assert.Equal(t, shared.MediumRadio, m.Medium())
	assert.Equal(t, at.Add(-time.Minute), m.Time())
	assert.Equal(t, at, m.CreatedAt())
	require.NotNil(t, m.AuthorSub())
	assert.Equal(t, "author", *m.AuthorSub())
	assert.False(t, m.IsImported())
	assert.False(t, m.EverMoreInfo())
	assert.False(t, m.EverReset())
	assert.False(t, m.CorrectedAfterTriage())
	assert.Nil(t, m.TriagedAt())
	assert.Empty(t, m.LinkedResourceIDs())
}

func TestMessage_Imported(t *testing.T) {
	id := shared.MessageID(uuid.New())
	div := shared.DivisionID(uuid.New())
	res := shared.ResourceID(uuid.New())
	author := "alt"

	m := replay(t, id, []eventsourcing.Event{{
		Version:    1,
		EventType:  "Imported",
		OccurredAt: at,
		Data: message.Imported{
			IncidentID:        incidentID,
			Number:            3,
			Content:           "Alt",
			Sender:            "S",
			Receiver:          "R",
			Medium:            shared.MediumRadio,
			Time:              at.Add(-time.Hour),
			Triage:            shared.TriageDone,
			Priority:          shared.PriorityHigh,
			DivisionIDs:       []shared.DivisionID{div},
			LinkedResourceIDs: []shared.ResourceID{res},
			AuthorSub:         &author,
			RecordedAt:        at.Add(-2 * time.Hour),
		},
	}})

	assert.True(t, m.IsImported())
	assert.Equal(t, 3, m.Number())
	assert.Equal(t, shared.TriageDone, m.TriageStatus())
	assert.Equal(t, shared.PriorityHigh, m.PriorityStatus())
	assert.Equal(t, []shared.DivisionID{div}, m.DivisionIDs())
	assert.Equal(t, []shared.ResourceID{res}, m.LinkedResourceIDs())
	assert.Equal(t, at.Add(-2*time.Hour), m.CreatedAt())
	assert.Nil(t, m.TriagedAt(), "the history of an imported message is not known")
}

func TestMessage_TriageHistory(t *testing.T) {
	divA := shared.DivisionID(uuid.New())
	divB := shared.DivisionID(uuid.New())
	later := at.Add(time.Hour)

	t.Run("a deleted message cannot be triaged", func(t *testing.T) {
		m := newRecorded(t)
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))
		m.Root().ClearPending()

		err := m.Triage(shared.TriageDone, shared.PriorityNormal, nil, nil, actor, at, actor)
		require.ErrorIs(t, err, shared.ErrNotFound)
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("more information resets the priority to normal", func(t *testing.T) {
		m := newRecorded(t)

		require.NoError(t, m.Triage(shared.TriageMoreInfo, shared.PriorityHigh, nil, nil, actor, at, actor))
		assert.Equal(t, shared.PriorityNormal, m.PriorityStatus())
		assert.True(t, m.EverMoreInfo())
		assert.False(t, m.EverReset())
	})

	t.Run("a reset is remembered", func(t *testing.T) {
		m := newRecorded(t)

		require.NoError(t, m.Triage(shared.TriageReset, shared.PriorityNormal, nil, nil, actor, at, actor))
		assert.True(t, m.EverReset())
		assert.False(t, m.EverMoreInfo())
	})

	t.Run("triaging to the same state again records nothing", func(t *testing.T) {
		m := newRecorded(t)
		require.NoError(
			t,
			m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{divA}, nil, actor, at, actor),
		)
		m.Root().ClearPending()

		require.NoError(
			t,
			m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{divA}, nil, actor, later, actor),
		)
		assert.Empty(t, m.Root().PendingEvents())
	})

	t.Run("the time of the first final triage and of each division assignment is kept", func(t *testing.T) {
		m := newRecorded(t)
		require.NoError(
			t,
			m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{divA}, nil, actor, at, actor),
		)

		triagedAt := m.TriagedAt()
		require.NotNil(t, triagedAt)
		assert.Equal(t, at, *triagedAt)

		require.NoError(
			t,
			m.Triage(
				shared.TriageDone,
				shared.PriorityNormal,
				[]shared.DivisionID{divA, divB},
				nil,
				actor,
				later,
				actor,
			),
		)
		require.NotNil(t, m.TriagedAt())
		assert.Equal(t, at, *m.TriagedAt(), "triaged at its first final triage")

		gotA, okA := m.DivisionAssignedAt(divA)
		gotB, okB := m.DivisionAssignedAt(divB)

		require.True(t, okA)
		require.True(t, okB)
		assert.Equal(t, at, gotA, "a division that stays keeps its time")
		assert.Equal(t, later, gotB)

		// Taken out and given the message again, a division starts over.
		require.NoError(
			t,
			m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{divB}, nil, actor, later, actor),
		)
		_, okA = m.DivisionAssignedAt(divA)
		assert.False(t, okA)

		restart := later.Add(time.Hour)
		require.NoError(
			t,
			m.Triage(
				shared.TriageDone,
				shared.PriorityNormal,
				[]shared.DivisionID{divA, divB},
				nil,
				actor,
				restart,
				actor,
			),
		)

		gotA, _ = m.DivisionAssignedAt(divA)
		assert.Equal(t, restart, gotA)
	})
}

func TestMessage_Acknowledgements(t *testing.T) {
	divA := shared.DivisionID(uuid.New())
	divB := shared.DivisionID(uuid.New())

	m := newRecorded(t)
	require.NoError(
		t,
		m.Triage(shared.TriageDone, shared.PriorityNormal, []shared.DivisionID{divA, divB}, nil, actor, at, actor),
	)

	// B acknowledges first, then A; a second acknowledgement at the same instant is ordered by division.
	require.NoError(t, m.AcknowledgeForDivision(divB, "b", at.Add(time.Minute)))
	require.NoError(t, m.AcknowledgeForDivision(divA, "a", at.Add(2*time.Minute)))

	acks := m.Acknowledgements()
	require.Len(t, acks, 2)
	assert.Equal(t, divB, acks[0].DivisionID, "oldest first")
	assert.Equal(t, "b", acks[0].By)
	assert.Equal(t, divA, acks[1].DivisionID)

	gotAt, ok := m.AcknowledgedAt(divA)
	require.True(t, ok)
	assert.Equal(t, at.Add(2*time.Minute), gotAt)

	_, ok = m.AcknowledgedAt(shared.DivisionID(uuid.New()))
	assert.False(t, ok)

	t.Run("simultaneous acknowledgements are ordered by division id", func(t *testing.T) {
		same := newRecorded(t)
		require.NoError(
			t,
			same.Triage(
				shared.TriageDone,
				shared.PriorityNormal,
				[]shared.DivisionID{divA, divB},
				nil,
				actor,
				at,
				actor,
			),
		)
		require.NoError(t, same.AcknowledgeForDivision(divA, "x", at))
		require.NoError(t, same.AcknowledgeForDivision(divB, "x", at))

		got := same.Acknowledgements()
		require.Len(t, got, 2)
		assert.LessOrEqual(t, strings.Compare(got[0].DivisionID.String(), got[1].DivisionID.String()), 0)
	})

	t.Run("a deleted message can neither be acknowledged nor revoked", func(t *testing.T) {
		deleted := newRecorded(t)
		require.NoError(t, deleted.Delete(shared.DeleteReasonManual, actor, at))

		require.ErrorIs(t, deleted.AcknowledgeForDivision(divA, actor, at), shared.ErrNotFound)
		require.ErrorIs(t, deleted.RevokeDivisionAcknowledgement(divA, actor, at), shared.ErrNotFound)
	})
}

func TestMessage_CorrectedAfterTriage(t *testing.T) {
	str := func(s string) *string { return &s }

	triaged := func(t *testing.T) *message.Message {
		t.Helper()

		m := newRecorded(t)
		require.NoError(t, m.Triage(shared.TriageDone, shared.PriorityNormal, nil, nil, actor, at, actor))

		return m
	}

	t.Run("before triage a correction is just a correction", func(t *testing.T) {
		m := newRecorded(t)
		require.NoError(t, m.Correct(str("anders"), nil, nil, nil, nil, nil, nil, actor, at, actor))
		assert.False(t, m.CorrectedAfterTriage())
	})

	t.Run("saving the same values again is no correction", func(t *testing.T) {
		m := triaged(t)
		require.NoError(t, m.Correct(str(m.Content()), str(m.Sender()), nil, nil, nil, nil, nil, actor, at, actor))
		assert.False(t, m.CorrectedAfterTriage())
	})

	changes := map[string]func(m *message.Message) error{
		"content": func(m *message.Message) error {
			return m.Correct(str("anders"), nil, nil, nil, nil, nil, nil, actor, at, actor)
		},
		"sender": func(m *message.Message) error {
			return m.Correct(nil, str("anderer"), nil, nil, nil, nil, nil, actor, at, actor)
		},
		"sender detail": func(m *message.Message) error {
			return m.Correct(nil, nil, str("detail"), nil, nil, nil, nil, actor, at, actor)
		},
		"receiver": func(m *message.Message) error {
			return m.Correct(nil, nil, nil, str("anderer"), nil, nil, nil, actor, at, actor)
		},
		"receiver detail": func(m *message.Message) error {
			return m.Correct(nil, nil, nil, nil, str("detail"), nil, nil, actor, at, actor)
		},
		"medium": func(m *message.Message) error {
			medium := shared.MediumOther
			return m.Correct(nil, nil, nil, nil, nil, &medium, nil, actor, at, actor)
		},
	}

	for name, change := range changes {
		t.Run("a changed "+name+" is remembered", func(t *testing.T) {
			m := triaged(t)
			require.NoError(t, change(m))
			assert.True(t, m.CorrectedAfterTriage())
		})
	}

	t.Run("all fields are applied", func(t *testing.T) {
		m := newRecorded(t)
		medium := shared.MediumOther

		require.NoError(
			t,
			m.Correct(str("c"), str("s"), str("sd"), str("r"), str("rd"), &medium, nil, "editor", at, actor),
		)
		assert.Equal(t, "c", m.Content())
		assert.Equal(t, "s", m.Sender())
		assert.Equal(t, "sd", m.SenderDetail())
		assert.Equal(t, "r", m.Receiver())
		assert.Equal(t, "rd", m.ReceiverDetail())
		assert.Equal(t, medium, m.Medium())
	})
}

func TestMessage_AttachmentRules(t *testing.T) {
	attID := shared.AttachmentID(uuid.New())

	tests := []struct {
		name        string
		filename    string
		contentType string
		size        int64
	}{
		{"empty filename", " ", "image/png", 10},
		{"filename too long", strings.Repeat("a", 256), "image/png", 10},
		{"no content", "a.png", "image/png", 0},
		{"too large", "a.png", "image/png", message.MaxAttachmentSize + 1},
		{"type not allowed", "a.svg", "image/svg+xml", 10},
	}

	for _, tt := range tests {
		t.Run(tt.name+" is rejected", func(t *testing.T) {
			m := newRecorded(t)

			err := m.AddAttachment(attID, tt.filename, tt.contentType, tt.size, "sum", "key", "up", at, actor)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
			assert.Empty(t, m.Attachments())
		})
	}

	t.Run("a file of exactly the largest size is accepted", func(t *testing.T) {
		m := newRecorded(t)

		require.NoError(t, m.AddAttachment(attID, strings.Repeat("a", 255), "application/pdf",
			message.MaxAttachmentSize, "sum", "key", "up", at, actor))
		assert.Len(t, m.Attachments(), 1)
	})

	t.Run("a deleted message takes no attachments and gives none up", func(t *testing.T) {
		m := newRecorded(t)
		require.NoError(t, m.AddAttachment(attID, "a.png", "image/png", 1, "sum", "key", "up", at, actor))
		require.NoError(t, m.Delete(shared.DeleteReasonManual, actor, at))

		require.ErrorIs(
			t,
			m.AddAttachment(shared.AttachmentID(uuid.New()), "b.png", "image/png", 1, "s", "k", "u", at, actor),
			shared.ErrNotFound,
		)
		require.ErrorIs(t, m.RemoveAttachment(attID, "up", at, actor), shared.ErrNotFound)
	})
}

func TestMessage_TransitionRejectsForeignEvents(t *testing.T) {
	m := message.New(shared.MessageID(uuid.New()))

	require.Error(t, m.Transition(eventsourcing.Event{Data: 42}))
}
