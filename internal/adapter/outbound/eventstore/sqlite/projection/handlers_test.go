package projection_test

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// harness wires one handler to a fresh migrated database.
type harness struct {
	t       *testing.T
	db      *sql.DB
	proj    *projection.Projector
	handler projection.Handler
	at      time.Time
}

func newHarness(t *testing.T, h func(*sql.DB) projection.Handler) *harness {
	t.Helper()

	_, write := openTestDB(t)
	handler := h(write)
	store := sqstore.NewEventStore(write, write, sqstore.WallClock{})
	proj := projection.NewProjector(write, write, store, sqstore.NewNotifier(), []projection.Handler{handler})
	require.NoError(t, proj.CatchUp(t.Context()))

	return &harness{
		t: t, db: write, proj: proj, handler: handler,
		at: time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC),
	}
}

// event builds an event that occurred minutes after the harness' base time.
func (h *harness) event(
	streamType, streamID string, version int, eventType string, minutes int, data any,
) eventsourcing.Event {
	h.t.Helper()

	e := newEvent(streamType, streamID, version, eventType, data)
	e.OccurredAt = h.at.Add(time.Duration(minutes) * time.Minute)
	e.RecordedAt = e.OccurredAt
	e.Metadata = map[string]any{"actor": "tester"}

	return e
}

func (h *harness) apply(events ...eventsourcing.Event) {
	h.t.Helper()

	for _, e := range events {
		require.True(
			h.t,
			h.handler.Handles(e.StreamType, e.EventType),
			"handler must handle %s.%s",
			e.StreamType,
			e.EventType,
		)
		require.NoError(h.t, h.proj.ApplySingle(h.t.Context(), h.handler.Name(), e), "%s.%s", e.StreamType, e.EventType)
	}
}

// dump renders every row of a table so two states can be compared.
func (h *harness) dump(table string) []string {
	h.t.Helper()

	rows, err := h.db.QueryContext(
		h.t.Context(),
		"SELECT * FROM "+table+" ORDER BY 1, 2", //nolint:gosec,unqueryvet // table names are test constants
	)
	require.NoError(h.t, err)

	defer func() { _ = rows.Close() }()

	cols, err := rows.Columns()
	require.NoError(h.t, err)

	var out []string

	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))

		for i := range vals {
			ptrs[i] = &vals[i]
		}

		require.NoError(h.t, rows.Scan(ptrs...))

		parts := make([]string, len(vals))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				v = string(b)
			}

			parts[i] = fmt.Sprint(v)
		}

		out = append(out, strings.Join(parts, "|"))
	}

	require.NoError(h.t, rows.Err())

	return out
}

// assertReplayIdempotent applies the events again and asserts the tables do not change.
func (h *harness) assertReplayIdempotent(events []eventsourcing.Event, tables ...string) {
	h.t.Helper()

	before := map[string][]string{}
	for _, tbl := range tables {
		before[tbl] = h.dump(tbl)
	}

	h.apply(events...)

	for _, tbl := range tables {
		assert.Equal(h.t, before[tbl], h.dump(tbl), "replaying the events must not change %s", tbl)
	}
}

// col reads one column of the row with the given id as a string ("<nil>" for NULL).
func (h *harness) col(table, column, id string) string {
	h.t.Helper()

	var v any

	err := h.db.QueryRowContext(h.t.Context(),
		"SELECT "+column+" FROM "+table+" WHERE id = ?", id).Scan(&v)
	require.NoError(h.t, err, "%s.%s of %s", table, column, id)

	if b, ok := v.([]byte); ok {
		v = string(b)
	}

	return fmt.Sprint(v)
}

func (h *harness) count(table, where string, args ...any) int {
	h.t.Helper()

	var n int

	q := "SELECT COUNT(*) FROM " + table
	if where != "" {
		q += " WHERE " + where
	}

	require.NoError(h.t, h.db.QueryRowContext(h.t.Context(), q, args...).Scan(&n))

	return n
}

const (
	idInc1  = "00000000-0000-0000-0000-0000000000b1"
	idInc2  = "00000000-0000-0000-0000-0000000000b2"
	idDiv1  = "00000000-0000-0000-0000-0000000000c1"
	idDiv2  = "00000000-0000-0000-0000-0000000000c2"
	idMsg1  = "00000000-0000-0000-0000-0000000000d1"
	idMsg2  = "00000000-0000-0000-0000-0000000000d2"
	idAtt1  = "00000000-0000-0000-0000-0000000000e1"
	idAtt2  = "00000000-0000-0000-0000-0000000000e2"
	idLayer = "00000000-0000-0000-0000-0000000000f1"
	idFeat1 = "00000000-0000-0000-0000-0000000000f2"
	idFeat2 = "00000000-0000-0000-0000-0000000000f3"
	idSP1   = "00000000-0000-0000-0000-000000000a01"
	idSP2   = "00000000-0000-0000-0000-000000000a02"
	idRes1  = "00000000-0000-0000-0000-000000000a11"
	idRes2  = "00000000-0000-0000-0000-000000000a12"
)

