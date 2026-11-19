package projection_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func recordedEvent(msg, incident uuid.UUID) eventsourcing.Event {
	return evt("Message", msg, "Recorded", obj{
		"incidentId": incident.String(), "number": 4, "content": "Road closed",
		"sender": "Alice", "senderDetail": "Patrol 1", "receiver": "Bob", "receiverDetail": "HQ",
		"medium": "RADIO", "time": tm(0), "authorSub": "sub-alice",
	}, tm(1))
}

func TestMessageHandler_Metadata(t *testing.T) {
	h := projection.NewMessageHandler()

	assert.Equal(t, "readmodel.message", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{
		"Recorded", "Corrected", "Triaged", "Deleted", "Imported",
		"AttachmentAdded", "AttachmentRemoved", "DivisionAcknowledged", "DivisionAcknowledgementRevoked",
	} {
		assert.True(t, h.Handles("Message", typ), typ)
		assert.False(t, h.Handles("Incident", typ), "other stream: %s", typ)
	}

	assert.False(t, h.Handles("Message", "Unknown"))
}

func TestMessageHandler_RecordedCorrectedTriaged(t *testing.T) {
	h := projection.NewMessageHandler()
	msg, inc, div := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, recordedEvent(msg, inc))

	row := h.Get(msg)
	require.NotNil(t, row)
	assert.Equal(t, inc, row.IncidentID)
	assert.Equal(t, 4, row.Number)
	assert.Equal(t, "Road closed", row.Content)
	assert.Equal(t, "Alice", row.Sender)
	assert.Equal(t, "Patrol 1", row.SenderDetail)
	assert.Equal(t, "Bob", row.Receiver)
	assert.Equal(t, "HQ", row.ReceiverDetail)
	assert.Equal(t, "RADIO", row.Medium)
	assert.True(t, tm(0).Equal(row.MsgTime))
	assert.Equal(t, "PENDING", row.Triage)
	assert.Equal(t, "NORMAL", row.Priority)
	assert.Empty(t, row.DivisionIDs)
	assert.Empty(t, row.LinkedResourceIDs)
	require.NotNil(t, row.AuthorSub)
	assert.Equal(t, "sub-alice", *row.AuthorSub)
	assert.Equal(t, tm(1), row.CreatedAt)

	t.Run("a correction only touches the fields it carries", func(t *testing.T) {
		applyAll(t, h, evt("Message", msg, "Corrected", obj{
			"sender": "Carol", "senderDetail": "S2", "receiver": "Dan", "receiverDetail": "R2",
			"medium": "PHONE", "editorSub": "sub-carol",
		}, tm(2)))

		row := h.Get(msg)
		assert.Equal(t, "Carol", row.Sender)
		assert.Equal(t, "S2", row.SenderDetail)
		assert.Equal(t, "Dan", row.Receiver)
		assert.Equal(t, "R2", row.ReceiverDetail)
		assert.Equal(t, "PHONE", row.Medium)
		assert.Equal(t, "Road closed", row.Content)
		require.NotNil(t, row.LastEditorSub)
		assert.Equal(t, "sub-carol", *row.LastEditorSub)
		assert.Equal(t, tm(2), row.UpdatedAt)
	})

	t.Run("triage sets division, resources and priority", func(t *testing.T) {
		res := uuid.New()
		applyAll(t, h, evt("Message", msg, "Triaged", obj{
			"triage": "DONE", "priority": "HIGH", "divisionIds": []string{div.String()},
			"linkedResourceIds": []string{res.String()}, "triagedBy": "sub-t",
		}, tm(3)))

		row := h.Get(msg)
		assert.Equal(t, "DONE", row.Triage)
		assert.Equal(t, "HIGH", row.Priority)
		assert.Equal(t, []uuid.UUID{div}, row.DivisionIDs)
		assert.Equal(t, []uuid.UUID{res}, row.LinkedResourceIDs)
		assert.Equal(t, "sub-t", *row.LastEditorSub)
	})

	t.Run("triage without resources keeps an empty, non-nil list", func(t *testing.T) {
		applyAll(t, h, evt("Message", msg, "Triaged", obj{
			"triage": "DONE", "priority": "HIGH", "divisionIds": []string{div.String()}, "triagedBy": "x",
		}, tm(4)))

		row := h.Get(msg)
		require.NotNil(t, row.LinkedResourceIDs)
		assert.Empty(t, row.LinkedResourceIDs)
	})

	t.Run("a triage asking for more information resets the priority to normal", func(t *testing.T) {
		applyAll(t, h, evt("Message", msg, "Triaged", obj{
			"triage": "MOREINFO", "priority": "HIGH", "triagedBy": "x",
		}, tm(5)))

		row := h.Get(msg)
		assert.Equal(t, "MOREINFO", row.Triage)
		assert.Equal(t, "NORMAL", row.Priority)
	})
}

