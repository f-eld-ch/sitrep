package projection_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// ── Test helpers ──────────────────────────────────────────────────────────────

var (
	testActor = identity.Actor{Sub: "test-sub", Email: "test@example.com", Name: "Tester"}
	testAt    = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
)

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

func ctx() context.Context {
	return identity.WithActor(context.Background(), testActor)
}

// testStack wires a complete inmem write side and projection read side.
type testStack struct {
	factory   *service.Factory
	store     *inmem.EventStore
	proj      *projection.Projector
	incidents *projection.IncidentHandler
	divisions *projection.IncidentDivisionHandler
	messages  *projection.MessageHandler
}

func newStack(t *testing.T) *testStack {
	t.Helper()
	store := inmem.NewEventStore()
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
	)
	incidents := projection.NewIncidentHandler()
	divisions := projection.NewIncidentDivisionHandler()
	messages := projection.NewMessageHandler()
	proj := projection.NewProjector(store, []projection.Handler{incidents, divisions, messages})
	return &testStack{
		factory:   factory,
		store:     store,
		proj:      proj,
		incidents: incidents,
		divisions: divisions,
		messages:  messages,
	}
}

func (s *testStack) incidentSvc() inbound.IncidentService {
	store := eventstore.NewIncidentRepository(s.store)
	layers := eventstore.NewLayerRepository(s.store)
	return s.factory.IncidentService(store, layers)
}

func (s *testStack) messageSvc() (inbound.IncidentService, inbound.MessageService) {
	incidentRepo := eventstore.NewIncidentRepository(s.store)
	layerRepo := eventstore.NewLayerRepository(s.store)
	messageRepo := eventstore.NewMessageRepository(s.store)
	return s.factory.IncidentService(incidentRepo, layerRepo),
		s.factory.MessageService(messageRepo, incidentRepo)
}

// ── Incident projection ───────────────────────────────────────────────────────

func TestProjector_IncidentCreated(t *testing.T) {
	s := newStack(t)

	res, err := s.incidentSvc().CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row, "incident row must exist after CatchUp")
	assert.Equal(t, "Hochwasser", row.Name)
	assert.False(t, row.IsClosed)
	assert.False(t, row.IsDeleted)
}

func TestProjector_IncidentUpdated(t *testing.T) {
	s := newStack(t)

	res, err := s.incidentSvc().CreateIncident(ctx(), "Sturm", nil, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	newName := "Sturm (aktualisiert)"
	_, err = s.incidentSvc().UpdateIncident(ctx(), res.IncidentID, &newName, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row)
	assert.Equal(t, "Sturm (aktualisiert)", row.Name)
}

func TestProjector_IncidentClosed(t *testing.T) {
	s := newStack(t)

	res, err := s.incidentSvc().CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = s.incidentSvc().CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row)
	assert.True(t, row.IsClosed)
	assert.NotNil(t, row.ClosedAt)
}

func TestProjector_IncidentReopened(t *testing.T) {
	s := newStack(t)

	res, err := s.incidentSvc().CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = s.incidentSvc().CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)
	_, err = s.incidentSvc().ReopenIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row)
	assert.False(t, row.IsClosed)
	assert.Nil(t, row.ClosedAt)
}

func TestProjector_IncidentDeletedRecordsDeletedAt(t *testing.T) {
	s := newStack(t)
	res, err := s.incidentSvc().CreateIncident(ctx(), "Deleted", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = s.incidentSvc().CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)
	require.NoError(t, s.incidentSvc().DeleteIncident(ctx(), res.IncidentID, testActor))
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row)
	assert.True(t, row.IsDeleted)
	require.NotNil(t, row.DeletedAt)
	assert.Equal(t, testAt, *row.DeletedAt)
}

