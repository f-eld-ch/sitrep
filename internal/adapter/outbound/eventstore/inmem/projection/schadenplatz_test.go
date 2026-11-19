package projection_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func spCreated(sp, inc uuid.UUID, name string, isDefault bool) eventsourcing.Event {
	return evt(
		"Schadenplatz",
		sp,
		"Created",
		obj{"incidentId": inc.String(), "name": name, "isDefault": isDefault},
		tm(0),
	)
}

func casualties(sp, msg uuid.UUID, minute, missing, dead, injured, homeless, trapped int) eventsourcing.Event {
	return evt("Schadenplatz", sp, "CasualtiesRecorded", obj{
		"sourceMessageId": msg.String(),
		"deltas": obj{
			"vermisste":       missing,
			"tote":            dead,
			"verletzte":       injured,
			"obdachlose":      homeless,
			"eingeschlossene": trapped,
		},
	}, tm(minute))
}

func TestSchadenplatzHandler_Metadata(t *testing.T) {
	h := projection.NewSchadenplatzHandler()

	assert.Equal(t, "readmodel.schadenplatz", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{"Created", "Renamed", "GeometrySet", "CasualtiesRecorded", "MergedIntoDefault"} {
		assert.True(t, h.Handles("Schadenplatz", typ), typ)
		assert.False(t, h.Handles("Resource", typ), "other stream: %s", typ)
	}

	assert.False(t, h.Handles("Schadenplatz", "Unknown"))
}

func TestSchadenplatzHandler_Lifecycle(t *testing.T) {
	h := projection.NewSchadenplatzHandler()
	inc, def, sp, other := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		spCreated(def, inc, "Default", true),
		spCreated(sp, inc, "Site 1", false),
		spCreated(other, uuid.New(), "Elsewhere", true),
	)

	row := h.Get(sp)
	require.NotNil(t, row)
	assert.Equal(t, inc, row.IncidentID)
	assert.Equal(t, "Site 1", row.Name)
	assert.False(t, row.IsDefault)
	assert.Equal(t, tm(0), row.CreatedAt)

	applyAll(t, h,
		evt("Schadenplatz", sp, "Renamed", obj{"name": "Site A"}, tm(1)),
		evt("Schadenplatz", sp, "GeometrySet", obj{"geoJson": []byte(`{"type":"Point"}`)}, tm(2)),
	)

	row = h.Get(sp)
	assert.Equal(t, "Site A", row.Name)
	assert.JSONEq(t, `{"type":"Point"}`, string(row.GeoJSON))
	assert.Equal(t, tm(2), row.UpdatedAt)

	t.Run("the default is found per incident", func(t *testing.T) {
		got := h.DefaultForIncident(inc)
		require.NotNil(t, got)
		assert.Equal(t, def, got.ID)
		assert.Nil(t, h.DefaultForIncident(uuid.New()))
	})

	t.Run("merging hides a place from the live list but not from the full one", func(t *testing.T) {
		applyAll(t, h, evt("Schadenplatz", sp, "MergedIntoDefault", obj{"defaultSchadenplatzId": def.String()}, tm(3)))

		merged := h.Get(sp)
		assert.True(t, merged.IsMerged)
		require.NotNil(t, merged.MergedInto)
		assert.Equal(t, def, *merged.MergedInto)
		assert.Equal(t, tm(3), merged.UpdatedAt)

		assert.Len(t, h.ForIncident(inc), 1)
		assert.Equal(t, def, h.ForIncident(inc)[0].ID)
		assert.Len(t, h.AllForIncident(inc), 2)
		assert.Empty(t, h.ForIncident(uuid.New()))
		assert.Empty(t, h.AllForIncident(uuid.New()))
	})
}

func TestSchadenplatzHandler_CasualtiesAreSetPerMessageNotAccumulatedOnReplay(t *testing.T) {
	h := projection.NewSchadenplatzHandler()
	inc, sp, m1, m2 := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, spCreated(sp, inc, "Site", false), casualties(sp, m1, 1, 1, 2, 3, 4, 5))

	row := h.Get(sp)
	assert.Equal(t, [5]int{1, 2, 3, 4, 5},
		[5]int{row.Vermisste, row.Tote, row.Verletzte, row.Obdachlose, row.Eingeschlossene})

	t.Run("replaying the same message does not count it twice", func(t *testing.T) {
		applyAll(t, h, casualties(sp, m1, 1, 1, 2, 3, 4, 5))

		row := h.Get(sp)
		assert.Equal(t, [5]int{1, 2, 3, 4, 5},
			[5]int{row.Vermisste, row.Tote, row.Verletzte, row.Obdachlose, row.Eingeschlossene})
	})

	t.Run("a second message adds, and a correction of the first replaces its share", func(t *testing.T) {
		applyAll(t, h, casualties(sp, m2, 2, 10, 0, 0, 0, 0), casualties(sp, m1, 3, 0, 5, 0, 0, 0))

		row := h.Get(sp)
		assert.Equal(t, [5]int{10, 5, 0, 0, 0},
			[5]int{row.Vermisste, row.Tote, row.Verletzte, row.Obdachlose, row.Eingeschlossene})
		assert.Equal(t, tm(3), row.UpdatedAt)
	})

	t.Run("per-message rows", func(t *testing.T) {
		rows := h.GetMessageCasualties(m1)
		require.Len(t, rows, 1)
		assert.Equal(t, sp, rows[0].SchadenplatzID)
		assert.Equal(t, m1, rows[0].MessageID)
		assert.Equal(t, 5, rows[0].Tote)
		assert.Zero(t, rows[0].Vermisste)

		assert.Empty(t, h.GetMessageCasualties(uuid.New()))
	})
}