func TestMessageHandler_Acknowledgements(t *testing.T) {
	h := projection.NewMessageHandler()
	msg, inc := uuid.New(), uuid.New()
	d1, d2 := uuid.New(), uuid.New()

	ack := func(div uuid.UUID, by string, minute int) eventsourcing.Event {
		return evt("Message", msg, "DivisionAcknowledged", obj{"divisionId": div.String(), "by": by}, tm(minute))
	}
	triage := func(minute int, divs ...uuid.UUID) eventsourcing.Event {
		ids := make([]string, len(divs))
		for i, d := range divs {
			ids[i] = d.String()
		}

		return evt(
			"Message",
			msg,
			"Triaged",
			obj{"triage": "DONE", "priority": "NORMAL", "divisionIds": ids},
			tm(minute),
		)
	}

	applyAll(t, h, recordedEvent(msg, inc), triage(2, d1, d2), ack(d1, "a", 3), ack(d2, "b", 4))
	require.Len(t, h.Get(msg).Acknowledgements, 2)

	t.Run("a repeated acknowledgement replaces the earlier one", func(t *testing.T) {
		applyAll(t, h, ack(d1, "c", 5))

		acks := h.Get(msg).Acknowledgements
		require.Len(t, acks, 2)

		byDiv := map[uuid.UUID]projection.AcknowledgementRow{}
		for _, a := range acks {
			byDiv[a.DivisionID] = a
		}

		assert.Equal(t, "c", byDiv[d1].By)
		assert.Equal(t, tm(5), byDiv[d1].At)
		assert.Equal(t, "b", byDiv[d2].By)
	})

	t.Run("revoking removes only that division", func(t *testing.T) {
		applyAll(t, h, evt("Message", msg, "DivisionAcknowledgementRevoked", obj{"divisionId": d2.String()}, tm(6)))

		acks := h.Get(msg).Acknowledgements
		require.Len(t, acks, 1)
		assert.Equal(t, d1, acks[0].DivisionID)
	})

	t.Run("a division dropped by a new triage loses its acknowledgement", func(t *testing.T) {
		applyAll(t, h, ack(d2, "b", 7), triage(8, d2))

		acks := h.Get(msg).Acknowledgements
		require.Len(t, acks, 1)
		assert.Equal(t, d2, acks[0].DivisionID)
	})

	t.Run("a changed time or content invalidates all acknowledgements", func(t *testing.T) {
		tests := []struct {
			name string
			data obj
			keep bool
		}{
			{"changed content", obj{"content": "Different"}, false},
			{"changed time", obj{"time": tm(99)}, false},
			{"same content", obj{"content": "Road closed"}, true},
			{"same time", obj{"time": tm(0)}, true},
			{"other fields", obj{"sender": "Zed"}, true},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				h := projection.NewMessageHandler()
				applyAll(t, h, recordedEvent(msg, inc), triage(2, d1), ack(d1, "a", 3))

				tc.data["editorSub"] = "ed"
				applyAll(t, h, evt("Message", msg, "Corrected", tc.data, tm(10)))

				if tc.keep {
					assert.Len(t, h.Get(msg).Acknowledgements, 1)
				} else {
					assert.Empty(t, h.Get(msg).Acknowledgements)
				}
			})
		}
	})
}