func TestHandlers_NamesVersionsAndHandles(t *testing.T) {
	_, write := openTestDB(t)

	tests := []struct {
		handler projection.Handler
		name    string
		halts   bool
		yes     [][2]string
		no      [][2]string
	}{
		{
			projection.NewIncidentHandler(write), "readmodel.incident", false,
			[][2]string{{"Incident", "Opened"}, {"Incident", "ReviewSummarised"}, {"Incident", "Imported"}},
			[][2]string{{"Incident", "DivisionAdded"}, {"Message", "Opened"}},
		},
		{
			projection.NewIncidentDivisionHandler(write), "readmodel.incident_division", false,
			[][2]string{{"Incident", "DivisionAdded"}, {"Incident", "DivisionKindAssigned"}, {"Incident", "Opened"}},
			[][2]string{{"Incident", "Renamed"}, {"Layer", "DivisionAdded"}},
		},
		{
			projection.NewMessageHandler(write),
			"readmodel.message",
			false,
			[][2]string{
				{"Message", "Recorded"},
				{"Message", "AttachmentAdded"},
				{"Message", "DivisionAcknowledgementRevoked"},
			},
			[][2]string{{"Message", "Unknown"}, {"Incident", "Recorded"}},
		},
		{
			projection.NewLayerFeaturesHandler(write), "readmodel.layer_features", false,
			[][2]string{{"Layer", "Created"}, {"Feature", "Restored"}},
			[][2]string{{"Layer", "Placed"}, {"Feature", "Created"}, {"Message", "Created"}},
		},
		{
			projection.NewAccessHandler(write), "readmodel.access", true,
			[][2]string{{"IncidentAccess", "x"}, {"AccessGroup", "y"}, {"GlobalAccess", "z"}},
			[][2]string{{"Incident", "x"}},
		},
		{
			projection.NewSchadenplatzHandler(write), "readmodel.schadenplatz", false,
			[][2]string{{"Schadenplatz", "Created"}, {"Schadenplatz", "MergedIntoDefault"}},
			[][2]string{{"Schadenplatz", "Deleted"}, {"Resource", "Created"}},
		},
		{
			projection.NewResourceHandler(write), "readmodel.resource", false,
			[][2]string{{"Resource", "Alerted"}, {"Resource", "Renamed"}},
			[][2]string{{"Resource", "Created"}, {"Schadenplatz", "Alerted"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.name, tt.handler.Name())
			assert.Positive(t, tt.handler.Version())

			for _, c := range tt.yes {
				assert.True(t, tt.handler.Handles(c[0], c[1]), "%v", c)
			}

			for _, c := range tt.no {
				assert.False(t, tt.handler.Handles(c[0], c[1]), "%v", c)
			}

			if hh, ok := tt.handler.(interface{ HaltOnError() bool }); ok {
				assert.Equal(t, tt.halts, hh.HaltOnError())
			} else {
				assert.False(t, tt.halts)
			}
		})
	}
}

func TestHandlers_ApplyRequiresTransaction(t *testing.T) {
	_, write := openTestDB(t)

	tests := []struct {
		handler projection.Handler
		event   eventsourcing.Event
	}{
		{projection.NewIncidentHandler(write), newEvent("Incident", idInc1, 1, "Opened", map[string]any{})},
		{projection.NewIncidentDivisionHandler(write), newEvent("Incident", idInc1, 1, "Opened", map[string]any{})},
		{projection.NewMessageHandler(write), newEvent("Message", idMsg1, 1, "Recorded", map[string]any{})},
		{projection.NewLayerFeaturesHandler(write), newEvent("Layer", idLayer, 1, "Created", map[string]any{})},
		{projection.NewAccessHandler(write), newEvent("AccessGroup", idSP1, 1, "GroupCreated", map[string]any{})},
		{projection.NewSchadenplatzHandler(write), newEvent("Schadenplatz", idSP1, 1, "Created", map[string]any{})},
		{projection.NewResourceHandler(write), newEvent("Resource", idRes1, 1, "Alerted", map[string]any{})},
	}

	for _, tt := range tests {
		t.Run(tt.handler.Name(), func(t *testing.T) {
			// A bare context carries no projection transaction.
			require.Error(t, tt.handler.Apply(t.Context(), tt.event))
		})
	}
}

func TestHandlers_RejectMalformedPayloads(t *testing.T) {
	tests := []struct {
		name    string
		handler func(*sql.DB) projection.Handler
		event   func(h *harness) eventsourcing.Event
	}{
		{
			"incident", func(db *sql.DB) projection.Handler { return projection.NewIncidentHandler(db) },
			func(h *harness) eventsourcing.Event {
				return h.event("Incident", idInc1, 1, "Renamed", 0, map[string]any{"name": 42})
			},
		},
		{
			"message", func(db *sql.DB) projection.Handler { return projection.NewMessageHandler(db) },
			func(h *harness) eventsourcing.Event {
				return h.event("Message", idMsg1, 1, "Triaged", 0, map[string]any{"divisionIds": "nope"})
			},
		},
		{
			"schadenplatz", func(db *sql.DB) projection.Handler { return projection.NewSchadenplatzHandler(db) },
			func(h *harness) eventsourcing.Event {
				return h.event("Schadenplatz", idSP1, 1, "Created", 0, map[string]any{"isDefault": "yes"})
			},
		},
		{
			"resource", func(db *sql.DB) projection.Handler { return projection.NewResourceHandler(db) },
			func(h *harness) eventsourcing.Event {
				return h.event("Resource", idRes1, 1, "Alerted", 0, map[string]any{"personnelCount": "many"})
			},
		},
		{
			"access", func(db *sql.DB) projection.Handler { return projection.NewAccessHandler(db) },
			func(h *harness) eventsourcing.Event {
				return h.event("AccessGroup", idSP1, 1, "GroupCreated", 0, map[string]any{"name": 1})
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, tt.handler)
			require.Error(t, h.proj.ApplySingle(t.Context(), h.handler.Name(), tt.event(h)),
				"a payload that does not decode must fail rather than be skipped")
		})
	}
}

