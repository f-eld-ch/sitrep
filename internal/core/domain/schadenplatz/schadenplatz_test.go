package schadenplatz_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at         = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor      = "test-actor"
	incidentID = shared.IncidentID(uuid.New())
)

// replay rebuilds an aggregate from a slice of persisted events.
func replay(t *testing.T, id shared.SchadenplatzID, events []eventsourcing.Event) *schadenplatz.Schadenplatz {
	t.Helper()

	s := schadenplatz.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(s, e))
	}

	return s
}

// created returns a Created event for use in Given clauses.
func created(id shared.SchadenplatzID, name string, isDefault bool) eventsourcing.Event {
	s := schadenplatz.New(id)
	if err := s.Create(incidentID, name, isDefault, at, actor); err != nil {
		panic(err)
	}

	return s.Root().PendingEvents()[0]
}

// ──────────────────────────────────────────────────────────────────────────────
// Create
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_Create(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())

	tests := []struct {
		name      string
		spName    string
		isDefault bool
		wantErr   error
	}{
		{"valid name creates event", "Hauptschadenplatz", false, nil},
		{"default flag is preserved", "Allgemein", true, nil},
		{"empty name is rejected", "", false, shared.ErrInvalidInput},
		{"whitespace name is rejected", "   ", false, shared.ErrInvalidInput},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := schadenplatz.New(id)
			err := s.Create(incidentID, tt.spName, tt.isDefault, at, actor)

			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, s.Root().PendingEvents())

				return
			}

			require.NoError(t, err)

			events := s.Root().PendingEvents()
			require.Len(t, events, 1)
			assert.Equal(t, "Created", events[0].EventType)

			// State transitions correctly.
			assert.Equal(t, tt.spName, s.Name())
			assert.Equal(t, tt.isDefault, s.IsDefault())
			assert.Equal(t, incidentID, s.IncidentID())
		})
	}
}

func TestSchadenplatz_Create_SetsOwnerIncidentID(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	s := schadenplatz.New(id)
	require.NoError(t, s.Create(incidentID, "Test", false, at, actor))
	assert.Equal(t, uuid.UUID(incidentID), s.OwnerIncidentID())
}

// ──────────────────────────────────────────────────────────────────────────────
// Rename
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_Rename(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())

	tests := []struct {
		name    string
		given   []eventsourcing.Event
		newName string
		wantErr error
		wantEvt string
	}{
		{
			name:    "renames active Schadenplatz",
			given:   []eventsourcing.Event{created(id, "Alt", false)},
			newName: "Neu",
			wantEvt: "Renamed",
		},
		{
			name:    "empty name is rejected",
			given:   []eventsourcing.Event{created(id, "Alt", false)},
			newName: "",
			wantErr: shared.ErrInvalidInput,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := replay(t, id, tt.given)
			err := s.Rename(tt.newName, actor, at)

			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				return
			}

			require.NoError(t, err)

			pending := s.Root().PendingEvents()
			require.Len(t, pending, 1)
			assert.Equal(t, tt.wantEvt, pending[0].EventType)
			assert.Equal(t, tt.newName, s.Name())
		})
	}
}

func TestSchadenplatz_Rename_MergedIsRejected(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "Alt", false)})
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))
	s.Root().ClearPending()

	err := s.Rename("Neu", actor, at)
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)
}

// ──────────────────────────────────────────────────────────────────────────────
// SetGeometry
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_SetGeometry(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	geoJSON := []byte(`{"type":"Point","coordinates":[7.4,47.0]}`)

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.SetGeometry(geoJSON, actor, at))

	pending := s.Root().PendingEvents()
	require.Len(t, pending, 1)
	assert.Equal(t, "GeometrySet", pending[0].EventType)
	assert.JSONEq(t, string(geoJSON), string(s.GeoJSON()))
}

func TestSchadenplatz_SetGeometry_ClearWithNil(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	geoJSON := []byte(`{"type":"Point","coordinates":[7.4,47.0]}`)

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.SetGeometry(geoJSON, actor, at))
	s.Root().ClearPending()

	require.NoError(t, s.SetGeometry(nil, actor, at))
	assert.Nil(t, s.GeoJSON())
}

