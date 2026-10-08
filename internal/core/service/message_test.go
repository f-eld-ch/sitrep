package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

func TestMessageService_RecordMessage(t *testing.T) {
	t.Run("records message and assigns sequential number", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		messageSvc := factory.MessageService(messages, incidents)

		res, err := incidentSvc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)

		s1, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
			"Pegel steigt", "Beobachter Nord", "Brücke", "Führungsstab", "", shared.MediumRadio, nil, testActor)
		require.NoError(t, err)
		assert.NotEqual(t, shared.MessageID{}, s1.ID)

		s2, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
			"Lage stabil", "Beobachter Süd", "555-1111", "Führungsstab", "555-2222", shared.MediumPhone, nil, testActor)
		require.NoError(t, err)

		// IDs must differ
		assert.NotEqual(t, s1.ID, s2.ID)
	})

	t.Run("recording on closed incident is refused", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		messageSvc := factory.MessageService(messages, incidents)

		res, _ := incidentSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		_, closeErr := incidentSvc.CloseIncident(ctx(), res.IncidentID, testActor)
		require.NoError(t, closeErr)

		_, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
			"nach Abschluss", "Sender", "", "Empfänger", "", shared.MediumRadio, nil, testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})

	t.Run("recording on unknown incident is refused", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		factory.IncidentService(incidents, layers)
		messageSvc := factory.MessageService(messages, incidents)

		_, err := messageSvc.RecordMessage(ctx(), shared.IncidentID(newID()),
			"msg", "A", "", "B", "", shared.MediumRadio, nil, testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestMessageService_CorrectMessage(t *testing.T) {
	factory, store := testStack(t)
	incidents, messages, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	messageSvc := factory.MessageService(messages, incidents)

	res, _ := incidentSvc.CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
	ms, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
		"Original", "Alpha", "", "Beta", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)

	newContent := "Korrigiert"
	_, err = messageSvc.CorrectMessage(ctx(), ms.ID, &newContent, nil, nil, nil, nil, nil, nil, testActor)
	require.NoError(t, err)
}

func TestMessageService_TriageMessage(t *testing.T) {
	factory, store := testStack(t)
	incidents, messages, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	messageSvc := factory.MessageService(messages, incidents)

	res, _ := incidentSvc.CreateIncident(ctx(), "Lagebesprechung", nil, nil, nil, testActor)
	ms, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
		"Status Update", "Koordinator", "555-1111", "Führung", "555-2222", shared.MediumPhone, nil, testActor)
	require.NoError(t, err)

	_, err = messageSvc.TriageMessage(ctx(), ms.ID, shared.TriageDone, shared.PriorityHigh, nil, nil, testActor)
	require.NoError(t, err)
}

func TestMessageService_DeleteMessage(t *testing.T) {
	t.Run("delete removes message", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		messageSvc := factory.MessageService(messages, incidents)

		res, _ := incidentSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		ms, _ := messageSvc.RecordMessage(ctx(), res.IncidentID,
			"Zu löschen", "X", "", "Y", "", shared.MediumRadio, nil, testActor)

		require.NoError(t, messageSvc.DeleteMessage(ctx(), ms.ID, testActor))
	})

	t.Run("deleting unknown message returns not-found", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		factory.IncidentService(incidents, layers)
		messageSvc := factory.MessageService(messages, incidents)

		err := messageSvc.DeleteMessage(ctx(), shared.MessageID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})
}

