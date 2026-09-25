package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// setupResourceServices creates fully wired incident, schadenplatz, and resource
// services all sharing the same in-memory event store from testStack.
func setupResourceServices(t *testing.T) (
	inbound.IncidentService,
	inbound.SchadenplatzService,
	inbound.ResourceService,
) {
	t.Helper()

	factory, store := testStack(t)

	incRepo := eventstore.NewIncidentRepository(store)
	layerRepo := eventstore.NewLayerRepository(store)
	spRepo := eventstore.NewSchadenplatzRepository(store)
	resRepo := eventstore.NewResourceRepository(store)

	// IncidentService must have the Schadenplatz repo so it auto-creates the
	// default Schadenplatz when opening a new incident.
	incSvc := factory.IncidentService(incRepo, layerRepo)
	incSvc.WithSchadenplatzRepository(spRepo)

	spSvc := factory.SchadenplatzService(spRepo, incRepo)
	resSvc := factory.ResourceService(resRepo, incRepo, spRepo)

	return incSvc, spSvc, resSvc
}

// alertInput returns a minimal valid AlertResourceInput for the given incident.
// SchadenplatzID is nil so the service resolves the incident's default.
func alertInput(incidentID shared.IncidentID) inbound.AlertResourceInput {
	return inbound.AlertResourceInput{
		IncidentID:     incidentID,
		SchadenplatzID: nil,
		Formation:      resource.FormationFW,
		Name:           "Löschzug 1",
		Size:           resource.UnitSizeGruppe,
		PersonnelCount: 9,
		Hauptaufgabe:   "Löschangriff",
	}
}

// ── AlertResource ─────────────────────────────────────────────────────────────

func TestResourceService_AlertResource_HappyPath(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)

	res, err := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	require.NoError(t, err)

	assert.NotEqual(t, shared.ResourceID{}, res.ID)
	assert.Equal(t, inc.IncidentID, res.IncidentID)
	assert.NotEqual(t, shared.SchadenplatzID{}, res.SchadenplatzID)
	assert.Equal(t, resource.StatusAufgeboten, res.Status)
	assert.Equal(t, "Löschzug 1", res.Name)
	assert.Equal(t, resource.FormationFW, res.Formation)
	assert.Equal(t, 9, res.PersonnelCount)
	assert.Equal(t, testAt, res.AlertedAt)
}

func TestResourceService_AlertResource_UsesDefaultSchadenplatz(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	require.NoError(t, err)

	// AlertResourceInput has no SchadenplatzID — service must resolve the default.
	input := alertInput(inc.IncidentID)
	input.SchadenplatzID = nil

	res, err := resSvc.AlertResource(ctx(), input, testActor)
	require.NoError(t, err)

	assert.NotEqual(t, shared.SchadenplatzID{}, res.SchadenplatzID)
}

func TestResourceService_AlertResource_ExplicitSchadenplatz(t *testing.T) {
	incSvc, spSvc, resSvc := setupResourceServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Unfall", nil, nil, nil, testActor)
	require.NoError(t, err)

	// Create an explicit extra Schadenplatz and supply it.
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Abschnitt Nord", nil, testActor)
	require.NoError(t, err)

	input := alertInput(inc.IncidentID)
	input.SchadenplatzID = &sp.ID

	res, err := resSvc.AlertResource(ctx(), input, testActor)
	require.NoError(t, err)
	assert.Equal(t, sp.ID, res.SchadenplatzID)
}

