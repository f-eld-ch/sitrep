package messagemap_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

func ev(t string, data string) messagemap.Event { return messagemap.Event{Type: t, Data: []byte(data)} }

func TestPlanDivision(t *testing.T) {
	added := func(id, name, desc, kind string) messagemap.Event {
		return ev(
			"DivisionAdded",
			`{"division":{"id":"`+id+`","name":"`+name+`","description":"`+desc+`","kind":"`+kind+`"}}`,
		)
	}

	tests := []struct {
		name   string
		events []messagemap.Event
		want   messagemap.DivisionPlan
	}{
		{
			name:   "german default is matched by description",
			events: []messagemap.Event{added("a", "Lage", "C Lage", ""), added("b", "Karte", "Nachrichtenkarte", "")},
			want:   messagemap.DivisionPlan{AssignKindTo: "b"},
		},
		{
			name:   "english description",
			events: []messagemap.Event{added("a", "Map", "Situation Map", "")},
			want:   messagemap.DivisionPlan{AssignKindTo: "a"},
		},
		{
			name:   "french description, case-insensitive",
			events: []messagemap.Event{added("a", "x", " carte de situation ", "")},
			want:   messagemap.DivisionPlan{AssignKindTo: "a"},
		},
		{
			name:   "italian name only",
			events: []messagemap.Event{added("a", "Carta", "Mappa operativa", "")},
			want:   messagemap.DivisionPlan{AssignKindTo: "a"},
		},
		{
			name:   "description beats name",
			events: []messagemap.Event{added("a", "Karte", "Anders", ""), added("b", "Foo", "Nachrichtenkarte", "")},
			want:   messagemap.DivisionPlan{AssignKindTo: "b"},
		},
		{
			name: "renamed division is matched by its current labels",
			events: []messagemap.Event{
				added("a", "Foo", "Bar", ""),
				ev("DivisionRenamed", `{"id":"a","name":"Karte","description":"Nachrichtenkarte"}`),
			},
			want: messagemap.DivisionPlan{AssignKindTo: "a"},
		},
		{
			name: "removed division is ignored",
			events: []messagemap.Event{
				added("a", "Karte", "Nachrichtenkarte", ""),
				ev("DivisionRemoved", `{"id":"a"}`),
			},
			want: messagemap.DivisionPlan{AddNew: true},
		},
		{
			name:   "no match adds a new division",
			events: []messagemap.Event{added("a", "SC", "Stabschef", "")},
			want:   messagemap.DivisionPlan{AddNew: true},
		},
		{
			name:   "no divisions at all adds a new division",
			events: nil,
			want:   messagemap.DivisionPlan{AddNew: true},
		},
		{
			name:   "already migrated by kind on add",
			events: []messagemap.Event{added("a", "Karte", "Nachrichtenkarte", "MESSAGE_MAP")},
			want:   messagemap.DivisionPlan{},
		},
		{
			name: "already migrated by assigned kind",
			events: []messagemap.Event{
				added("a", "Karte", "Nachrichtenkarte", ""),
				ev("DivisionKindAssigned", `{"id":"a","kind":"MESSAGE_MAP"}`),
			},
			want: messagemap.DivisionPlan{},
		},
		{
			name: "imported divisions are considered",
			events: []messagemap.Event{
				ev("Imported", `{"divisions":[{"id":"a","name":"Karte","description":"Nachrichtenkarte"}]}`),
			},
			want: messagemap.DivisionPlan{AssignKindTo: "a"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messagemap.PlanDivision(tt.events)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestPlanLayer(t *testing.T) {
	created := func(name string) messagemap.Event {
		return ev("Created", `{"incidentId":"i","name":"`+name+`"}`)
	}

	tests := []struct {
		name    string
		streams []messagemap.LayerStream
		want    messagemap.LayerPlan
	}{
		{
			name: "oldest matching layer wins",
			streams: []messagemap.LayerStream{
				{ID: "l1", Events: []messagemap.Event{created("Lage")}},
				{ID: "l2", Events: []messagemap.Event{created("Nachrichtenkarte")}},
				{ID: "l3", Events: []messagemap.Event{created("Situation Map")}},
			},
			want: messagemap.LayerPlan{AssignKindTo: "l2"},
		},
		{
			name: "renamed layer matches its current name",
			streams: []messagemap.LayerStream{
				{ID: "l1", Events: []messagemap.Event{created("Foo"), ev("Renamed", `{"name":"Carta informativa"}`)}},
			},
			want: messagemap.LayerPlan{AssignKindTo: "l1"},
		},
		{
			name: "removed layer is ignored",
			streams: []messagemap.LayerStream{
				{ID: "l1", Events: []messagemap.Event{created("Nachrichtenkarte"), ev("Removed", `{"reason":"x"}`)}},
			},
			want: messagemap.LayerPlan{AddNew: true},
		},
		{
			name:    "no layers adds a new one",
			streams: nil,
			want:    messagemap.LayerPlan{AddNew: true},
		},
		{
			name: "already migrated",
			streams: []messagemap.LayerStream{
				{ID: "l1", Events: []messagemap.Event{created("Lage")}},
				{
					ID: "l2",
					Events: []messagemap.Event{
						created("Nachrichtenkarte"),
						ev("KindAssigned", `{"kind":"MESSAGE_MAP"}`),
					},
				},
			},
			want: messagemap.LayerPlan{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messagemap.PlanLayer(tt.streams)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestMessageMapDivisionID(t *testing.T) {
	added := func(id, kind string) messagemap.Event {
		return ev("DivisionAdded", `{"division":{"id":"`+id+`","name":"n","description":"d","kind":"`+kind+`"}}`)
	}

	t.Run("by kind on add", func(t *testing.T) {
		id, ok, err := messagemap.MessageMapDivisionID([]messagemap.Event{added("a", ""), added("b", "MESSAGE_MAP")})
		require.NoError(t, err)
		assert.True(t, ok)
		assert.Equal(t, "b", id)
	})

	t.Run("by assigned kind", func(t *testing.T) {
		id, ok, err := messagemap.MessageMapDivisionID([]messagemap.Event{
			added("a", ""), ev("DivisionKindAssigned", `{"id":"a","kind":"MESSAGE_MAP"}`),
		})
		require.NoError(t, err)
		assert.True(t, ok)
		assert.Equal(t, "a", id)
	})

	t.Run("none", func(t *testing.T) {
		_, ok, err := messagemap.MessageMapDivisionID([]messagemap.Event{added("a", "")})
		require.NoError(t, err)
		assert.False(t, ok)
	})
}

func TestNeedsAcknowledgement(t *testing.T) {
	triaged := func(divisions ...string) messagemap.Event {
		quoted := make([]string, len(divisions))
		for i, d := range divisions {
			quoted[i] = `"` + d + `"`
		}

		return ev("Triaged", `{"divisionIds":[`+strings.Join(quoted, ",")+`]}`)
	}
	ack := ev("DivisionAcknowledged", `{"divisionId":"map","by":"x"}`)

	tests := []struct {
		name   string
		events []messagemap.Event
		want   bool
	}{
		{"triaged to the division", []messagemap.Event{triaged("map", "sc")}, true},
		{"triaged elsewhere", []messagemap.Event{triaged("sc")}, false},
		{"never triaged", nil, false},
		{"already acknowledged", []messagemap.Event{triaged("map"), ack}, false},
		{
			"acknowledgement revoked",
			[]messagemap.Event{triaged("map"), ack, ev("DivisionAcknowledgementRevoked", `{"divisionId":"map"}`)},
			true,
		},
		{"division removed again", []messagemap.Event{triaged("map"), triaged("sc")}, false},
		{"deleted", []messagemap.Event{triaged("map"), ev("Deleted", `{"reason":"MANUAL"}`)}, false},
		{"imported with divisions", []messagemap.Event{ev("Imported", `{"divisionIds":["map"]}`)}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messagemap.NeedsAcknowledgement(tt.events, "map")
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestNeedsStandardLayer(t *testing.T) {
	created := func(name, kind string) []messagemap.Event {
		return []messagemap.Event{ev("Created", `{"incidentId":"i","name":"`+name+`","kind":"`+kind+`"}`)}
	}

	tests := []struct {
		name    string
		streams []messagemap.LayerStream
		want    bool
	}{
		{
			"only the message map layer",
			[]messagemap.LayerStream{{ID: "a", Events: created("Nachrichtenkarte", "MESSAGE_MAP")}},
			true,
		},
		{"no layers at all", nil, true},
		{"a regular layer exists", []messagemap.LayerStream{
			{ID: "a", Events: created("Nachrichtenkarte", "MESSAGE_MAP")},
			{ID: "b", Events: created("Lage", "")},
		}, false},
		{"a removed regular layer does not count", []messagemap.LayerStream{
			{ID: "a", Events: created("Nachrichtenkarte", "MESSAGE_MAP")},
			{ID: "b", Events: append(created("Lage", ""), ev("Removed", `{"reason":"MANUAL"}`))},
		}, true},
		{"a layer marked as message map by assignment does not count", []messagemap.LayerStream{
			{ID: "a", Events: append(created("Nachrichtenkarte", ""), ev("KindAssigned", `{"kind":"MESSAGE_MAP"}`))},
		}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := messagemap.NeedsStandardLayer(tt.streams)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}