func TestSchadenplatz_SetGeometry_MergedIsRejected(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))
	s.Root().ClearPending()

	err := s.SetGeometry([]byte(`{}`), actor, at)
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)
}

// ──────────────────────────────────────────────────────────────────────────────
// RecordCasualties
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_RecordCasualties_AccumulatesCorrectly(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID1 := shared.MessageID(uuid.New())
	msgID2 := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})

	require.NoError(t, s.RecordCasualties(msgID1, schadenplatz.CasualtyDeltas{
		Vermisste: 3, Tote: 1, Verletzte: 5,
	}, at, actor))
	s.Root().ClearPending()

	require.NoError(t, s.RecordCasualties(msgID2, schadenplatz.CasualtyDeltas{
		Vermisste: 2, Obdachlose: 10, Eingeschlossene: 1,
	}, at, actor))
	s.Root().ClearPending()

	totals := s.Casualties()
	assert.Equal(t, 5, totals.Vermisste)
	assert.Equal(t, 1, totals.Tote)
	assert.Equal(t, 5, totals.Verletzte)
	assert.Equal(t, 10, totals.Obdachlose)
	assert.Equal(t, 1, totals.Eingeschlossene)
}

func TestSchadenplatz_RecordCasualties_EmitsEvent(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.RecordCasualties(msgID, schadenplatz.CasualtyDeltas{Tote: 2}, at, actor))

	pending := s.Root().PendingEvents()
	require.Len(t, pending, 1)
	assert.Equal(t, "CasualtiesRecorded", pending[0].EventType)
}

func TestSchadenplatz_RecordCasualties_ZeroDeltasAreAllowed(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	err := s.RecordCasualties(msgID, schadenplatz.CasualtyDeltas{}, at, actor)
	require.NoError(t, err)
}

func TestSchadenplatz_RecordCasualties_NegativeDeltasBelowTotalRejected(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID1 := shared.MessageID(uuid.New())
	msgID2 := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.RecordCasualties(msgID1, schadenplatz.CasualtyDeltas{Vermisste: 2}, at, actor))
	s.Root().ClearPending()

	// -3 would bring Vermisste to -1 (below zero).
	err := s.RecordCasualties(msgID2, schadenplatz.CasualtyDeltas{Vermisste: -3}, at, actor)
	require.ErrorIs(t, err, shared.ErrCasualtyBelowZero)
}

func TestSchadenplatz_RecordCasualties_NegativeDeltaExactlyToZeroIsAllowed(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID1 := shared.MessageID(uuid.New())
	msgID2 := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.RecordCasualties(msgID1, schadenplatz.CasualtyDeltas{Tote: 3}, at, actor))
	s.Root().ClearPending()

	// Exactly -3 brings Tote to 0 — this is allowed.
	err := s.RecordCasualties(msgID2, schadenplatz.CasualtyDeltas{Tote: -3}, at, actor)
	require.NoError(t, err)
	assert.Equal(t, 0, s.Casualties().Tote)
}

func TestSchadenplatz_RecordCasualties_AllCategoriesChecked(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID := shared.MessageID(uuid.New())

	tests := []struct {
		name   string
		deltas schadenplatz.CasualtyDeltas
	}{
		{"vermisste below zero", schadenplatz.CasualtyDeltas{Vermisste: -1}},
		{"tote below zero", schadenplatz.CasualtyDeltas{Tote: -1}},
		{"verletzte below zero", schadenplatz.CasualtyDeltas{Verletzte: -1}},
		{"obdachlose below zero", schadenplatz.CasualtyDeltas{Obdachlose: -1}},
		{"eingeschlossene below zero", schadenplatz.CasualtyDeltas{Eingeschlossene: -1}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
			err := s.RecordCasualties(msgID, tt.deltas, at, actor)
			require.ErrorIs(t, err, shared.ErrCasualtyBelowZero)
		})
	}
}

