package projection_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func TestIncidentHandler_Metadata(t *testing.T) {
	h := projection.NewIncidentHandler()

	assert.Equal(t, "readmodel.incident", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{
		"Opened", "Renamed", "LocationChanged", "ParentLinked", "ParentUnlinked",
		"Closed", "Reopened", "Deleted", "Imported", "ReviewSummarised",
	} {
		assert.True(t, h.Handles("Incident", typ), typ)
		assert.False(t, h.Handles("Message", typ), "other stream: %s", typ)
	}

	assert.False(t, h.Handles("Incident", "DivisionAdded"))
}

func TestIncidentHandler_Lifecycle(t *testing.T) {
	h := projection.NewIncidentHandler()
	id, parent := uuid.New(), uuid.New()

	steps := []struct {
		name  string
		event eventsourcing.Event
		check func(t *testing.T, row *projection.IncidentRow)
	}{
		{
			"opened",
			evt("Incident", id, "Opened", obj{"name": "Flood", "location": "Bern"}, tm(0)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.Equal(t, "Flood", row.Name)
				assert.JSONEq(t, `"Bern"`, string(row.Location))
				assert.Equal(t, tm(0), row.CreatedAt)
				assert.False(t, row.IsClosed)
			},
		},
		{
			"renamed",
			evt("Incident", id, "Renamed", obj{"name": "Flood 2"}, tm(1)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.Equal(t, "Flood 2", row.Name)
				assert.Equal(t, tm(1), row.UpdatedAt)
			},
		},
		{
			"location changed",
			evt("Incident", id, "LocationChanged", obj{"location": "Thun"}, tm(2)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.JSONEq(t, `"Thun"`, string(row.Location))
				assert.Equal(t, tm(2), row.UpdatedAt)
			},
		},
		{
			"parent linked",
			evt("Incident", id, "ParentLinked", obj{"parentId": parent.String()}, tm(3)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				require.NotNil(t, row.ParentID)
				assert.Equal(t, parent, *row.ParentID)
			},
		},
		{
			"parent unlinked",
			evt("Incident", id, "ParentUnlinked", obj{}, tm(4)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.Nil(t, row.ParentID)
				assert.Equal(t, tm(4), row.UpdatedAt)
			},
		},
		{
			"closed",
			evt("Incident", id, "Closed", obj{}, tm(5)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.True(t, row.IsClosed)
				require.NotNil(t, row.ClosedAt)
				assert.Equal(t, tm(5), *row.ClosedAt)
			},
		},
		{
			"review summarised",
			evt("Incident", id, "ReviewSummarised", obj{"summary": obj{"version": 2, "messages": 7}}, tm(6)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				require.NotNil(t, row.ReviewSummary)
				assert.Equal(t, 7, row.ReviewSummary.Messages)
				assert.Equal(t, 2, row.ReviewSummary.Version)
				assert.True(t, row.IsClosed, "summarising must not reopen")
			},
		},
		{
			"reopened",
			evt("Incident", id, "Reopened", obj{}, tm(7)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.False(t, row.IsClosed)
				assert.Nil(t, row.ClosedAt)
				assert.Nil(t, row.ReviewSummary, "a reopened incident drops its review")
			},
		},
		{
			"deleted",
			evt("Incident", id, "Deleted", obj{}, tm(8)),
			func(t *testing.T, row *projection.IncidentRow) {
				t.Helper()
				assert.True(t, row.IsDeleted)
				require.NotNil(t, row.DeletedAt)
				assert.Equal(t, tm(8), *row.DeletedAt)
			},
		},
	}

	var all []eventsourcing.Event

	for _, step := range steps {
		all = append(all, step.event)

		t.Run(step.name, func(t *testing.T) {
			applyAll(t, h, step.event)

			row := h.Get(id)
			require.NotNil(t, row)
			step.check(t, row)
		})
	}

	// Replaying the whole log over the finished projection must give the same row.
	want := h.Get(id)

	applyAll(t, h, all...)
	assert.Equal(t, want, h.Get(id))
}

func TestIncidentHandler_Imported(t *testing.T) {
	h := projection.NewIncidentHandler()
	open, closed := uuid.New(), uuid.New()

	applyAll(t, h,
		evt("Incident", open, "Imported", obj{"name": "Old", "location": "Zug"}, tm(0)),
		evt("Incident", closed, "Imported", obj{
			"name": "Done", "closedAt": tm(3), "deletedAt": tm(4),
		}, tm(1)),
	)

	row := h.Get(open)
	require.NotNil(t, row)
	assert.Equal(t, "Old", row.Name)
	assert.False(t, row.IsClosed)
	assert.False(t, row.IsDeleted)

	row = h.Get(closed)
	require.NotNil(t, row)
	assert.True(t, row.IsClosed)
	assert.True(t, row.IsDeleted)
	require.NotNil(t, row.ClosedAt)
	assert.True(t, tm(3).Equal(*row.ClosedAt))
	require.NotNil(t, row.DeletedAt)
	assert.True(t, tm(4).Equal(*row.DeletedAt))
}

func TestIncidentHandler_EventsForUnknownIncidentAreIgnored(t *testing.T) {
	h := projection.NewIncidentHandler()
	id := uuid.New()

	applyAll(t, h,
		evt("Incident", id, "Renamed", obj{"name": "x"}, tm(0)),
		evt("Incident", id, "LocationChanged", obj{"location": "x"}, tm(0)),
		evt("Incident", id, "ParentLinked", obj{"parentId": uuid.NewString()}, tm(0)),
		evt("Incident", id, "ParentUnlinked", obj{}, tm(0)),
		evt("Incident", id, "Closed", obj{}, tm(0)),
		evt("Incident", id, "ReviewSummarised", obj{"summary": obj{}}, tm(0)),
		evt("Incident", id, "Reopened", obj{}, tm(0)),
		evt("Incident", id, "Deleted", obj{}, tm(0)),
		evt("Incident", id, "Unknown", obj{}, tm(0)),
	)

	assert.Nil(t, h.Get(id))
	assert.Empty(t, h.All())
}

func TestIncidentHandler_MalformedPayloads(t *testing.T) {
	id := uuid.New()

	for _, typ := range []string{"Opened", "Imported", "Renamed", "LocationChanged", "ParentLinked", "ReviewSummarised"} {
		t.Run("undecodable "+typ, func(t *testing.T) {
			h := projection.NewIncidentHandler()
			require.Error(t, h.Apply(t.Context(), evt("Incident", id, typ, "not an object", tm(0))))
		})
	}

	t.Run("parent id is not a uuid", func(t *testing.T) {
		h := projection.NewIncidentHandler()
		applyAll(t, h, evt("Incident", id, "Opened", obj{"name": "x"}, tm(0)))
		require.Error(t, h.Apply(t.Context(), evt("Incident", id, "ParentLinked", obj{"parentId": "nope"}, tm(1))))
		assert.Nil(t, h.Get(id).ParentID)
	})
}

func TestIncidentHandler_AllGetResetAreSnapshots(t *testing.T) {
	h := projection.NewIncidentHandler()
	a, b := uuid.New(), uuid.New()

	applyAll(t, h,
		evt("Incident", a, "Opened", obj{"name": "A"}, tm(0)),
		evt("Incident", b, "Opened", obj{"name": "B"}, tm(0)),
	)

	rows := h.All()
	require.Len(t, rows, 2)

	rows[0].Name = "mutated"
	rows[1].Name = "mutated"

	assert.Equal(t, "A", h.Get(a).Name, "All must return copies")

	got := h.Get(a)
	got.Name = "mutated"

	assert.Equal(t, "A", h.Get(a).Name, "Get must return a copy")
	assert.Nil(t, h.Get(uuid.New()))

	require.NoError(t, h.Reset(t.Context()))
	assert.Empty(t, h.All())
	assert.Nil(t, h.Get(a))
}

func TestIncidentDivisionHandler_Metadata(t *testing.T) {
	h := projection.NewIncidentDivisionHandler()

	assert.Equal(t, "readmodel.incident_division", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{
		"Opened", "DivisionAdded", "DivisionKindAssigned", "DivisionRenamed", "DivisionRemoved", "Imported",
	} {
		assert.True(t, h.Handles("Incident", typ), typ)
		assert.False(t, h.Handles("Layer", typ), "other stream: %s", typ)
	}

	assert.False(t, h.Handles("Incident", "Closed"))
}

func TestIncidentDivisionHandler_Lifecycle(t *testing.T) {
	h := projection.NewIncidentDivisionHandler()
	inc, d1, d2, d3 := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	events := []eventsourcing.Event{
		evt("Incident", inc, "Opened", obj{"divisions": []obj{
			{"id": d1.String(), "name": "Fire", "description": "Feuerwehr"},
			{"id": "not-a-uuid", "name": "skipped"},
		}}, tm(0)),
		evt("Incident", inc, "DivisionAdded", obj{"division": obj{
			"id": d2.String(), "name": "Police", "description": "Pol", "kind": "POLICE",
		}}, tm(1)),
		evt("Incident", inc, "DivisionAdded", obj{"division": obj{"id": d3.String(), "name": "Tmp"}}, tm(1)),
		evt("Incident", inc, "DivisionKindAssigned", obj{"id": d1.String(), "kind": "FIRE"}, tm(2)),
		evt("Incident", inc, "DivisionRenamed", obj{"id": d1.String(), "name": "Fire brigade"}, tm(3)),
		evt("Incident", inc, "DivisionRenamed", obj{"id": d2.String(), "name": "Cops", "description": "new"}, tm(3)),
		evt("Incident", inc, "DivisionRemoved", obj{"id": d3.String()}, tm(4)),
	}

	applyAll(t, h, events...)
	// Replay: the same log applied again must not change the outcome.
	applyAll(t, h, events...)

	rows := h.ForIncident(inc)
	require.Len(t, rows, 2, "the removed division is not listed")

	byID := map[uuid.UUID]*projection.DivisionRow{}
	for _, r := range rows {
		byID[r.ID] = r
	}

	require.Contains(t, byID, d1)
	assert.Equal(t, "Fire brigade", byID[d1].Name)
	assert.Equal(t, "Feuerwehr", byID[d1].Description, "a rename without description keeps it")
	assert.Equal(t, "FIRE", byID[d1].Kind)
	assert.Equal(t, inc, byID[d1].IncidentID)

	require.Contains(t, byID, d2)
	assert.Equal(t, "Cops", byID[d2].Name)
	assert.Equal(t, "new", byID[d2].Description)
	assert.Equal(t, "POLICE", byID[d2].Kind)

	assert.Empty(t, h.ForIncident(uuid.New()))
}

func TestIncidentDivisionHandler_ImportedSeedsDivisions(t *testing.T) {
	h := projection.NewIncidentDivisionHandler()
	inc, d := uuid.New(), uuid.New()

	applyAll(t, h, evt("Incident", inc, "Imported", obj{"divisions": []obj{
		{"id": d.String(), "name": "Med", "description": "Medical"},
	}}, tm(0)))

	rows := h.ForIncident(inc)
	require.Len(t, rows, 1)
	assert.Equal(t, "Med", rows[0].Name)
	assert.Equal(t, "Medical", rows[0].Description)
}

func TestIncidentDivisionHandler_EventsForUnknownDivisionAreIgnored(t *testing.T) {
	h := projection.NewIncidentDivisionHandler()
	inc, d := uuid.New(), uuid.New()

	applyAll(t, h,
		evt("Incident", inc, "DivisionKindAssigned", obj{"id": d.String(), "kind": "FIRE"}, tm(0)),
		evt("Incident", inc, "DivisionRenamed", obj{"id": d.String(), "name": "x"}, tm(0)),
		evt("Incident", inc, "DivisionRemoved", obj{"id": d.String()}, tm(0)),
		evt("Incident", inc, "Closed", obj{}, tm(0)),
	)

	assert.Empty(t, h.ForIncident(inc))
}

func TestIncidentDivisionHandler_MalformedPayloads(t *testing.T) {
	inc := uuid.New()

	tests := []struct {
		name  string
		event string
		data  any
	}{
		{"opened undecodable", "Opened", "x"},
		{"added undecodable", "DivisionAdded", "x"},
		{"added bad id", "DivisionAdded", obj{"division": obj{"id": "nope"}}},
		{"kind undecodable", "DivisionKindAssigned", "x"},
		{"kind bad id", "DivisionKindAssigned", obj{"id": "nope"}},
		{"renamed undecodable", "DivisionRenamed", "x"},
		{"renamed bad id", "DivisionRenamed", obj{"id": "nope"}},
		{"removed undecodable", "DivisionRemoved", "x"},
		{"removed bad id", "DivisionRemoved", obj{"id": "nope"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewIncidentDivisionHandler()
			require.Error(t, h.Apply(t.Context(), evt("Incident", inc, tc.event, tc.data, tm(0))))
			assert.Empty(t, h.ForIncident(inc))
		})
	}
}

func TestIncidentDivisionHandler_Reset(t *testing.T) {
	h := projection.NewIncidentDivisionHandler()
	inc := uuid.New()

	applyAll(
		t,
		h,
		evt("Incident", inc, "DivisionAdded", obj{"division": obj{"id": uuid.NewString(), "name": "x"}}, tm(0)),
	)
	require.Len(t, h.ForIncident(inc), 1)

	require.NoError(t, h.Reset(t.Context()))
	assert.Empty(t, h.ForIncident(inc))
}
