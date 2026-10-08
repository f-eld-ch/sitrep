package messagemap_test

import (
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