func TestIncidentHandler_FullLifecycle(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewIncidentHandler(db) })

	location := map[string]any{"name": "Bern", "coordinates": []float64{7.44, 46.95}}
	events := []eventsourcing.Event{
		h.event("Incident", idInc1, 1, "Opened", 0, map[string]any{"name": "Fire", "location": location}),
		h.event("Incident", idInc2, 1, "Opened", 1, map[string]any{"name": "Child", "location": nil}),
		h.event("Incident", idInc1, 2, "Renamed", 2, map[string]any{"name": "Big fire"}),
		h.event(
			"Incident",
			idInc1,
			3,
			"LocationChanged",
			3,
			map[string]any{"location": map[string]any{"name": "Thun"}},
		),
		h.event("Incident", idInc2, 2, "ParentLinked", 4, map[string]any{"parentId": idInc1}),
		h.event("Incident", idInc1, 4, "Closed", 5, map[string]any{"reason": "MANUAL"}),
		h.event("Incident", idInc1, 5, "ReviewSummarised", 6, map[string]any{"summary": map[string]any{"messages": 3}}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_incident")

	assert.Equal(t, "Big fire", h.col("readmodel_incident", "name", idInc1))
	assert.JSONEq(t, `{"name":"Thun"}`, h.col("readmodel_incident", "location", idInc1))
	assert.Equal(t, "<nil>", h.col("readmodel_incident", "location", idInc2), "a null location is stored as NULL")
	assert.Equal(t, idInc1, h.col("readmodel_incident", "parent_id", idInc2))
	assert.Equal(t, "1", h.col("readmodel_incident", "is_closed", idInc1))
	assert.NotEqual(t, "<nil>", h.col("readmodel_incident", "closed_at", idInc1))
	assert.JSONEq(t, `{"messages":3}`, h.col("readmodel_incident", "review_summary", idInc1))

	updatedAt := h.col("readmodel_incident", "updated_at", idInc1)
	h.apply(
		h.event(
			"Incident",
			idInc1,
			6,
			"ReviewSummarised",
			60,
			map[string]any{"summary": map[string]any{"messages": 4}},
		),
	)
	assert.Equal(t, updatedAt, h.col("readmodel_incident", "updated_at", idInc1),
		"the review summary is no change to the incident and leaves updated_at alone")

	h.apply(h.event("Incident", idInc1, 7, "Reopened", 7, map[string]any{}))
	assert.Equal(t, "0", h.col("readmodel_incident", "is_closed", idInc1))
	assert.Equal(t, "<nil>", h.col("readmodel_incident", "closed_at", idInc1))
	assert.Equal(t, "<nil>", h.col("readmodel_incident", "review_summary", idInc1), "reopening drops the summary")

	h.apply(h.event("Incident", idInc2, 3, "ParentUnlinked", 8, map[string]any{}))
	assert.Equal(t, "<nil>", h.col("readmodel_incident", "parent_id", idInc2))

	h.apply(h.event("Incident", idInc2, 4, "Deleted", 9, map[string]any{}))
	assert.Equal(t, "1", h.col("readmodel_incident", "is_deleted", idInc2))
	assert.NotEqual(t, "<nil>", h.col("readmodel_incident", "deleted_at", idInc2))
}

func TestIncidentHandler_Imported(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewIncidentHandler(db) })

	closed := "2025-12-24T10:00:00Z"
	deleted := "2025-12-25T10:00:00Z"
	updated := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

	events := []eventsourcing.Event{
		h.event("Incident", idInc1, 1, "Imported", 0, map[string]any{
			"name": "Legacy", "location": map[string]any{"name": "Zug"},
			"closedAt": closed, "deletedAt": deleted, "updatedAt": updated,
		}),
		h.event("Incident", idInc2, 1, "Imported", 0, map[string]any{"name": "Open legacy"}),
	}
	h.apply(events...)

	assert.Equal(t, "Legacy", h.col("readmodel_incident", "name", idInc1))
	assert.Equal(t, "1", h.col("readmodel_incident", "is_closed", idInc1))
	assert.Equal(t, "1", h.col("readmodel_incident", "is_deleted", idInc1))
	assert.Equal(t, "2025-12-24T10:00:00.000000000Z", h.col("readmodel_incident", "closed_at", idInc1))
	assert.Equal(t, "2025-12-25T10:00:00.000000000Z", h.col("readmodel_incident", "deleted_at", idInc1))
	assert.Equal(t, "2026-01-02T03:04:05.000000000Z", h.col("readmodel_incident", "updated_at", idInc1))

	assert.Equal(t, "0", h.col("readmodel_incident", "is_closed", idInc2))
	assert.Equal(t, "<nil>", h.col("readmodel_incident", "closed_at", idInc2))

	h.assertReplayIdempotent(events, "readmodel_incident")

	require.Error(t, h.proj.ApplySingle(t.Context(), h.handler.Name(),
		h.event("Incident", idInc1, 2, "Imported", 5, map[string]any{"name": "x", "closedAt": "not a time"})),
		"an unparsable close time must fail rather than be stored")
}

