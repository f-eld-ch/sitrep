package incident_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at    = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor = "test-actor"
)

// replay rebuilds an aggregate from a slice of events (the Given part of Given/When/Then).
func replay(t *testing.T, id shared.IncidentID, events []eventsourcing.Event) *incident.Incident {
	t.Helper()

	inc := incident.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(inc, e))
	}

	return inc
}

// opened returns an IncidentOpened event for use in Given clauses.
func opened(id shared.IncidentID, name string) eventsourcing.Event {
	inc := incident.New(id)
	if err := inc.Open(name, nil, nil, at, actor); err != nil {
		panic(err)
	}

	events := inc.Root().PendingEvents()

	return events[0]
}

func TestIncident_Open(t *testing.T) {
	id := shared.IncidentID(uuid.New())

	tests := []struct {
		name    string
		incName string
		wantErr error
	}{
		{"valid name creates event", "Hochwasser Reuss", nil},
		{"empty name is rejected", "", shared.ErrInvalidInput},
		{"whitespace name is rejected", " \t", shared.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inc := incident.New(id)

			err := inc.Open(tt.incName, nil, nil, at, actor)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, inc.Root().PendingEvents())

				return
			}

			require.NoError(t, err)

			events := inc.Root().PendingEvents()
			require.Len(t, events, 1)
			assert.Equal(t, "Opened", events[0].EventType)
		})
	}
}

func TestIncident_Close(t *testing.T) {
	id := shared.IncidentID(uuid.New())

	tests := []struct {
		name  string
		given func() []eventsourcing.Event
		when  func(*incident.Incident) error
		then  string // expected event type, or ""
		err   error
	}{
		{
			name:  "open incident closes successfully",
			given: func() []eventsourcing.Event { return []eventsourcing.Event{opened(id, "Hochwasser")} },
			when:  func(i *incident.Incident) error { return i.Close(shared.ReasonManual, actor, at) },
			then:  "Closed",
		},
		{
			name:  "already-closed incident is rejected",
			given: func() []eventsourcing.Event { return []eventsourcing.Event{opened(id, "Hochwasser")} },
			when: func(i *incident.Incident) error {
				require.NoError(t, i.Close(shared.ReasonManual, actor, at))
				i.Root().ClearPending()

				return i.Close(shared.ReasonManual, actor, at)
			},
			err: shared.ErrAlreadyClosed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inc := replay(t, id, tt.given())

			err := tt.when(inc)
			if tt.err != nil {
				require.ErrorIs(t, err, tt.err)
				return
			}

			require.NoError(t, err)

			pending := inc.Root().PendingEvents()
			require.Len(t, pending, 1)
			assert.Equal(t, tt.then, pending[0].EventType)
		})
	}
}

func TestIncident_DeleteRequiresClosed(t *testing.T) {
	id := shared.IncidentID(uuid.New())

	t.Run("open incident cannot be deleted", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		err := inc.Delete(shared.DeleteReasonManual, actor, at)
		require.ErrorIs(t, err, shared.ErrIncidentNotClosed)
	})

	t.Run("closed incident can be deleted", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
		inc.Root().ClearPending()

		err := inc.Delete(shared.DeleteReasonManual, actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "Deleted", pending[0].EventType)
	})
}

func TestIncident_LinkParent(t *testing.T) {
	childID := shared.IncidentID(uuid.New())
	parentID := shared.IncidentID(uuid.New())

	t.Run("open child links to parent", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})

		err := inc.LinkParent(parentID, actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "ParentLinked", pending[0].EventType)
		assert.Equal(t, &parentID, inc.ParentID())

		data, ok := pending[0].Data.(incident.ParentLinked)
		require.True(t, ok)
		assert.Equal(t, parentID, data.ParentID)
	})

	t.Run("replay restores parent", func(t *testing.T) {
		inc := incident.New(childID)
		require.NoError(t, inc.Open("Municipal", nil, nil, at, actor))
		require.NoError(t, inc.LinkParent(parentID, actor, at))

		replayed := replay(t, childID, inc.Root().PendingEvents())
		require.NotNil(t, replayed.ParentID())
		assert.Equal(t, parentID, *replayed.ParentID())
	})

	t.Run("relink replaces existing parent", func(t *testing.T) {
		newParentID := shared.IncidentID(uuid.New())
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})
		require.NoError(t, inc.LinkParent(parentID, actor, at))
		inc.Root().ClearPending()

		err := inc.LinkParent(newParentID, actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "ParentLinked", pending[0].EventType)
		assert.Equal(t, &newParentID, inc.ParentID())
	})

	t.Run("self parent is rejected", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})

		err := inc.LinkParent(childID, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Nil(t, inc.ParentID())
		assert.Empty(t, inc.Root().PendingEvents())
	})

	t.Run("closed child cannot link parent", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
		inc.Root().ClearPending()

		err := inc.LinkParent(parentID, actor, at)
		require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
		assert.Empty(t, inc.Root().PendingEvents())
	})

	t.Run("deleted child cannot link parent", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
		require.NoError(t, inc.Delete(shared.DeleteReasonManual, actor, at))
		inc.Root().ClearPending()

		err := inc.LinkParent(parentID, actor, at)
		require.ErrorIs(t, err, shared.ErrIncidentDeleted)
		assert.Empty(t, inc.Root().PendingEvents())
	})
}