func TestMessageHandler_Attachments(t *testing.T) {
	h := projection.NewMessageHandler()
	msg, other, inc := uuid.New(), uuid.New(), uuid.New()
	a1, a2 := uuid.New(), uuid.New()

	add := func(m, a uuid.UUID, name string, minute int) eventsourcing.Event {
		return evt("Message", m, "AttachmentAdded", obj{
			"attachmentId": a.String(), "filename": name, "contentType": "image/png", "size": 12,
			"checksum": "abc", "storageKey": "k/" + name, "uploaderSub": "sub-u",
		}, tm(minute))
	}

	applyAll(
		t,
		h,
		recordedEvent(msg, inc),
		recordedEvent(other, inc),
		add(msg, a1, "one.png", 2),
		add(msg, a2, "two.png", 3),
	)

	got := h.GetAttachment(a1)
	require.NotNil(t, got)
	assert.Equal(t, "one.png", got.Filename)
	assert.Equal(t, msg, got.MessageID)
	assert.Equal(t, inc, got.IncidentID, "incident is taken from the message row")
	assert.Equal(t, "image/png", got.ContentType)
	assert.EqualValues(t, 12, got.Size)
	assert.Equal(t, "abc", got.Checksum)
	assert.Equal(t, "k/one.png", got.StorageKey)
	assert.Equal(t, "sub-u", got.UploaderSub)
	assert.Equal(t, tm(2), got.CreatedAt)

	t.Run("adding the same attachment twice keeps the first", func(t *testing.T) {
		applyAll(t, h, add(msg, a1, "renamed.png", 9))
		assert.Equal(t, "one.png", h.GetAttachment(a1).Filename)
		assert.Len(t, h.AttachmentsForMessage(msg), 2)
	})

	t.Run("listing is per message", func(t *testing.T) {
		assert.Len(t, h.AttachmentsForMessage(msg), 2)
		assert.Empty(t, h.AttachmentsForMessage(other))
	})

	t.Run("attachment of an unknown message has no incident", func(t *testing.T) {
		orphan, att := uuid.New(), uuid.New()
		applyAll(t, h, add(orphan, att, "o.png", 4))
		assert.Equal(t, uuid.Nil, h.GetAttachment(att).IncidentID)
	})

	t.Run("removing deletes one attachment", func(t *testing.T) {
		applyAll(t, h, evt("Message", msg, "AttachmentRemoved", obj{"attachmentId": a1.String()}, tm(5)))
		assert.Nil(t, h.GetAttachment(a1))
		assert.NotNil(t, h.GetAttachment(a2))
	})

	t.Run("deleting the message drops its attachments", func(t *testing.T) {
		applyAll(t, h, add(other, uuid.New(), "keep.png", 6), evt("Message", msg, "Deleted", obj{}, tm(7)))
		assert.Nil(t, h.GetAttachment(a2))
		assert.Empty(t, h.AttachmentsForMessage(msg))
		assert.Len(t, h.AttachmentsForMessage(other), 1)
	})
}

func TestMessageHandler_DeletedHidesFromIncidentList(t *testing.T) {
	h := projection.NewMessageHandler()
	keep, drop, inc := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, recordedEvent(keep, inc), recordedEvent(drop, inc),
		evt("Message", drop, "Deleted", obj{}, tm(5)))

	rows := h.ForIncident(inc)
	require.Len(t, rows, 1)
	assert.Equal(t, keep, rows[0].ID)
	assert.Empty(t, h.ForIncident(uuid.New()))

	gone := h.Get(drop)
	require.NotNil(t, gone, "a deleted message stays readable by id")
	assert.True(t, gone.Deleted)
	assert.Equal(t, tm(5), gone.UpdatedAt)
}