func TestIncidentDivisionHandler_Lifecycle(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewIncidentDivisionHandler(db) })

	events := []eventsourcing.Event{
		h.event("Incident", idInc1, 1, "Opened", 0, map[string]any{
			"name": "x",
			"divisions": []map[string]any{
				{"id": idDiv1, "name": "Lage", "description": "situation"},
			},
		}),
		h.event("Incident", idInc1, 2, "DivisionAdded", 1, map[string]any{
			"division": map[string]any{"id": idDiv2, "name": "Log", "description": "logistics", "kind": "NONE"},
		}),
		h.event("Incident", idInc1, 3, "DivisionKindAssigned", 2, map[string]any{"id": idDiv2, "kind": "MESSAGE_MAP"}),
		h.event("Incident", idInc1, 4, "DivisionRenamed", 3, map[string]any{"id": idDiv1, "name": "Lage 2"}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_incident_division")

	assert.Equal(t, "Lage 2", h.col("readmodel_incident_division", "name", idDiv1))
	assert.Equal(t, "situation", h.col("readmodel_incident_division", "description", idDiv1),
		"a rename without description keeps the description")
	assert.Equal(t, "Log", h.col("readmodel_incident_division", "name", idDiv2))
	assert.Equal(t, "MESSAGE_MAP", h.col("readmodel_incident_division", "kind", idDiv2))
	assert.Equal(t, idInc1, h.col("readmodel_incident_division", "incident_id", idDiv2))

	h.apply(h.event("Incident", idInc1, 5, "DivisionRenamed", 4,
		map[string]any{"id": idDiv1, "name": "Lage 3", "description": "new text"}))
	assert.Equal(t, "Lage 3", h.col("readmodel_incident_division", "name", idDiv1))
	assert.Equal(t, "new text", h.col("readmodel_incident_division", "description", idDiv1))

	assert.Equal(t, "<nil>", h.col("readmodel_incident_division", "removed_at", idDiv2))
	h.apply(h.event("Incident", idInc1, 6, "DivisionRemoved", 5, map[string]any{"id": idDiv2}))
	assert.NotEqual(t, "<nil>", h.col("readmodel_incident_division", "removed_at", idDiv2))

	imported := h.event("Incident", idInc2, 1, "Imported", 6, map[string]any{
		"name": "old", "divisions": []map[string]any{{"id": "00000000-0000-0000-0000-0000000000c3", "name": "Imp"}},
	})
	h.apply(imported)
	assert.Equal(t, 1, h.count("readmodel_incident_division", "incident_id = ?", idInc2))
	h.assertReplayIdempotent([]eventsourcing.Event{imported}, "readmodel_incident_division")
}

func TestMessageHandler_LifecycleAndAcknowledgements(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewMessageHandler(db) })

	msgTime := "2026-03-01T09:00:00Z"
	recorded := h.event("Message", idMsg1, 1, "Recorded", 0, map[string]any{
		"incidentId": idInc1, "number": 1, "content": "Hello", "sender": "A", "senderDetail": "sd",
		"receiver": "B", "receiverDetail": "rd", "medium": "radio", "time": msgTime, "authorSub": "sub|a",
	})
	h.apply(recorded)

	assert.Equal(t, "Hello", h.col("readmodel_message", "content", idMsg1))
	assert.Equal(t, "PENDING", h.col("readmodel_message", "triage", idMsg1))
	assert.Equal(t, "NORMAL", h.col("readmodel_message", "priority", idMsg1))
	assert.Equal(t, "sub|a", h.col("readmodel_message", "author_sub", idMsg1))
	assert.Equal(t, "2026-03-01T09:00:00.000000000Z", h.col("readmodel_message", "msg_time", idMsg1))

	// Recording again (replay) must not reset a message that has moved on.
	h.apply(h.event("Message", idMsg1, 2, "Triaged", 1, map[string]any{
		"triage": "DONE", "priority": "HIGH", "divisionIds": []string{idDiv1, idDiv2},
		"linkedResourceIds": []string{idRes1}, "triagedBy": "sub|t",
	}))
	h.apply(recorded)
	assert.Equal(t, "DONE", h.col("readmodel_message", "triage", idMsg1))
	assert.Equal(t, "HIGH", h.col("readmodel_message", "priority", idMsg1))
	assert.JSONEq(t, `["`+idDiv1+`","`+idDiv2+`"]`, h.col("readmodel_message", "division_ids", idMsg1))
	assert.JSONEq(t, `["`+idRes1+`"]`, h.col("readmodel_message", "linked_resource_ids", idMsg1))
	assert.Equal(t, "sub|t", h.col("readmodel_message", "last_editor_sub", idMsg1))

	ack := func(version int, div string) {
		h.apply(h.event("Message", idMsg1, version, "DivisionAcknowledged", 10+version, map[string]any{
			"divisionId": div, "by": "sub|ack",
		}))
	}

	acknowledged := func() []string {
		var raw string
		require.NoError(t, h.db.QueryRowContext(t.Context(),
			`SELECT acknowledgements FROM readmodel_message WHERE id = ?`, idMsg1).Scan(&raw))

		var entries []struct {
			DivisionID string `json:"divisionId"`
			By         string `json:"by"`
		}
		require.NoError(t, json.Unmarshal([]byte(raw), &entries))

		var ids []string

		for _, e := range entries {
			assert.Equal(t, "sub|ack", e.By)
			ids = append(ids, e.DivisionID)
		}

		return ids
	}

	ack(3, idDiv1)
	ack(4, idDiv2)
	ack(5, idDiv1) // acknowledging twice keeps one entry per division
	assert.ElementsMatch(t, []string{idDiv1, idDiv2}, acknowledged())

	h.apply(h.event("Message", idMsg1, 6, "DivisionAcknowledgementRevoked", 20, map[string]any{"divisionId": idDiv2}))
	assert.Equal(t, []string{idDiv1}, acknowledged())

	// Triage without a division drops that division's acknowledgement.
	h.apply(h.event("Message", idMsg1, 7, "Triaged", 21, map[string]any{
		"triage": "DONE", "priority": "HIGH", "divisionIds": []string{idDiv2}, "triagedBy": "sub|t",
	}))
	assert.Empty(t, acknowledged())

	ack(8, idDiv2)
	assert.Equal(t, []string{idDiv2}, acknowledged())

	// Correcting something else keeps the acknowledgements; content or time clears them.
	h.apply(h.event("Message", idMsg1, 9, "Corrected", 22, map[string]any{"sender": "Z", "editorSub": "sub|e"}))
	assert.Equal(t, "Z", h.col("readmodel_message", "sender", idMsg1))
	assert.Equal(t, "Hello", h.col("readmodel_message", "content", idMsg1), "unset fields keep their value")
	assert.Equal(t, "sub|e", h.col("readmodel_message", "last_editor_sub", idMsg1))
	assert.Equal(t, []string{idDiv2}, acknowledged())

	h.apply(h.event("Message", idMsg1, 10, "Corrected", 23, map[string]any{"content": "Hello", "editorSub": "sub|e"}))
	assert.Equal(t, []string{idDiv2}, acknowledged(), "the same content is not a change")

	h.apply(h.event("Message", idMsg1, 11, "Corrected", 24, map[string]any{
		"content": "Changed", "receiver": "R", "receiverDetail": "RD", "senderDetail": "SD", "medium": "phone",
		"editorSub": "sub|e",
	}))
	assert.Equal(t, "Changed", h.col("readmodel_message", "content", idMsg1))
	assert.Equal(t, "R", h.col("readmodel_message", "receiver", idMsg1))
	assert.Equal(t, "RD", h.col("readmodel_message", "receiver_detail", idMsg1))
	assert.Equal(t, "SD", h.col("readmodel_message", "sender_detail", idMsg1))
	assert.Equal(t, "phone", h.col("readmodel_message", "medium", idMsg1))
	assert.Empty(t, acknowledged(), "changed content invalidates the acknowledgements")

	ack(12, idDiv2)
	h.apply(h.event("Message", idMsg1, 13, "Corrected", 25, map[string]any{
		"time": "2026-03-01T08:30:00Z", "editorSub": "sub|e",
	}))
	assert.Equal(t, "2026-03-01T08:30:00.000000000Z", h.col("readmodel_message", "msg_time", idMsg1))
	assert.Empty(t, acknowledged(), "a changed time invalidates the acknowledgements")

	h.apply(h.event("Message", idMsg1, 14, "Triaged", 26, map[string]any{"triage": "MOREINFO", "priority": "HIGH"}))
	assert.Equal(t, "NORMAL", h.col("readmodel_message", "priority", idMsg1), "needing more info resets the priority")
	assert.JSONEq(t, `[]`, h.col("readmodel_message", "division_ids", idMsg1))
}