func TestSchadenplatzHandler_HasCasualtyRecords(t *testing.T) {
	h := projection.NewSchadenplatzHandler()
	inc, sp, msg := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, spCreated(sp, inc, "Site", false))
	assert.False(t, h.HasCasualtyRecords(inc), "nothing recorded yet")

	applyAll(t, h, casualties(sp, msg, 1, 0, 0, 0, 0, 0))
	assert.False(t, h.HasCasualtyRecords(inc), "all-zero deltas do not count")

	applyAll(t, h, casualties(sp, msg, 2, 0, 0, 0, 0, 1))
	assert.True(t, h.HasCasualtyRecords(inc))
	assert.False(t, h.HasCasualtyRecords(uuid.New()), "records of other incidents do not count")

	t.Run(
		"casualties of a place that does not exist are kept per message but belong to no incident",
		func(t *testing.T) {
			orphan := projection.NewSchadenplatzHandler()
			ghost := uuid.New()

			applyAll(t, orphan, casualties(ghost, msg, 1, 1, 1, 1, 1, 1))

			assert.Len(t, orphan.GetMessageCasualties(msg), 1)
			assert.False(t, orphan.HasCasualtyRecords(inc))
			assert.Nil(t, orphan.Get(ghost))
		},
	)
}

func TestSchadenplatzHandler_EventsForUnknownPlaceAreIgnored(t *testing.T) {
	h := projection.NewSchadenplatzHandler()
	sp := uuid.New()

	applyAll(t, h,
		evt("Schadenplatz", sp, "Renamed", obj{"name": "x"}, tm(0)),
		evt("Schadenplatz", sp, "GeometrySet", obj{}, tm(0)),
		evt("Schadenplatz", sp, "MergedIntoDefault", obj{"defaultSchadenplatzId": uuid.NewString()}, tm(0)),
		evt("Schadenplatz", sp, "Unknown", obj{}, tm(0)),
	)

	assert.Nil(t, h.Get(sp))
}

func TestSchadenplatzHandler_MalformedPayloads(t *testing.T) {
	sp := uuid.New()

	tests := []struct {
		name  string
		event eventsourcing.Event
	}{
		{"created undecodable", evt("Schadenplatz", sp, "Created", "x", tm(0))},
		{"created bad incident id", evt("Schadenplatz", sp, "Created", obj{"incidentId": "nope"}, tm(0))},
		{"renamed undecodable", evt("Schadenplatz", sp, "Renamed", "x", tm(0))},
		{"geometry undecodable", evt("Schadenplatz", sp, "GeometrySet", "x", tm(0))},
		{"casualties undecodable", evt("Schadenplatz", sp, "CasualtiesRecorded", "x", tm(0))},
		{
			"casualties bad message id",
			evt("Schadenplatz", sp, "CasualtiesRecorded", obj{"sourceMessageId": "nope"}, tm(0)),
		},
		{"merge undecodable", evt("Schadenplatz", sp, "MergedIntoDefault", "x", tm(0))},
		{
			"merge bad default id",
			evt("Schadenplatz", sp, "MergedIntoDefault", obj{"defaultSchadenplatzId": "nope"}, tm(0)),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewSchadenplatzHandler()
			require.Error(t, h.Apply(t.Context(), tc.event))
			assert.Nil(t, h.Get(sp))
		})
	}
}

func TestSchadenplatzHandler_ResetAndSnapshots(t *testing.T) {
	h := projection.NewSchadenplatzHandler()
	inc, sp, msg := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, spCreated(sp, inc, "Site", true), casualties(sp, msg, 1, 1, 0, 0, 0, 0))

	h.Get(sp).Name = "mutated"
	h.ForIncident(inc)[0].Name = "mutated"
	h.DefaultForIncident(inc).Name = "mutated"
	h.GetMessageCasualties(msg)[0].Vermisste = 99

	assert.Equal(t, "Site", h.Get(sp).Name, "rows are handed out as copies")
	assert.Equal(t, 1, h.GetMessageCasualties(msg)[0].Vermisste)

	require.NoError(t, h.Reset(t.Context()))
	assert.Nil(t, h.Get(sp))
	assert.Empty(t, h.GetMessageCasualties(msg))
	assert.False(t, h.HasCasualtyRecords(inc))
}