func TestResourceService_AlertResource_ClosedIncidentRejected(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, err := incSvc.CreateIncident(ctx(), "Abgeschlossen", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = incSvc.CloseIncident(ctx(), inc.IncidentID, testActor)
	require.NoError(t, err)

	_, err = resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

func TestResourceService_AlertResource_UnknownIncidentRejected(t *testing.T) {
	_, _, resSvc := setupResourceServices(t)

	input := alertInput(shared.IncidentID(newID()))
	_, err := resSvc.AlertResource(ctx(), input, testActor)
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

// ── MarkResourceReady ─────────────────────────────────────────────────────────

func TestResourceService_MarkResourceReady_HappyPath(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Sturm", nil, nil, nil, testActor)
	alerted, err := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	require.NoError(t, err)

	ready, err := resSvc.MarkResourceReady(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)

	assert.Equal(t, resource.StatusEinsatzbereit, ready.Status)
	assert.NotNil(t, ready.ReadyAt)
	assert.NotNil(t, ready.EinsatzBeginn, "EinsatzBeginn must be set on first MarkReady")
}

func TestResourceService_MarkResourceReady_WrongStatusRejected(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	_, err := resSvc.MarkResourceReady(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)

	// Second MarkReady when already EINSATZBEREIT must fail.
	_, err = resSvc.MarkResourceReady(ctx(), alerted.ID, nil, testActor)
	assert.Error(t, err, "MarkReady from EINSATZBEREIT must be rejected")
}

// ── DeployResource / StandDownResource ───────────────────────────────────────

func TestResourceService_DeployAndStandDown(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	_, err := resSvc.MarkResourceReady(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)

	deployed, err := resSvc.DeployResource(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)
	assert.Equal(t, resource.StatusEingesetzt, deployed.Status)
	assert.NotNil(t, deployed.DeployedAt)
	require.Len(t, deployed.DeploymentHistory, 1)
	assert.Nil(t, deployed.DeploymentHistory[0].EndedAt)

	stood, err := resSvc.StandDownResource(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)
	assert.Equal(t, resource.StatusEinsatzbereit, stood.Status)
	assert.NotNil(t, stood.StoodDownAt)
	require.Len(t, stood.DeploymentHistory, 1)
	assert.NotNil(t, stood.DeploymentHistory[0].EndedAt, "deployment history entry must be closed on stand-down")
}

func TestResourceService_StandDown_IdempotentWhenAlreadyReady(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	_, err := resSvc.MarkResourceReady(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)

	// Domain treats StandDown on EINSATZBEREIT as a no-op.
	_, err = resSvc.StandDownResource(ctx(), alerted.ID, nil, testActor)
	require.NoError(t, err)
}

// ── RelieveResource ───────────────────────────────────────────────────────────

func TestResourceService_RelieveResource_NoSuccessor(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Massenanfall", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)

	relieved, err := resSvc.RelieveResource(ctx(), alerted.ID, nil, nil, testActor)
	require.NoError(t, err)
	assert.Equal(t, resource.StatusAbgeloest, relieved.Status)
	assert.NotNil(t, relieved.RelievedAt)
	assert.NotNil(t, relieved.EinsatzEnde)
	assert.Nil(t, relieved.SuccessorID)
}

func TestResourceService_RelieveResource_WithSuccessor(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Grossereignis", nil, nil, nil, testActor)

	predecessor, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)

	successorInput := alertInput(inc.IncidentID)
	successorInput.Name = "Löschzug 2"
	successor, err := resSvc.AlertResource(ctx(), successorInput, testActor)
	require.NoError(t, err)

	// Relieve the predecessor and link the successor.
	relieved, err := resSvc.RelieveResource(ctx(), predecessor.ID, &successor.ID, nil, testActor)
	require.NoError(t, err)
	assert.Equal(t, resource.StatusAbgeloest, relieved.Status)
	require.NotNil(t, relieved.SuccessorID)
	assert.Equal(t, successor.ID, *relieved.SuccessorID)

	// The successor should now have its predecessor linked (SuccessionLinked event).
	// Verify by transitioning the successor — its PredecessorID must be set.
	successorState, err := resSvc.MarkResourceReady(ctx(), successor.ID, nil, testActor)
	require.NoError(t, err)
	require.NotNil(t, successorState.PredecessorID, "successor must have predecessor linked")
	assert.Equal(t, predecessor.ID, *successorState.PredecessorID)
}

func TestResourceService_RelieveResource_AlreadyRelievedRejected(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	_, err := resSvc.RelieveResource(ctx(), alerted.ID, nil, nil, testActor)
	require.NoError(t, err)

	_, err = resSvc.RelieveResource(ctx(), alerted.ID, nil, nil, testActor)
	assert.Error(t, err, "relieving an already-relieved resource must fail")
}

func TestResourceService_RelieveResource_ClosedIncidentRejected(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)
	_, err := incSvc.CloseIncident(ctx(), inc.IncidentID, testActor)
	require.NoError(t, err)

	_, err = resSvc.RelieveResource(ctx(), alerted.ID, nil, nil, testActor)
	assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

// ── ReassignResource ──────────────────────────────────────────────────────────

func TestResourceService_ReassignResource(t *testing.T) {
	incSvc, spSvc, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Einsatz", nil, nil, nil, testActor)
	sp, err := spSvc.CreateSchadenplatz(ctx(), inc.IncidentID, "Abschnitt Süd", nil, testActor)
	require.NoError(t, err)

	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)

	reassigned, err := resSvc.ReassignResource(ctx(), alerted.ID, sp.ID, nil, testActor)
	require.NoError(t, err)
	assert.Equal(t, sp.ID, reassigned.SchadenplatzID)
}

func TestResourceService_ReassignResource_SameSchadenplatzRejected(t *testing.T) {
	incSvc, _, resSvc := setupResourceServices(t)

	inc, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
	alerted, _ := resSvc.AlertResource(ctx(), alertInput(inc.IncidentID), testActor)

	// Reassign to the same Schadenplatz the resource is already on.
	_, err := resSvc.ReassignResource(ctx(), alerted.ID, alerted.SchadenplatzID, nil, testActor)
	assert.Error(t, err, "reassigning to the same Schadenplatz must be rejected")
}