func TestMessageHandler_CorrectedWithBadTimeFails(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewMessageHandler(db) })

	require.Error(t, h.proj.ApplySingle(t.Context(), h.handler.Name(),
		h.event("Message", idMsg1, 1, "Corrected", 0, map[string]any{"time": "yesterday", "editorSub": "x"})))
}

func TestMessageHandler_AttachmentsAndDelete(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewMessageHandler(db) })

	h.apply(h.event("Message", idMsg1, 1, "Recorded", 0, map[string]any{
		"incidentId": idInc1, "number": 1, "content": "c", "time": "2026-03-01T09:00:00Z",
	}))

	add := func(version int, id, name string) eventsourcing.Event {
		return h.event("Message", idMsg1, version, "AttachmentAdded", version, map[string]any{
			"attachmentId": id, "filename": name, "contentType": "image/png", "size": 12,
			"checksum": "abc", "storageKey": "incidents/" + idInc1 + "/" + id, "uploaderSub": "sub|u",
		})
	}

	events := []eventsourcing.Event{add(2, idAtt1, "a.png"), add(3, idAtt2, "b.png")}
	h.apply(events...)
	assert.Equal(t, 2, h.count("readmodel_message_attachment", "message_id = ?", idMsg1))
	assert.Equal(t, idInc1, h.col("readmodel_message_attachment", "incident_id", idAtt1),
		"the attachment takes its incident from the message")
	assert.Equal(t, "a.png", h.col("readmodel_message_attachment", "filename", idAtt1))

	h.assertReplayIdempotent(events, "readmodel_message_attachment")

	h.apply(h.event("Message", idMsg1, 4, "AttachmentRemoved", 4, map[string]any{"attachmentId": idAtt1}))
	assert.Equal(t, 1, h.count("readmodel_message_attachment", ""))

	h.apply(h.event("Message", idMsg1, 5, "Deleted", 5, map[string]any{}))
	assert.Equal(t, 0, h.count("readmodel_message", ""))
	assert.Equal(t, 0, h.count("readmodel_message_attachment", ""))

	// An attachment for a message that does not exist cannot find its incident.
	require.Error(t, h.proj.ApplySingle(t.Context(), h.handler.Name(), add(6, idAtt1, "x.png")))
}

