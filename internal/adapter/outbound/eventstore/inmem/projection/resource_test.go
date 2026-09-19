package projection_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ── resourceStack ─────────────────────────────────────────────────────────────

// resourceStack wires the full inmem write side together with the
// ResourceHandler projection.
type resourceStack struct {
	factory   *service.Factory
	store     *inmem.EventStore
	proj      *projection.Projector
	resources *projection.ResourceHandler
}

func newResourceProjStack(t *testing.T) *resourceStack {
	t.Helper()

	store := inmem.NewEventStore()
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
	)
	resources := projection.NewResourceHandler()
	proj := projection.NewProjector(store, []projection.Handler{
		projection.NewIncidentHandler(),
		projection.NewIncidentDivisionHandler(),
		projection.NewMessageHandler(),
		resources,
	})

	return &resourceStack{
		factory:   factory,
		store:     store,
		proj:      proj,
		resources: resources,
	}
}

func (s *resourceStack) incidentSvc() inbound.IncidentService {
	incRepo := eventstore.NewIncidentRepository(s.store)
	layerRepo := eventstore.NewLayerRepository(s.store)
	spRepo := eventstore.NewSchadenplatzRepository(s.store)

	svc := s.factory.IncidentService(incRepo, layerRepo)
	svc.WithSchadenplatzRepository(spRepo)

	return svc
}

func (s *resourceStack) resourceSvc() inbound.ResourceService {
	incRepo := eventstore.NewIncidentRepository(s.store)
	spRepo := eventstore.NewSchadenplatzRepository(s.store)
	resRepo := eventstore.NewResourceRepository(s.store)

	return s.factory.ResourceService(resRepo, incRepo, spRepo)
}

func (s *resourceStack) schadenplatzSvc() inbound.SchadenplatzService {
	incRepo := eventstore.NewIncidentRepository(s.store)
	spRepo := eventstore.NewSchadenplatzRepository(s.store)

	return s.factory.SchadenplatzService(spRepo, incRepo)
}

// alertTestResource creates a fresh incident and alerts one resource on it,
// then catches up the projector.  Returns the resource state and incident ID.
func (s *resourceStack) alertTestResource(t *testing.T) (inbound.ResourceState, shared.IncidentID) {
	t.Helper()

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)

	input := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		SchadenplatzID: nil,
		Formation:      resource.FormationFW,
		Name:           "Löschzug 1",
		Size:           resource.UnitSizeGruppe,
		PersonnelCount: 9,
		Hauptaufgabe:   "Löschangriff",
	}

	res, err := s.resourceSvc().AlertResource(ctx(), input, testActor)
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx()))

	return res, inc.IncidentID
}

// ── Alerted ───────────────────────────────────────────────────────────────────

func TestResourceHandler_Alerted_RowCreated(t *testing.T) {
	s := newResourceProjStack(t)

	res, incID := s.alertTestResource(t)

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row, "resource row must exist after CatchUp")
	assert.Equal(t, uuid.UUID(res.ID), row.ID)
	assert.Equal(t, uuid.UUID(incID), row.IncidentID)
	assert.Equal(t, "Löschzug 1", row.Name)
	assert.Equal(t, string(resource.FormationFW), row.Formation)
	assert.Equal(t, 9, row.PersonnelCount)
	assert.Equal(t, "AUFGEBOTEN", row.Status)
	assert.Equal(t, testAt, row.AlertedAt)
	assert.Nil(t, row.ReadyAt)
	assert.Nil(t, row.DeployedAt)
	assert.Nil(t, row.EinsatzBeginn)
}

func TestResourceHandler_Alerted_WithContact(t *testing.T) {
	s := newResourceProjStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	require.NoError(t, err)

	contact := &resource.Contact{Medium: resource.ContactMediumRadio, Detail: "Kanal 3"}
	input := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		Formation:      resource.FormationFW,
		Name:           "Rüstgruppe",
		Size:           resource.UnitSizeTrupp,
		PersonnelCount: 2,
		Contact:        contact,
	}

	res, err := s.resourceSvc().AlertResource(ctx(), input, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	require.NotNil(t, row.ContactMedium)
	assert.Equal(t, "RADIO", *row.ContactMedium)
	require.NotNil(t, row.ContactDetail)
	assert.Equal(t, "Kanal 3", *row.ContactDetail)
}

// ── MarkedReady ───────────────────────────────────────────────────────────────

func TestResourceHandler_MarkedReady_StatusTransition(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)

	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	assert.Equal(t, "EINSATZBEREIT", row.Status)
	require.NotNil(t, row.ReadyAt)
	assert.Equal(t, testAt, *row.ReadyAt)
}