func TestIncident_UnlinkParent(t *testing.T) {
	childID := shared.IncidentID(uuid.New())
	parentID := shared.IncidentID(uuid.New())

	t.Run("open child unlinks parent", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})
		require.NoError(t, inc.LinkParent(parentID, actor, at))
		inc.Root().ClearPending()

		err := inc.UnlinkParent(actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "ParentUnlinked", pending[0].EventType)
		assert.Nil(t, inc.ParentID())
	})

	t.Run("replay clears parent", func(t *testing.T) {
		inc := incident.New(childID)
		require.NoError(t, inc.Open("Municipal", nil, nil, at, actor))
		require.NoError(t, inc.LinkParent(parentID, actor, at))
		require.NoError(t, inc.UnlinkParent(actor, at))

		replayed := replay(t, childID, inc.Root().PendingEvents())
		assert.Nil(t, replayed.ParentID())
	})

	t.Run("unlink without parent still emits event", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})

		err := inc.UnlinkParent(actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "ParentUnlinked", pending[0].EventType)
		assert.Nil(t, inc.ParentID())
	})

	t.Run("closed child cannot unlink parent", func(t *testing.T) {
		inc := replay(t, childID, []eventsourcing.Event{opened(childID, "Municipal")})
		require.NoError(t, inc.LinkParent(parentID, actor, at))
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
		inc.Root().ClearPending()

		err := inc.UnlinkParent(actor, at)
		require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
		assert.Empty(t, inc.Root().PendingEvents())
	})
}

func TestIncident_UpdateDivisions(t *testing.T) {
	id := shared.IncidentID(uuid.New())
	divID := shared.DivisionID(uuid.New())

	t.Run("set-replacement emits decomposed events", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})

		desired := []incident.DivisionData{
			{ID: divID, Name: "Karte", Description: "Kartenstelle"},
		}
		err := inc.UpdateDivisions(desired, actor, at)
		require.NoError(t, err)

		types := make([]string, 0)
		for _, e := range inc.Root().PendingEvents() {
			types = append(types, e.EventType)
		}

		assert.Contains(t, types, "DivisionAdded")
	})

	t.Run("whitespace division fields are rejected", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		err := inc.UpdateDivisions([]incident.DivisionData{
			{ID: divID, Name: " ", Description: "Kartenstelle"},
		}, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Empty(t, inc.Root().PendingEvents())
	})

	t.Run("unchanged legacy blank division fields do not block updates", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		require.NoError(t, eventsourcing.Apply(inc, eventsourcing.Event{
			StreamID:   uuid.UUID(id),
			StreamType: "Incident",
			EventType:  "DivisionAdded",
			Data: incident.DivisionAdded{Division: incident.DivisionData{
				ID:          divID,
				Name:        " ",
				Description: " ",
			}},
			OccurredAt: at,
		}))

		err := inc.UpdateDivisions([]incident.DivisionData{
			{ID: divID, Name: " ", Description: " "},
		}, actor, at)
		require.NoError(t, err)
		assert.Empty(t, inc.Root().PendingEvents())
	})

	t.Run("removing a division emits DivisionRemoved", func(t *testing.T) {
		// First add the division via replay.
		inc := incident.New(id)
		require.NoError(t, inc.Open("Hochwasser", nil, []incident.DivisionData{
			{ID: divID, Name: "Karte", Description: "Kartenstelle"},
		}, at, actor))

		for _, e := range inc.Root().PendingEvents() {
			require.NoError(t, eventsourcing.Apply(inc, e))
		}

		inc.Root().ClearPending()

		// Now replace with empty set.
		err := inc.UpdateDivisions(nil, actor, at)
		require.NoError(t, err)

		pending := inc.Root().PendingEvents()
		require.Len(t, pending, 1)
		assert.Equal(t, "DivisionRemoved", pending[0].EventType)
	})
}

func TestIncident_Reopen(t *testing.T) {
	id := shared.IncidentID(uuid.New())

	t.Run("open incident cannot be reopened", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		err := inc.Reopen(actor, at)
		require.ErrorIs(t, err, shared.ErrAlreadyOpen)
	})

	t.Run("closed incident reopens successfully", func(t *testing.T) {
		inc := replay(t, id, []eventsourcing.Event{opened(id, "Hochwasser")})
		require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
		inc.Root().ClearPending()

		err := inc.Reopen(actor, at)
		require.NoError(t, err)
		assert.True(t, inc.IsOpen())
	})
}