func TestProjector_ImportedDeletedIncidentRecordsDeletedAt(t *testing.T) {
	handler := projection.NewIncidentHandler()
	deletedAt := testAt.Add(-7 * 24 * time.Hour)
	err := handler.Apply(ctx(), eventsourcing.Event{
		StreamType: "Incident",
		StreamID:   uuid.New(),
		EventType:  "Imported",
		OccurredAt: testAt,
		Data: incident.Imported{
			Name:      "Imported",
			DeletedAt: &deletedAt,
		},
	})
	require.NoError(t, err)

	row := handler.All()[0]
	assert.True(t, row.IsDeleted)
	require.NotNil(t, row.DeletedAt)
	assert.Equal(t, deletedAt, *row.DeletedAt)
}

func TestProjector_MultipleIncidents(t *testing.T) {
	s := newStack(t)

	res1, _ := s.incidentSvc().CreateIncident(ctx(), "Alpha", nil, nil, nil, testActor)
	res2, _ := s.incidentSvc().CreateIncident(ctx(), "Beta", nil, nil, nil, testActor)
	require.NoError(t, s.proj.CatchUp(ctx()))

	all := s.incidents.All()
	// each incident also emits layer events; incidents table has exactly 2 rows
	assert.Len(t, all, 2)
	assert.Equal(t, "Alpha", s.incidents.Get(uuid.UUID(res1.IncidentID)).Name)
	assert.Equal(t, "Beta", s.incidents.Get(uuid.UUID(res2.IncidentID)).Name)
}

// ── Message projection ────────────────────────────────────────────────────────

