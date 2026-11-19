package incident_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// lifecycle is the state an incident is in when a command is tried on it.
type lifecycle string

const (
	stateOpen    lifecycle = "open"
	stateClosed  lifecycle = "closed"
	stateDeleted lifecycle = "deleted"
)

// incidentIn returns an incident in the given state with no pending events.
func incidentIn(t *testing.T, state lifecycle) *incident.Incident {
	t.Helper()

	inc := incident.New(shared.IncidentID(uuid.New()))
	require.NoError(t, inc.Open("Hochwasser", nil, nil, at, actor))

	if state == stateClosed || state == stateDeleted {
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
	}

	if state == stateDeleted {
		require.NoError(t, inc.Delete(shared.DeleteReasonManual, actor, at))
	}

	inc.Root().ClearPending()

	return inc
}

func TestIncident_CommandsRespectTheLifecycle(t *testing.T) {
	commands := map[string]func(*incident.Incident) error{
		"Rename": func(i *incident.Incident) error { return i.Rename("Neu", actor, at) },
		"ChangeLocation": func(i *incident.Incident) error {
			return i.ChangeLocation(&incident.LocationData{Name: "X"}, actor, at)
		},
		"UpdateDivisions": func(i *incident.Incident) error { return i.UpdateDivisions(nil, actor, at) },
		"LinkParent": func(i *incident.Incident) error {
			return i.LinkParent(shared.IncidentID(uuid.New()), actor, at)
		},
		"UnlinkParent": func(i *incident.Incident) error { return i.UnlinkParent(actor, at) },
	}

	tests := []struct {
		state lifecycle
		want  error
	}{
		{stateClosed, shared.ErrIncidentNotOpen},
		{stateDeleted, shared.ErrIncidentDeleted},
	}

	for name, run := range commands {
		for _, tt := range tests {
			t.Run(name+" on a "+string(tt.state)+" incident", func(t *testing.T) {
				inc := incidentIn(t, tt.state)

				require.ErrorIs(t, run(inc), tt.want)
				assert.Empty(t, inc.Root().PendingEvents())
			})
		}
	}

	t.Run("Close, Reopen, Delete and RecordReviewSummary refuse a deleted incident", func(t *testing.T) {
		deleted := map[string]func(*incident.Incident) error{
			"Close":  func(i *incident.Incident) error { return i.Close(shared.ReasonManual, actor, at) },
			"Reopen": func(i *incident.Incident) error { return i.Reopen(actor, at) },
			"Delete": func(i *incident.Incident) error { return i.Delete(shared.DeleteReasonManual, actor, at) },
			"RecordReviewSummary": func(i *incident.Incident) error {
				return i.RecordReviewSummary(kpi.Summary{}, actor, at)
			},
		}

		for name, run := range deleted {
			inc := incidentIn(t, stateDeleted)

			require.ErrorIs(t, run(inc), shared.ErrIncidentDeleted, name)
			assert.Empty(t, inc.Root().PendingEvents(), name)
		}
	})

	t.Run("an open incident cannot be deleted or given a review summary", func(t *testing.T) {
		inc := incidentIn(t, stateOpen)

		require.ErrorIs(t, inc.Delete(shared.DeleteReasonManual, actor, at), shared.ErrIncidentNotClosed)
		require.ErrorIs(t, inc.RecordReviewSummary(kpi.Summary{}, actor, at), shared.ErrIncidentNotClosed)
		assert.Empty(t, inc.Root().PendingEvents())
	})
}

func TestIncident_Open_RejectsInvalidDivisions(t *testing.T) {
	tests := []struct {
		name     string
		division incident.DivisionData
	}{
		{"empty name", incident.DivisionData{ID: shared.DivisionID(uuid.New()), Name: " ", Description: "d"}},
		{"empty description", incident.DivisionData{ID: shared.DivisionID(uuid.New()), Name: "n"}},
		{"system kind", incident.DivisionData{
			ID: shared.DivisionID(uuid.New()), Name: "n", Description: "d", Kind: shared.DivisionKindMessageMap,
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inc := incident.New(shared.IncidentID(uuid.New()))

			err := inc.Open("Brand", nil, []incident.DivisionData{tt.division}, at, actor)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
			assert.Empty(t, inc.Root().PendingEvents())
		})
	}
}