func TestSchadenplatz_RecordCasualties_MergedIsRejected(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())
	msgID := shared.MessageID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))
	s.Root().ClearPending()

	err := s.RecordCasualties(msgID, schadenplatz.CasualtyDeltas{Vermisste: 1}, at, actor)
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)
}

// ──────────────────────────────────────────────────────────────────────────────
// MergeIntoDefault
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_MergeIntoDefault(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))

	pending := s.Root().PendingEvents()
	require.Len(t, pending, 1)
	assert.Equal(t, "MergedIntoDefault", pending[0].EventType)
	assert.True(t, s.IsMerged())
	require.NotNil(t, s.MergedInto())
	assert.Equal(t, defaultID, *s.MergedInto())
}

func TestSchadenplatz_MergeIntoDefault_DefaultCannotMergeItself(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "Allgemein", true)})
	err := s.MergeIntoDefault(id, actor, at)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestSchadenplatz_MergeIntoDefault_AlreadyMergedIsRejected(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())

	s := replay(t, id, []eventsourcing.Event{created(id, "SP1", false)})
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))
	s.Root().ClearPending()

	err := s.MergeIntoDefault(defaultID, actor, at)
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)
}

// ──────────────────────────────────────────────────────────────────────────────
// Event replay (eventsourcing.Apply round-trip)
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_ReplayFromEvents(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	msgID := shared.MessageID(uuid.New())
	geoJSON := []byte(`{"type":"Polygon","coordinates":[[[7.4,47.0],[7.5,47.0],[7.5,47.1],[7.4,47.0]]]}`)

	// Build aggregate through commands to get canonical events.
	s := schadenplatz.New(id)
	require.NoError(t, s.Create(incidentID, "Hauptschadenplatz", false, at, actor))
	require.NoError(t, s.Rename("Chemieunfall Zone A", actor, at))
	require.NoError(t, s.SetGeometry(geoJSON, actor, at))
	require.NoError(t, s.RecordCasualties(msgID, schadenplatz.CasualtyDeltas{
		Vermisste: 2, Tote: 1, Verletzte: 5, Obdachlose: 3, Eingeschlossene: 1,
	}, at, actor))

	events := s.Root().PendingEvents()

	// Replay from scratch and verify final state matches.
	s2 := replay(t, id, events)
	assert.Equal(t, "Chemieunfall Zone A", s2.Name())
	assert.JSONEq(t, string(geoJSON), string(s2.GeoJSON()))
	assert.Equal(t, schadenplatz.CasualtyTotals{
		Vermisste: 2, Tote: 1, Verletzte: 5, Obdachlose: 3, Eingeschlossene: 1,
	}, s2.Casualties())
	assert.False(t, s2.IsMerged())
}

func TestSchadenplatz_ReplayMergedState(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	defaultID := shared.SchadenplatzID(uuid.New())

	s := schadenplatz.New(id)
	require.NoError(t, s.Create(incidentID, "SP1", false, at, actor))
	require.NoError(t, s.MergeIntoDefault(defaultID, actor, at))

	events := s.Root().PendingEvents()
	s2 := replay(t, id, events)

	assert.True(t, s2.IsMerged())
	require.NotNil(t, s2.MergedInto())
	assert.Equal(t, defaultID, *s2.MergedInto())
}

// ──────────────────────────────────────────────────────────────────────────────
// AggregateType / OwnerIncidentID
// ──────────────────────────────────────────────────────────────────────────────

func TestSchadenplatz_AggregateType(t *testing.T) {
	s := schadenplatz.New(shared.SchadenplatzID(uuid.New()))
	assert.Equal(t, "Schadenplatz", s.AggregateType())
}

func TestSchadenplatz_IDMatchesConstructorArg(t *testing.T) {
	id := shared.SchadenplatzID(uuid.New())
	s := schadenplatz.New(id)
	require.NoError(t, s.Create(incidentID, "Test", false, at, actor))
	assert.Equal(t, id, s.ID())
}