func TestResourceHandler_MarkedReady_EinsatzBeginnSetOnFirstCallOnly(t *testing.T) {
	// This tests the COALESCE semantics: EinsatzBeginn is only set on the
	// first MarkedReady event; subsequent ones must not overwrite it.
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)

	// First MarkReady — sets EinsatzBeginn.
	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	require.NotNil(t, row.EinsatzBeginn)
	firstBeginn := *row.EinsatzBeginn

	// Deploy and stand-down to get back to EINSATZBEREIT.
	_, err = s.resourceSvc().DeployResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	_, err = s.resourceSvc().StandDownResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)

	// Inject a second MarkedReady event with a later timestamp via direct Apply
	// to verify COALESCE semantics (the service clock is fixed, so we use Apply).
	laterTime := testAt.Add(time.Hour)
	err = s.resources.Apply(ctx(), eventsourcing.Event{
		StreamType: "Resource",
		StreamID:   uuid.UUID(res.ID),
		EventType:  "MarkedReady",
		OccurredAt: laterTime,
		Data:       resource.MarkedReady{At: laterTime},
	})
	require.NoError(t, err)

	row = s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	require.NotNil(t, row.EinsatzBeginn)
	assert.Equal(t, firstBeginn, *row.EinsatzBeginn, "EinsatzBeginn must not change on subsequent MarkedReady events")
}

// ── Deployed ──────────────────────────────────────────────────────────────────

func TestResourceHandler_Deployed_AddsHistoryEntry(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)
	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)

	_, err = s.resourceSvc().DeployResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	assert.Equal(t, "EINGESETZT", row.Status)
	require.NotNil(t, row.DeployedAt)
	assert.Equal(t, testAt, *row.DeployedAt)
	require.Len(t, row.DeploymentHistory, 1)
	assert.Equal(t, testAt, row.DeploymentHistory[0].StartedAt)
	assert.Nil(t, row.DeploymentHistory[0].EndedAt, "open deployment must not have an end time")
}

func TestResourceHandler_Deployed_DeployedAtSetOnFirstDeployOnly(t *testing.T) {
	// Like EinsatzBeginn, DeployedAt must only be set on the first Deployed event.
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)
	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	_, err = s.resourceSvc().DeployResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row.DeployedAt)
	firstDeployedAt := *row.DeployedAt

	// Stand-down then inject a second Deployed with a later timestamp.
	_, err = s.resourceSvc().StandDownResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)

	laterTime := testAt.Add(2 * time.Hour)
	err = s.resources.Apply(ctx(), eventsourcing.Event{
		StreamType: "Resource",
		StreamID:   uuid.UUID(res.ID),
		EventType:  "Deployed",
		OccurredAt: laterTime,
		Data:       resource.Deployed{At: laterTime},
	})
	require.NoError(t, err)

	row = s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row.DeployedAt)
	assert.Equal(t, firstDeployedAt, *row.DeployedAt, "DeployedAt must not change on re-deployment")
	assert.Len(t, row.DeploymentHistory, 2)
}

// ── StoodDown ─────────────────────────────────────────────────────────────────

func TestResourceHandler_StoodDown_ClosesHistoryEntry(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)
	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	_, err = s.resourceSvc().DeployResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	_, err = s.resourceSvc().StandDownResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	assert.Equal(t, "EINSATZBEREIT", row.Status)
	assert.NotNil(t, row.StoodDownAt)
	require.Len(t, row.DeploymentHistory, 1)
	assert.NotNil(t, row.DeploymentHistory[0].EndedAt, "stood-down deployment must have an end time")
}

// ── Relieved ──────────────────────────────────────────────────────────────────

func TestResourceHandler_Relieved_StatusAbgeloest(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)

	_, err := s.resourceSvc().RelieveResource(ctx(), res.ID, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	assert.Equal(t, "ABGELOEST", row.Status)
	assert.NotNil(t, row.RelievedAt)
	assert.NotNil(t, row.EinsatzEnde)
	assert.Nil(t, row.SuccessorID)
}

func TestResourceHandler_Relieved_WithSuccessorID(t *testing.T) {
	s := newResourceProjStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Grossereignis", nil, nil, nil, testActor)
	require.NoError(t, err)

	predInput := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		Formation:      resource.FormationFW,
		Name:           "Einheit A",
		Size:           resource.UnitSizeGruppe,
		PersonnelCount: 5,
	}
	predecessor, err := s.resourceSvc().AlertResource(ctx(), predInput, testActor)
	require.NoError(t, err)

	succInput := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		Formation:      resource.FormationFW,
		Name:           "Einheit B",
		Size:           resource.UnitSizeGruppe,
		PersonnelCount: 5,
	}
	successor, err := s.resourceSvc().AlertResource(ctx(), succInput, testActor)
	require.NoError(t, err)

	_, err = s.resourceSvc().RelieveResource(ctx(), predecessor.ID, &successor.ID, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(predecessor.ID))
	require.NotNil(t, row)
	assert.Equal(t, "ABGELOEST", row.Status)
	require.NotNil(t, row.SuccessorID)
	assert.Equal(t, uuid.UUID(successor.ID), *row.SuccessorID)
}