func TestIncident_Rename(t *testing.T) {
	t.Run("changes the name", func(t *testing.T) {
		inc := incidentIn(t, stateOpen)

		require.NoError(t, inc.Rename("Sturm", actor, at))
		assert.Equal(t, "Sturm", inc.Name())
		require.Len(t, inc.Root().PendingEvents(), 1)
		assert.Equal(t, "Renamed", inc.Root().PendingEvents()[0].EventType)
	})

	t.Run("an empty name is rejected", func(t *testing.T) {
		inc := incidentIn(t, stateOpen)

		require.ErrorIs(t, inc.Rename("  ", actor, at), shared.ErrInvalidInput)
		assert.Equal(t, "Hochwasser", inc.Name())
		assert.Empty(t, inc.Root().PendingEvents())
	})
}

func TestIncident_ChangeLocation(t *testing.T) {
	coords := &[2]float64{8.5, 47.3}

	t.Run("sets name and coordinates", func(t *testing.T) {
		inc := incidentIn(t, stateOpen)

		require.NoError(t, inc.ChangeLocation(&incident.LocationData{Name: "Bern", Coordinates: coords}, actor, at))
		require.NotNil(t, inc.Location())
		assert.Equal(t, "Bern", inc.Location().Name)
		assert.Equal(t, coords, inc.Location().Coordinates)
		require.Len(t, inc.Root().PendingEvents(), 1)
		assert.Equal(t, "LocationChanged", inc.Root().PendingEvents()[0].EventType)
	})

	t.Run("coordinates alone are a location", func(t *testing.T) {
		inc := incidentIn(t, stateOpen)

		require.NoError(t, inc.ChangeLocation(&incident.LocationData{Coordinates: coords}, actor, at))
		require.NotNil(t, inc.Location())
	})

	clearing := map[string]*incident.LocationData{
		"nil":             nil,
		"a zero location": {},
	}

	for name, loc := range clearing {
		t.Run(name+" clears the location", func(t *testing.T) {
			inc := incidentIn(t, stateOpen)
			require.NoError(t, inc.ChangeLocation(&incident.LocationData{Name: "Bern"}, actor, at))
			require.NotNil(t, inc.Location())

			require.NoError(t, inc.ChangeLocation(loc, actor, at))
			assert.Nil(t, inc.Location())

			// Replaying both events ends in the same state.
			replayed := replay(t, shared.IncidentID(inc.OwnerIncidentID()), inc.Root().PendingEvents())
			assert.Nil(t, replayed.Location())
		})
	}
}

func TestIncident_UpdateDivisions_Validation(t *testing.T) {
	existing := shared.DivisionID(uuid.New())

	withDivision := func(t *testing.T) *incident.Incident {
		t.Helper()

		inc := incident.New(shared.IncidentID(uuid.New()))
		require.NoError(t, inc.Open("Brand", nil,
			[]incident.DivisionData{{ID: existing, Name: "Alpha", Description: "Zug 1"}}, at, actor))
		inc.Root().ClearPending()

		return inc
	}

	tests := []struct {
		name    string
		desired []incident.DivisionData
	}{
		{"a new division without a name", []incident.DivisionData{
			{ID: existing, Name: "Alpha", Description: "Zug 1"},
			{ID: shared.DivisionID(uuid.New()), Name: "", Description: "d"},
		}},
		{"a new division without a description", []incident.DivisionData{
			{ID: existing, Name: "Alpha", Description: "Zug 1"},
			{ID: shared.DivisionID(uuid.New()), Name: "n", Description: " "},
		}},
		{"a rename to an empty name", []incident.DivisionData{{ID: existing, Name: "", Description: "Zug 1"}}},
		{"a system division", []incident.DivisionData{{
			ID: shared.DivisionID(uuid.New()), Name: "n", Description: "d", Kind: shared.DivisionKindMessageMap,
		}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inc := withDivision(t)

			require.ErrorIs(t, inc.UpdateDivisions(tt.desired, actor, at), shared.ErrInvalidInput)
			assert.Empty(t, inc.Root().PendingEvents(), "nothing is half applied")
		})
	}

	t.Run("a changed description alone is a rename", func(t *testing.T) {
		inc := withDivision(t)

		require.NoError(t, inc.UpdateDivisions(
			[]incident.DivisionData{{ID: existing, Name: "Alpha", Description: "Zug 2"}}, actor, at))

		div, ok := inc.Division(existing)
		require.True(t, ok)
		assert.Equal(t, "Zug 2", div.Description)
		require.Len(t, inc.Root().PendingEvents(), 1)
		assert.Equal(t, "DivisionRenamed", inc.Root().PendingEvents()[0].EventType)
	})
}