func TestMessageService_RejectsWritesOnClosedIncident(t *testing.T) {
	factory, store := testStack(t)
	incidents, messages, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	messageSvc := factory.MessageService(messages, incidents)

	res, err := incidentSvc.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
	require.NoError(t, err)
	msg, err := messageSvc.RecordMessage(ctx(), res.IncidentID,
		"Original", "Sender", "", "Receiver", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), res.IncidentID, testActor)
	require.NoError(t, err)

	content := "Corrected"
	_, err = messageSvc.CorrectMessage(ctx(), msg.ID, &content, nil, nil, nil, nil, nil, nil, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	_, err = messageSvc.TriageMessage(ctx(), msg.ID, shared.TriageDone, shared.PriorityHigh, nil, nil, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	err = messageSvc.DeleteMessage(ctx(), msg.ID, testActor)
	require.ErrorIs(t, err, shared.ErrIncidentNotOpen)
}

func TestMessageService_CounterIsPerIncident(t *testing.T) {
	factory, store := testStack(t)
	incidents, messages, layers, _ := repos(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	messageSvc := factory.MessageService(messages, incidents)

	res1, _ := incidentSvc.CreateIncident(ctx(), "Incident A", nil, nil, nil, testActor)
	res2, _ := incidentSvc.CreateIncident(ctx(), "Incident B", nil, nil, nil, testActor)

	_, err := messageSvc.RecordMessage(
		ctx(),
		res1.IncidentID,
		"msg1",
		"A",
		"",
		"B",
		"",
		shared.MediumRadio,
		nil,
		testActor,
	)
	require.NoError(t, err)
	_, err = messageSvc.RecordMessage(
		ctx(),
		res1.IncidentID,
		"msg2",
		"A",
		"",
		"B",
		"",
		shared.MediumRadio,
		nil,
		testActor,
	)
	require.NoError(t, err)

	// Incident B's counter starts at 1 independently.
	_, err = messageSvc.RecordMessage(
		ctx(),
		res2.IncidentID,
		"msg1-b",
		"C",
		"",
		"D",
		"",
		shared.MediumRadio,
		nil,
		testActor,
	)
	require.NoError(t, err)
}

func TestMessageService_Acknowledgement(t *testing.T) {
	setup := func(t *testing.T) (svc inbound.MessageService, incID shared.IncidentID, msgID shared.MessageID, mapDiv, scDiv shared.DivisionID) {
		t.Helper()

		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		svc = factory.MessageService(messages, incidents)

		res, err := incidentSvc.CreateIncident(ctx(), "Lage", nil,
			[]incident.DivisionData{{Name: "SC", Description: "Stabschef"}}, nil, testActor)
		require.NoError(t, err)

		mapDiv = incident.MessageMapDivisionID(res.IncidentID)

		for _, d := range res.Divisions {
			if d.Kind == shared.DivisionKindStandard {
				scDiv = d.ID
			}
		}

		ms, err := svc.RecordMessage(ctx(), res.IncidentID,
			"Pegel steigt", "Beobachter", "", "Führung", "", shared.MediumRadio, nil, testActor)
		require.NoError(t, err)

		return svc, res.IncidentID, ms.ID, mapDiv, scDiv
	}

	t.Run("acknowledge and revoke return aggregate state", func(t *testing.T) {
		svc, _, msgID, mapDiv, scDiv := setup(t)
		_, err := svc.TriageMessage(ctx(), msgID, shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{mapDiv, scDiv}, nil, testActor)
		require.NoError(t, err)

		state, err := svc.AcknowledgeMessage(ctx(), msgID, mapDiv, testActor)
		require.NoError(t, err)
		require.Len(t, state.Acknowledgements, 1)
		assert.Equal(t, mapDiv, state.Acknowledgements[0].DivisionID)
		assert.Equal(t, testActor.Sub, state.Acknowledgements[0].By)

		state, err = svc.RevokeMessageAcknowledgement(ctx(), msgID, mapDiv, testActor)
		require.NoError(t, err)
		assert.Empty(t, state.Acknowledgements)
	})

	t.Run("a division the message is not triaged to cannot acknowledge", func(t *testing.T) {
		svc, _, msgID, mapDiv, scDiv := setup(t)
		_, err := svc.TriageMessage(ctx(), msgID, shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{scDiv}, nil, testActor)
		require.NoError(t, err)

		_, err = svc.AcknowledgeMessage(ctx(), msgID, mapDiv, testActor)
		require.ErrorIs(t, err, shared.ErrNotTriagedToDivision)
	})

	t.Run("a division of another incident is rejected", func(t *testing.T) {
		svc, _, msgID, _, _ := setup(t)

		_, err := svc.AcknowledgeMessage(ctx(), msgID, shared.DivisionID(newID()), testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("re-triage drops the acknowledgement", func(t *testing.T) {
		svc, _, msgID, mapDiv, scDiv := setup(t)
		_, err := svc.TriageMessage(ctx(), msgID, shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{mapDiv}, nil, testActor)
		require.NoError(t, err)
		_, err = svc.AcknowledgeMessage(ctx(), msgID, mapDiv, testActor)
		require.NoError(t, err)

		state, err := svc.TriageMessage(ctx(), msgID, shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{scDiv}, nil, testActor)
		require.NoError(t, err)
		assert.Empty(t, state.Acknowledgements)
	})

	t.Run("unknown message", func(t *testing.T) {
		svc, _, _, mapDiv, _ := setup(t)

		_, err := svc.AcknowledgeMessage(ctx(), shared.MessageID(newID()), mapDiv, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
}
