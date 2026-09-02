package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
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

	_, err = messageSvc.TriageMessage(ctx(), ms.ID, shared.TriageDone, shared.PriorityHigh, nil, testActor)
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
	_, err = messageSvc.TriageMessage(ctx(), msg.ID, shared.TriageDone, shared.PriorityHigh, nil, testActor)
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