func TestMessageHandler_ReplayIsIdempotent(t *testing.T) {
	h := projection.NewMessageHandler()
	msg, inc, div, att := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	log := []eventsourcing.Event{
		recordedEvent(msg, inc),
		evt("Message", msg, "Corrected", obj{"content": "Bridge closed", "editorSub": "e"}, tm(2)),
		evt("Message", msg, "Triaged", obj{
			"triage": "DONE", "priority": "HIGH", "divisionIds": []string{div.String()}, "triagedBy": "t",
		}, tm(3)),
		evt("Message", msg, "DivisionAcknowledged", obj{"divisionId": div.String(), "by": "d"}, tm(4)),
		evt("Message", msg, "AttachmentAdded", obj{"attachmentId": att.String(), "filename": "f"}, tm(5)),
	}

	applyAll(t, h, log...)

	want := h.Get(msg)
	wantAtt := h.GetAttachment(att)

	applyAll(t, h, log[1:]...) // Recorded would legitimately reset the row
	assert.Equal(t, want, h.Get(msg))
	assert.Equal(t, wantAtt, h.GetAttachment(att))
}

func TestMessageHandler_EventsForUnknownMessageAreIgnored(t *testing.T) {
	h := projection.NewMessageHandler()
	msg := uuid.New()

	applyAll(t, h,
		evt("Message", msg, "Corrected", obj{"content": "x"}, tm(0)),
		evt("Message", msg, "Triaged", obj{"triage": "DONE"}, tm(0)),
		evt("Message", msg, "DivisionAcknowledged", obj{"divisionId": uuid.NewString()}, tm(0)),
		evt("Message", msg, "DivisionAcknowledgementRevoked", obj{"divisionId": uuid.NewString()}, tm(0)),
		evt("Message", msg, "Deleted", obj{}, tm(0)),
		evt("Message", msg, "Imported", obj{}, tm(0)),
	)

	assert.Nil(t, h.Get(msg))
}

func TestMessageHandler_MalformedPayloads(t *testing.T) {
	msg := uuid.New()

	tests := []struct {
		name  string
		event string
		data  any
	}{
		{"recorded undecodable", "Recorded", "x"},
		{"recorded bad incident id", "Recorded", obj{"incidentId": "nope"}},
		{"corrected undecodable", "Corrected", "x"},
		{"triaged undecodable", "Triaged", "x"},
		{"acknowledged undecodable", "DivisionAcknowledged", "x"},
		{"revoked undecodable", "DivisionAcknowledgementRevoked", "x"},
		{"attachment added undecodable", "AttachmentAdded", "x"},
		{"attachment added bad id", "AttachmentAdded", obj{"attachmentId": "nope"}},
		{"attachment removed undecodable", "AttachmentRemoved", "x"},
		{"attachment removed bad id", "AttachmentRemoved", obj{"attachmentId": "nope"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewMessageHandler()
			require.Error(t, h.Apply(t.Context(), evt("Message", msg, tc.event, tc.data, tm(0))))
			assert.Nil(t, h.Get(msg))
		})
	}
}

func TestMessageHandler_ResetAndSnapshots(t *testing.T) {
	h := projection.NewMessageHandler()
	msg, inc, att := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, recordedEvent(msg, inc),
		evt("Message", msg, "AttachmentAdded", obj{"attachmentId": att.String()}, tm(2)))

	got := h.Get(msg)
	got.Content = "mutated"
	h.GetAttachment(att).Filename = "mutated"
	h.ForIncident(inc)[0].Content = "mutated"
	h.AttachmentsForMessage(msg)[0].Filename = "mutated"

	assert.Equal(t, "Road closed", h.Get(msg).Content, "rows are handed out as copies")
	assert.Empty(t, h.GetAttachment(att).Filename)
	assert.Nil(t, h.Get(uuid.New()))
	assert.Nil(t, h.GetAttachment(uuid.New()))

	require.NoError(t, h.Reset(t.Context()))
	assert.Nil(t, h.Get(msg))
	assert.Nil(t, h.GetAttachment(att))
	assert.Empty(t, h.ForIncident(inc))
}