func TestProjector_MessageRecorded(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res, err := incSvc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
	require.NoError(t, err)

	msg, err := msgSvc.RecordMessage(ctx(), res.IncidentID,
		"Pegel steigt", "Beobachter Nord", "Brücke A2", "Führungsstab", "",
		shared.MediumRadio, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.messages.Get(uuid.UUID(msg.ID))
	require.NotNil(t, row, "message row must exist after CatchUp")
	assert.Equal(t, "Pegel steigt", row.Content)
	assert.Equal(t, "Beobachter Nord", row.Sender)
	assert.Equal(t, "Brücke A2", row.SenderDetail)
	assert.Equal(t, "Führungsstab", row.Receiver)
	assert.Equal(t, string(shared.MediumRadio), row.Medium)
	assert.Equal(t, "PENDING", row.Triage)
	assert.Equal(t, "NORMAL", row.Priority)
	assert.Equal(t, 1, row.Number)
	assert.False(t, row.Deleted)
}

func TestProjector_MessageCorrected(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res, _ := incSvc.CreateIncident(ctx(), "Brand", nil, nil, nil, testActor)
	msg, _ := msgSvc.RecordMessage(ctx(), res.IncidentID,
		"Rauch gesehen", "Beobachter", "555-1111", "Stab", "555-2222", shared.MediumPhone, nil, testActor)

	newContent := "Rauch und Flammen gesehen"
	_, err := msgSvc.CorrectMessage(ctx(), msg.ID,
		&newContent, nil, nil, nil, nil, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.messages.Get(uuid.UUID(msg.ID))
	require.NotNil(t, row)
	assert.Equal(t, "Rauch und Flammen gesehen", row.Content)
	assert.NotNil(t, row.LastEditorSub)
	assert.Equal(t, testActor.Sub, *row.LastEditorSub)
}

func TestProjector_MessageTriaged(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res, _ := incSvc.CreateIncident(ctx(), "Unfall", nil, nil, nil, testActor)
	msg, _ := msgSvc.RecordMessage(ctx(), res.IncidentID,
		"Fahrzeug umgekippt", "Streife", "", "Leitstelle", "", shared.MediumRadio, nil, testActor)

	_, err := msgSvc.TriageMessage(ctx(), msg.ID,
		shared.TriageDone, shared.PriorityHigh, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.messages.Get(uuid.UUID(msg.ID))
	require.NotNil(t, row)
	assert.Equal(t, string(shared.TriageDone), row.Triage)
	assert.Equal(t, string(shared.PriorityHigh), row.Priority)
}

func TestProjector_MessageMoreInfoNormalizesLegacyHighPriority(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res, _ := incSvc.CreateIncident(ctx(), "Unfall", nil, nil, nil, testActor)
	msg, _ := msgSvc.RecordMessage(ctx(), res.IncidentID,
		"Fahrzeug umgekippt", "Streife", "", "Leitstelle", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, s.proj.CatchUp(ctx()))

	err := s.messages.Apply(ctx(), eventsourcing.Event{
		StreamType: "Message",
		StreamID:   uuid.UUID(msg.ID),
		EventType:  "Triaged",
		Data: message.Triaged{
			Triage:   shared.TriageMoreInfo,
			Priority: shared.PriorityHigh,
		},
		OccurredAt: testAt,
	})
	require.NoError(t, err)

	row := s.messages.Get(uuid.UUID(msg.ID))
	require.NotNil(t, row)
	assert.Equal(t, string(shared.TriageMoreInfo), row.Triage)
	assert.Equal(t, string(shared.PriorityNormal), row.Priority)
}

func TestProjector_MessageDeleted(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res, _ := incSvc.CreateIncident(ctx(), "Probe", nil, nil, nil, testActor)
	msg, _ := msgSvc.RecordMessage(ctx(), res.IncidentID,
		"Testmeldung", "Sender", "", "Empfänger", "", shared.MediumRadio, nil, testActor)

	require.NoError(t, msgSvc.DeleteMessage(ctx(), msg.ID, testActor))
	require.NoError(t, s.proj.CatchUp(ctx()))

	row := s.messages.Get(uuid.UUID(msg.ID))
	require.NotNil(t, row)
	assert.True(t, row.Deleted)
	assert.Empty(t, s.messages.ForIncident(uuid.UUID(res.IncidentID)),
		"ForIncident must exclude deleted messages")
}

func TestProjector_MessagesSegregatedByIncident(t *testing.T) {
	s := newStack(t)
	incSvc, msgSvc := s.messageSvc()

	res1, _ := incSvc.CreateIncident(ctx(), "I1", nil, nil, nil, testActor)
	res2, _ := incSvc.CreateIncident(ctx(), "I2", nil, nil, nil, testActor)

	_, err := msgSvc.RecordMessage(ctx(), res1.IncidentID, "Msg A", "S", "", "R", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)
	_, err = msgSvc.RecordMessage(ctx(), res1.IncidentID, "Msg B", "S", "555-1111", "R", "555-2222", shared.MediumPhone, nil, testActor)
	require.NoError(t, err)
	_, err = msgSvc.RecordMessage(ctx(), res2.IncidentID, "Msg C", "S", "", "R", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))

	assert.Len(t, s.messages.ForIncident(uuid.UUID(res1.IncidentID)), 2)
	assert.Len(t, s.messages.ForIncident(uuid.UUID(res2.IncidentID)), 1)
}

// ── Projector reset ───────────────────────────────────────────────────────────

func TestProjector_Reset_RebuildsFromLog(t *testing.T) {
	s := newStack(t)

	res, _ := s.incidentSvc().CreateIncident(ctx(), "Reset-Test", nil, nil, nil, testActor)
	require.NoError(t, s.proj.CatchUp(ctx()))
	require.NotNil(t, s.incidents.Get(uuid.UUID(res.IncidentID)))

	// Reset clears all handler state and replays from the beginning.
	require.NoError(t, s.proj.Reset(ctx()))

	row := s.incidents.Get(uuid.UUID(res.IncidentID))
	require.NotNil(t, row, "row must be present after Reset replays from event log")
	assert.Equal(t, "Reset-Test", row.Name)
}

// ── Idempotency ───────────────────────────────────────────────────────────────

func TestProjector_DoubleCatchUp_IsIdempotent(t *testing.T) {
	s := newStack(t)

	_, err := s.incidentSvc().CreateIncident(ctx(), "Idempotent", nil, nil, nil, testActor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx()))
	require.NoError(t, s.proj.CatchUp(ctx()), "second CatchUp must not duplicate rows or error")
	assert.Len(t, s.incidents.All(), 1)
}
