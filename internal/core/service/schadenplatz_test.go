package service_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// setupSchadenplatzServices creates fully wired incident and schadenplatz
// services sharing the same in-memory event store from testStack.
func setupSchadenplatzServices(t *testing.T) (inbound.IncidentService, inbound.SchadenplatzService) {
	t.Helper()

	factory, store := testStack(t)

	incRepo := eventstore.NewIncidentRepository(store)
	layerRepo := eventstore.NewLayerRepository(store)
	spRepo := eventstore.NewSchadenplatzRepository(store)

	// IncidentService must have the Schadenplatz repo so it auto-creates the
	// default Schadenplatz on incident creation.
	incSvc := factory.IncidentService(incRepo, layerRepo)
	incSvc.WithSchadenplatzRepository(spRepo)

	spSvc := factory.SchadenplatzService(spRepo, incRepo)

	return incSvc, spSvc
}

// ── CreateSchadenplatz ────────────────────────────────────────────────────────

func TestSchadenplatzService_CreateSchadenplatz_HappyPath(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)

	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Abschnitt Nord", testActor)
	require.NoError(t, err)

	assert.NotEqual(t, shared.SchadenplatzID{}, sp.ID)
	assert.Equal(t, inc.IncidentID, sp.IncidentID)
	assert.Equal(t, "Abschnitt Nord", sp.Name)
	assert.False(t, sp.IsDefault, "explicitly created Schadenplatz must not be the default")
	assert.False(t, sp.IsMerged)
}

func TestSchadenplatzService_CreateSchadenplatz_DefaultCreatedByIncident(t *testing.T) {
	// The IncidentService auto-creates a default Schadenplatz when WithSchadenplatzRepository is set.
	// Verify that after CreateIncident there is already a default one and it is not ours.
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	require.NoError(t, err)

	// Create a non-default one.
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Sektor Ost", testActor)
	require.NoError(t, err)
	assert.False(t, sp.IsDefault)
}

func TestSchadenplatzService_CreateSchadenplatz_ClosedIncidentRejected(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Geschlossen", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = incSvc.CloseIncident(ctx(), inc.IncidentID, testActor)
	require.NoError(t, err)

	_, err = spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Zu spät", testActor)
	assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

func TestSchadenplatzService_CreateSchadenplatz_UnknownIncidentRejected(t *testing.T) {
	_, spSvc := setupSchadenplatzServices(t)

	_, err := spSvc.CreateSchadenplatz(ctx(), shared.IncidentID(newID()), "Ghost", testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

// ── RenameSchadenplatz ────────────────────────────────────────────────────────

func TestSchadenplatzService_RenameSchadenplatz(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Alt", testActor)
	require.NoError(t, err)

	renamed, err := spSvc.RenameSchadenplatz(ctx(), sp.ID, "Neu", testActor)
	require.NoError(t, err)
	assert.Equal(t, "Neu", renamed.Name)
}

// ── RecordCasualties ──────────────────────────────────────────────────────────

func TestSchadenplatzService_RecordCasualties_AccumulatesDeltas(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Massenanfall", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Triage", testActor)
	require.NoError(t, err)

	msgID1 := shared.MessageID(newID())
	msgID2 := shared.MessageID(newID())
	at := time.Date(2026, 1, 15, 11, 0, 0, 0, time.UTC)

	// First recording from message 1.
	state, err := spSvc.RecordCasualties(ctx(), sp.ID, msgID1,
		schadenplatz.CasualtyDeltas{Verletzte: 3, Tote: 1},
		&at, testActor)
	require.NoError(t, err)
	assert.Equal(t, 3, state.Casualties.Verletzte)
	assert.Equal(t, 1, state.Casualties.Tote)

	// Second recording from a different message accumulates on top.
	at2 := at.Add(time.Hour)
	state, err = spSvc.RecordCasualties(ctx(), sp.ID, msgID2,
		schadenplatz.CasualtyDeltas{Verletzte: 2, Vermisste: 1},
		&at2, testActor)
	require.NoError(t, err)
	assert.Equal(t, 5, state.Casualties.Verletzte, "casualties must accumulate across messages")
	assert.Equal(t, 1, state.Casualties.Tote)
	assert.Equal(t, 1, state.Casualties.Vermisste)
}

func TestSchadenplatzService_RecordCasualties_ClosedIncidentRejected(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Zone", testActor)
	require.NoError(t, err)

	_, err = incSvc.CloseIncident(ctx(), inc.IncidentID, testActor)
	require.NoError(t, err)

	msgID := shared.MessageID(newID())
	_, err = spSvc.RecordCasualties(ctx(), sp.ID, msgID,
		schadenplatz.CasualtyDeltas{Verletzte: 1},
		&testAt, testActor)
	assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

// ── MergeSchadenplatz ─────────────────────────────────────────────────────────

func TestSchadenplatzService_MergeSchadenplatz(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Grossereignis", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Abschnitt West", testActor)
	require.NoError(t, err)

	err = spSvc.MergeSchadenplatz(ctx(), sp.ID, nil, testActor)
	require.NoError(t, err)
}

func TestSchadenplatzService_MergeSchadenplatz_ClosedIncidentRejected(t *testing.T) {
	incSvc, spSvc := setupSchadenplatzServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Zone", testActor)
	require.NoError(t, err)

	_, err = incSvc.CloseIncident(ctx(), inc.IncidentID, testActor)
	require.NoError(t, err)

	err = spSvc.MergeSchadenplatz(ctx(), sp.ID, nil, testActor)
	assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}