func TestResourceHandler_Relieved_ClosesOpenDeploymentHistory(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)
	_, err := s.resourceSvc().MarkResourceReady(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)
	_, err = s.resourceSvc().DeployResource(ctx(), res.ID, nil, testActor)
	require.NoError(t, err)

	// Relieve while still deployed — the open history entry must be closed.
	_, err = s.resourceSvc().RelieveResource(ctx(), res.ID, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	require.Len(t, row.DeploymentHistory, 1)
	assert.NotNil(t, row.DeploymentHistory[0].EndedAt, "relieved resource must have closed deployment history")
}

// ── ReassignedToSchadenplatz ──────────────────────────────────────────────────

func TestResourceHandler_ReassignedToSchadenplatz(t *testing.T) {
	s := newResourceProjStack(t)

	inc, err := s.incidentSvc().CreateIncident(ctx(), "Unfall", nil, nil, nil, testActor)
	require.NoError(t, err)

	sp, err := s.schadenplatzSvc().CreateSchadenplatz(ctx(), inc.IncidentID, "Abschnitt Nord", testActor)
	require.NoError(t, err)

	input := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		Formation:      resource.FormationFW,
		Name:           "Einheit X",
		Size:           resource.UnitSizeTrupp,
		PersonnelCount: 2,
	}
	res, err := s.resourceSvc().AlertResource(ctx(), input, testActor)
	require.NoError(t, err)

	_, err = s.resourceSvc().ReassignResource(ctx(), res.ID, sp.ID, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row)
	assert.Equal(t, uuid.UUID(sp.ID), row.SchadenplatzID)
}

// ── ForIncident / ForSchadenplatz ─────────────────────────────────────────────

func TestResourceHandler_ForIncident_ReturnsAllResources(t *testing.T) {
	s := newResourceProjStack(t)

	inc, _ := s.incidentSvc().CreateIncident(ctx(), "Multi", nil, nil, nil, testActor)

	for _, name := range []string{"Einheit A", "Einheit B", "Einheit C"} {
		input := inbound.AlertResourceInput{
			IncidentID:     inc.IncidentID,
			Formation:      resource.FormationFW,
			Name:           name,
			Size:           resource.UnitSizeTrupp,
			PersonnelCount: 2,
		}
		_, err := s.resourceSvc().AlertResource(ctx(), input, testActor)
		require.NoError(t, err)
	}

	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.resources.ForIncident(uuid.UUID(inc.IncidentID))
	assert.Len(t, rows, 3)
}

func TestResourceHandler_ForSchadenplatz_ExcludesRelievedResources(t *testing.T) {
	s := newResourceProjStack(t)

	inc, _ := s.incidentSvc().CreateIncident(ctx(), "Einsatz", nil, nil, nil, testActor)

	input := inbound.AlertResourceInput{
		IncidentID:     inc.IncidentID,
		Formation:      resource.FormationFW,
		Name:           "Einheit X",
		Size:           resource.UnitSizeTrupp,
		PersonnelCount: 2,
	}
	res, err := s.resourceSvc().AlertResource(ctx(), input, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	spID := res.SchadenplatzID
	rows := s.resources.ForSchadenplatz(uuid.UUID(spID))
	assert.Len(t, rows, 1, "active resource must appear in ForSchadenplatz")

	_, err = s.resourceSvc().RelieveResource(ctx(), res.ID, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows = s.resources.ForSchadenplatz(uuid.UUID(spID))
	assert.Empty(t, rows, "relieved resource must be excluded from ForSchadenplatz")
}

// ── Reset / Idempotency ───────────────────────────────────────────────────────

func TestResourceHandler_Reset_RebuildsFromLog(t *testing.T) {
	s := newResourceProjStack(t)

	res, _ := s.alertTestResource(t)

	require.NoError(t, s.proj.Reset(ctx()))

	row := s.resources.Get(uuid.UUID(res.ID))
	require.NotNil(t, row, "resource must be present after Reset replays from log")
	assert.Equal(t, "Löschzug 1", row.Name)
}

func TestResourceHandler_DoubleCatchUp_Idempotent(t *testing.T) {
	s := newResourceProjStack(t)

	_, incID := s.alertTestResource(t)
	require.NoError(t, s.proj.CatchUp(ctx()))

	rows := s.resources.ForIncident(uuid.UUID(incID))
	assert.Len(t, rows, 1, "double CatchUp must not duplicate rows")
}