func TestIncident_Transition(t *testing.T) {
	id := shared.IncidentID(uuid.New())
	closedAt := at.Add(time.Hour)
	deletedAt := at.Add(2 * time.Hour)
	divID := shared.DivisionID(uuid.New())
	coords := &[2]float64{7.4, 46.9}

	t.Run("an imported incident carries its whole history", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{{
			Version:    1,
			EventType:  "Imported",
			OccurredAt: at,
			Data: incident.Imported{
				Name:      "Altes Ereignis",
				Location:  &incident.LocationData{Name: "Thun", Coordinates: coords},
				Divisions: []incident.DivisionData{{ID: divID, Name: "SC", Description: "Stabschef"}},
				CreatedAt: at,
				ClosedAt:  &closedAt,
				DeletedAt: &deletedAt,
			},
		}})

		assert.True(t, inc.IsImported())
		assert.True(t, inc.IsDeleted())
		assert.False(t, inc.IsClosed(), "deleted wins over closed")
		assert.Equal(t, at, inc.CreatedAt())
		require.NotNil(t, inc.Location())
		assert.Equal(t, "Thun", inc.Location().Name)

		div, ok := inc.Division(divID)
		require.True(t, ok)
		assert.Equal(t, "SC", div.Name)
	})

	t.Run("an event that is not an incident event is an error", func(t *testing.T) {
		inc := incident.New(id)

		require.Error(t, inc.Transition(eventsourcing.Event{Data: 42}))
	})

	t.Run("reopening drops the review summary", func(t *testing.T) {
		inc := incidentIn(t, stateClosed)
		require.NoError(t, inc.RecordReviewSummary(kpi.Summary{Messages: 3}, actor, at))
		require.NotNil(t, inc.ReviewSummary())

		require.NoError(t, inc.Reopen(actor, at))
		assert.Nil(t, inc.ReviewSummary())
	})

	t.Run("events for a division that is gone change nothing", func(t *testing.T) {
		inc := incident.New(id)
		desc := "x"

		require.NoError(t, inc.Transition(eventsourcing.Event{
			Data: incident.DivisionRenamed{ID: divID, Name: "n", Description: &desc},
		}))
		require.NoError(t, inc.Transition(eventsourcing.Event{
			Data: incident.DivisionKindAssigned{ID: divID, Kind: shared.DivisionKindMessageMap},
		}))
		assert.Empty(t, inc.Divisions())
	})

	t.Run("a rename without a description keeps the old one", func(t *testing.T) {
		inc := incident.New(id)

		require.NoError(t, inc.Transition(eventsourcing.Event{Data: incident.DivisionAdded{
			Division: incident.DivisionData{ID: divID, Name: "Alt", Description: "Beschreibung"},
		}}))
		require.NoError(t, inc.Transition(eventsourcing.Event{Data: incident.DivisionRenamed{ID: divID, Name: "Neu"}}))

		div, ok := inc.Division(divID)
		require.True(t, ok)
		assert.Equal(t, "Neu", div.Name)
		assert.Equal(t, "Beschreibung", div.Description)
	})
}