func TestMessageHandler_Imported(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewMessageHandler(db) })

	imported := h.event("Message", idMsg1, 1, "Imported", 0, map[string]any{
		"incidentId": idInc1, "number": 4, "content": "legacy", "sender": "S", "receiver": "R", "medium": "radio",
		"time": "2025-01-01T10:00:00Z", "triage": "MOREINFO", "priority": "HIGH",
		"divisionIds": []string{idDiv1}, "linkedResourceIds": []string{idRes1},
		"authorSub": "sub|a", "lastEditorSub": "sub|e",
		"recordedAt": "2025-01-01T10:05:00Z", "lastUpdatedAt": "2025-01-02T10:05:00Z",
	})
	bare := h.event("Message", idMsg2, 1, "Imported", 1, map[string]any{
		"incidentId": idInc1, "number": 5, "content": "bare", "time": "2025-01-01T11:00:00Z",
		"triage": "DONE", "priority": "LOW",
	})
	h.apply(imported, bare)

	assert.Equal(t, "legacy", h.col("readmodel_message", "content", idMsg1))
	assert.Equal(t, "NORMAL", h.col("readmodel_message", "priority", idMsg1), "MORE_INFO forces normal priority")
	assert.JSONEq(t, `["`+idDiv1+`"]`, h.col("readmodel_message", "division_ids", idMsg1))
	assert.JSONEq(t, `["`+idRes1+`"]`, h.col("readmodel_message", "linked_resource_ids", idMsg1))
	assert.Equal(t, "2025-01-01T10:05:00.000000000Z", h.col("readmodel_message", "created_at", idMsg1))
	assert.Equal(t, "2025-01-02T10:05:00.000000000Z", h.col("readmodel_message", "updated_at", idMsg1))

	assert.Equal(t, "LOW", h.col("readmodel_message", "priority", idMsg2))
	assert.JSONEq(t, `[]`, h.col("readmodel_message", "division_ids", idMsg2))
	assert.Equal(t, "2026-03-01T10:01:00.000000000Z", h.col("readmodel_message", "created_at", idMsg2),
		"without a recorded time the event time is used")
	assert.Equal(t, h.col("readmodel_message", "created_at", idMsg2), h.col("readmodel_message", "updated_at", idMsg2))

	h.assertReplayIdempotent([]eventsourcing.Event{imported, bare}, "readmodel_message")
}

func TestSchadenplatzHandler_Lifecycle(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewSchadenplatzHandler(db) })

	events := []eventsourcing.Event{
		h.event("Schadenplatz", idSP1, 1, "Created", 0, map[string]any{
			"incidentId": idInc1, "name": "Default", "isDefault": true,
		}),
		h.event("Schadenplatz", idSP2, 1, "Created", 1, map[string]any{
			"incidentId": idInc1, "name": "Second", "isDefault": false,
		}),
		h.event("Schadenplatz", idSP2, 2, "Renamed", 2, map[string]any{"name": "Renamed"}),
		h.event("Schadenplatz", idSP2, 3, "GeometrySet", 3, map[string]any{
			"geoJson": []byte(`{"type":"Point","coordinates":[1,2]}`),
		}),
		h.event("Schadenplatz", idSP2, 4, "MergedIntoDefault", 4, map[string]any{"defaultSchadenplatzId": idSP1}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_schadenplatz")

	assert.Equal(t, "1", h.col("readmodel_schadenplatz", "is_default", idSP1))
	assert.Equal(t, "Renamed", h.col("readmodel_schadenplatz", "name", idSP2))
	assert.JSONEq(t, `{"type":"Point","coordinates":[1,2]}`, h.col("readmodel_schadenplatz", "geojson", idSP2))
	assert.Equal(t, "1", h.col("readmodel_schadenplatz", "is_merged", idSP2))
	assert.Equal(t, idSP1, h.col("readmodel_schadenplatz", "merged_into", idSP2))
	assert.Equal(t, "<nil>", h.col("readmodel_schadenplatz", "geojson", idSP1))

	// An empty geometry clears the stored one.
	h.apply(h.event("Schadenplatz", idSP2, 5, "GeometrySet", 5, map[string]any{}))
	assert.Equal(t, "<nil>", h.col("readmodel_schadenplatz", "geojson", idSP2))
}

func TestSchadenplatzHandler_CasualtiesAreNetDeltasPerMessage(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewSchadenplatzHandler(db) })

	h.apply(h.event("Schadenplatz", idSP1, 1, "Created", 0, map[string]any{
		"incidentId": idInc1, "name": "SP", "isDefault": true,
	}))

	record := func(version int, msg string, v, tote, verl, obd, ein int) eventsourcing.Event {
		return h.event("Schadenplatz", idSP1, version, "CasualtiesRecorded", version, map[string]any{
			"sourceMessageId": msg,
			"deltas": map[string]any{
				"vermisste": v, "tote": tote, "verletzte": verl, "obdachlose": obd, "eingeschlossene": ein,
			},
		})
	}

	totals := func() string {
		return strings.Join([]string{
			h.col("readmodel_schadenplatz", "vermisste", idSP1),
			h.col("readmodel_schadenplatz", "tote", idSP1),
			h.col("readmodel_schadenplatz", "verletzte", idSP1),
			h.col("readmodel_schadenplatz", "obdachlose", idSP1),
			h.col("readmodel_schadenplatz", "eingeschlossene", idSP1),
		}, ",")
	}

	first := record(2, idMsg1, 1, 2, 3, 4, 5)
	h.apply(first)
	assert.Equal(t, "1,2,3,4,5", totals())

	h.apply(record(3, idMsg2, 1, 1, 1, 1, 1))
	assert.Equal(t, "2,3,4,5,6", totals(), "a second message adds to the totals")

	// Correcting the first message replaces its share instead of adding to it.
	h.apply(record(4, idMsg1, 0, 2, 0, 0, 9))
	assert.Equal(t, "1,3,1,1,10", totals())

	// Replaying a record changes nothing.
	h.apply(record(4, idMsg1, 0, 2, 0, 0, 9))
	assert.Equal(t, "1,3,1,1,10", totals())
	assert.Equal(t, 2, h.count("readmodel_message_casualties", ""))
}

func TestResourceHandler_AllEvents(t *testing.T) {
	h := newHarness(t, func(db *sql.DB) projection.Handler { return projection.NewResourceHandler(db) })

	events := []eventsourcing.Event{
		h.event("Resource", idRes1, 1, "Alerted", 0, map[string]any{
			"incidentId": idInc1, "schadenplatzId": idSP1, "formation": "FW", "name": "Alpha", "size": "GRUPPE",
			"personnelCount": 9, "hauptaufgabe": "Loeschen",
			"contact":         map[string]any{"medium": "radio", "detail": "Kanal 1"},
			"homeLocation":    map[string]any{"name": "Depot", "coordinates": []float64{47.1, 8.2}},
			"sourceMessageId": idMsg1,
		}),
		h.event("Resource", idRes2, 1, "Alerted", 1, map[string]any{
			"incidentId": idInc1, "schadenplatzId": idSP1, "formation": "POL", "name": "Beta", "size": "TRUPP",
			"personnelCount": 2, "hauptaufgabe": "",
		}),
	}
	h.apply(events...)
	h.assertReplayIdempotent(events, "readmodel_resource")

	assert.Equal(t, "AUFGEBOTEN", h.col("readmodel_resource", "status", idRes1))
	assert.Equal(t, "radio", h.col("readmodel_resource", "contact_medium", idRes1))
	assert.Equal(t, "Depot", h.col("readmodel_resource", "home_location_name", idRes1))
	assert.Equal(t, "47.1", h.col("readmodel_resource", "home_location_lat", idRes1))
	assert.Equal(t, idMsg1, h.col("readmodel_resource", "source_message_id", idRes1))
	assert.Equal(t, "<nil>", h.col("readmodel_resource", "contact_medium", idRes2))
	assert.Equal(t, "<nil>", h.col("readmodel_resource", "home_location_name", idRes2))

	h.apply(h.event("Resource", idRes1, 2, "MarkedReady", 10, map[string]any{}))
	assert.Equal(t, "EINSATZBEREIT", h.col("readmodel_resource", "status", idRes1))
	assert.NotEqual(t, "<nil>", h.col("readmodel_resource", "ready_at", idRes1))
	assert.NotEqual(t, "<nil>", h.col("readmodel_resource", "einsatz_beginn", idRes1))

	deployed := h.event("Resource", idRes1, 3, "Deployed", 20, map[string]any{
		"deploymentLocation": map[string]any{"label": "Ost", "lat": 47.5, "lng": 8.5},
	})
	h.apply(deployed)
	h.apply(deployed) // a replayed deployment must not add a second period
	assert.Equal(t, "EINGESETZT", h.col("readmodel_resource", "status", idRes1))
	assert.Equal(t, 1, jsonArrayLen(t, h.col("readmodel_resource", "deployment_history", idRes1)))

	h.apply(h.event("Resource", idRes2, 2, "Deployed", 21, map[string]any{}))
	assert.Equal(t, 1, jsonArrayLen(t, h.col("readmodel_resource", "deployment_history", idRes2)),
		"a deployment without a location is still a period")

	h.apply(h.event("Resource", idRes1, 4, "DeploymentLocationUpdated", 22, map[string]any{
		"location": map[string]any{"lat": 1.5, "lng": 2.5, "label": "West"},
	}))
	assert.Equal(t, "West", h.col("readmodel_resource", "deployment_label", idRes1))
	assert.Equal(t, "1.5", h.col("readmodel_resource", "deployment_lat", idRes1))

	h.apply(h.event("Resource", idRes1, 5, "DeploymentLocationUpdated", 23, map[string]any{"location": nil}))
	assert.Equal(t, "<nil>", h.col("readmodel_resource", "deployment_label", idRes1))

	h.apply(
		h.event("Resource", idRes1, 6, "HauptaufgabeChanged", 24, map[string]any{"hauptaufgabe": "Rettung"}),
		h.event("Resource", idRes1, 7, "ContactUpdated", 25, map[string]any{
			"contact": map[string]any{"medium": "phone", "detail": "079"},
		}),
		h.event("Resource", idRes1, 8, "Renamed", 26, map[string]any{"name": "Alpha 2"}),
		h.event("Resource", idRes1, 9, "ReassignedToSchadenplatz", 27, map[string]any{"schadenplatzId": idSP2}),
		h.event("Resource", idRes1, 10, "SuccessionLinked", 28, map[string]any{"predecessorId": idRes2}),
	)
	assert.Equal(t, "Rettung", h.col("readmodel_resource", "hauptaufgabe", idRes1))
	assert.Equal(t, "phone", h.col("readmodel_resource", "contact_medium", idRes1))
	assert.Equal(t, "079", h.col("readmodel_resource", "contact_detail", idRes1))
	assert.Equal(t, "Alpha 2", h.col("readmodel_resource", "name", idRes1))
	assert.Equal(t, idSP2, h.col("readmodel_resource", "schadenplatz_id", idRes1))
	assert.Equal(t, idRes2, h.col("readmodel_resource", "predecessor_id", idRes1))

	h.apply(h.event("Resource", idRes1, 11, "PersonnelCountUpdated", 29, map[string]any{"count": 12, "size": "ZUG"}))
	assert.Equal(t, "12", h.col("readmodel_resource", "personnel_count", idRes1))
	assert.Equal(t, "ZUG", h.col("readmodel_resource", "size", idRes1))

	h.apply(h.event("Resource", idRes1, 12, "PersonnelCountUpdated", 30, map[string]any{"count": 13}))
	assert.Equal(t, "13", h.col("readmodel_resource", "personnel_count", idRes1))
	assert.Equal(t, "ZUG", h.col("readmodel_resource", "size", idRes1), "an empty size keeps the size")

	h.apply(h.event("Resource", idRes1, 13, "StoodDown", 40, map[string]any{}))
	assert.Equal(t, "EINSATZBEREIT", h.col("readmodel_resource", "status", idRes1))
	assert.Empty(t, h.col("readmodel_resource", "hauptaufgabe", idRes1), "standing down clears the task")
	assert.NotEqual(t, "<nil>", h.col("readmodel_resource", "stood_down_at", idRes1))
	assert.NotContains(t, h.col("readmodel_resource", "deployment_history", idRes1), `"endedAt":null`,
		"standing down closes the open period")

	// Standing down a resource that was never deployed leaves the history alone.
	h.apply(h.event("Resource", idRes2, 3, "StoodDown", 41, map[string]any{}))

	h.apply(h.event("Resource", idRes1, 14, "Relieved", 50, map[string]any{"successorId": idRes2}))
	assert.Equal(t, "ABGELOEST", h.col("readmodel_resource", "status", idRes1))
	assert.Equal(t, idRes2, h.col("readmodel_resource", "successor_id", idRes1))
	assert.NotEqual(t, "<nil>", h.col("readmodel_resource", "einsatz_ende", idRes1))

	h.apply(h.event("Resource", idRes1, 15, "Reactivated", 60, map[string]any{"schadenplatzId": idSP1}))
	assert.Equal(t, "AUFGEBOTEN", h.col("readmodel_resource", "status", idRes1))
	assert.Equal(t, idSP1, h.col("readmodel_resource", "schadenplatz_id", idRes1))
	assert.Equal(t, "<nil>", h.col("readmodel_resource", "successor_id", idRes1))
	assert.Equal(t, 1, jsonArrayLen(t, h.col("readmodel_resource", "deployment_history", idRes1)), "history is kept")
}

func jsonArrayLen(t *testing.T, raw string) int {
	t.Helper()

	var a []any
	require.NoError(t, json.Unmarshal([]byte(raw), &a))

	return len(a)
}
