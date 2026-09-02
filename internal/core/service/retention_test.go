package service_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

type retentionStore struct {
	openIDs              []shared.IncidentID
	archiveIDs           []shared.IncidentID
	archived             []shared.IncidentID
	openBefore           time.Time
	closedBefore         time.Time
	deletedBefore        time.Time
	batchSize            int
	openBeforeErr        error
	archiveBeforeErr     error
	archiveErr           error
	archiveErrAfterCalls int
}

func (s *retentionStore) OpenBefore(_ context.Context, before time.Time, limit int) ([]shared.IncidentID, error) {
	s.openBefore = before
	s.batchSize = limit
	return s.openIDs, s.openBeforeErr
}

func (s *retentionStore) ArchiveBefore(_ context.Context, closedBefore, deletedBefore time.Time, limit int) ([]shared.IncidentID, error) {
	s.closedBefore = closedBefore
	s.deletedBefore = deletedBefore
	s.batchSize = limit
	return s.archiveIDs, s.archiveBeforeErr
}

func (s *retentionStore) Archive(_ context.Context, id shared.IncidentID, _ time.Time) error {
	if s.archiveErr != nil && len(s.archived) == s.archiveErrAfterCalls {
		return s.archiveErr
	}
	s.archived = append(s.archived, id)
	return nil
}

type failingNotifier struct{ err error }

func (n failingNotifier) Notify(context.Context) error { return n.err }
func (n failingNotifier) Wait(context.Context) error   { return nil }

func TestRetentionService_Run(t *testing.T) {
	factory, store := testStack(t)
	incidents := eventstore.NewIncidentRepository(store)
	layers := eventstore.NewLayerRepository(store)
	incidentSvc := factory.IncidentService(incidents, layers)

	open, err := incidentSvc.CreateIncident(ctx(), "Open", nil, nil, nil, testActor)
	require.NoError(t, err)
	closed, err := incidentSvc.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), closed.IncidentID, testActor)
	require.NoError(t, err)

	retention := &retentionStore{openIDs: []shared.IncidentID{open.IncidentID}, archiveIDs: []shared.IncidentID{closed.IncidentID}}
	svc := service.NewRetentionService(inmem.NewTransactor(), incidents, retention, fixedClock{t: testAt}, inmem.NewNotifier())

	result, err := svc.Run(ctx(), 30, 365)

	require.NoError(t, err)
	assert.Equal(t, 1, result.Closed)
	assert.Equal(t, 1, result.Archived)
	assert.Equal(t, []shared.IncidentID{closed.IncidentID}, retention.archived)
	openIncident, err := incidents.Load(ctx(), open.IncidentID)
	require.NoError(t, err)
	assert.True(t, openIncident.IsClosed())
	events, err := store.Load(ctx(), "Incident", uuid.UUID(open.IncidentID))
	require.NoError(t, err)
	require.NotEmpty(t, events)
	var closedEvent struct{ Reason shared.CloseReason }
	require.NoError(t, json.Unmarshal(events[len(events)-1].Data.(json.RawMessage), &closedEvent))
	assert.Equal(t, shared.ReasonAutoTimeout, closedEvent.Reason)
	assert.Equal(t, testAt.AddDate(0, 0, -30), retention.openBefore)
	assert.Equal(t, testAt.AddDate(0, 0, -365), retention.closedBefore)
	assert.Equal(t, testAt.Add(-7*24*time.Hour), retention.deletedBefore)
	assert.Equal(t, 100, retention.batchSize)
}

func TestRetentionService_HandlesCandidateAndNotifierFailures(t *testing.T) {
	t.Run("returns candidate lookup errors", func(t *testing.T) {
		wantErr := errors.New("candidate lookup failed")
		retention := &retentionStore{openBeforeErr: wantErr}
		svc := service.NewRetentionService(inmem.NewTransactor(), eventstore.NewIncidentRepository(inmem.NewEventStore()), retention, fixedClock{t: testAt}, inmem.NewNotifier())

		_, err := svc.Run(ctx(), 30, 0)

		require.ErrorIs(t, err, wantErr)
	})

	t.Run("returns notifier errors after completed retention", func(t *testing.T) {
		factory, store := testStack(t)
		incidents := eventstore.NewIncidentRepository(store)
		layers := eventstore.NewLayerRepository(store)
		incidentSvc := factory.IncidentService(incidents, layers)
		incident, err := incidentSvc.CreateIncident(ctx(), "Open", nil, nil, nil, testActor)
		require.NoError(t, err)
		wantErr := errors.New("notify failed")
		svc := service.NewRetentionService(inmem.NewTransactor(), incidents,
			&retentionStore{openIDs: []shared.IncidentID{incident.IncidentID}}, fixedClock{t: testAt}, failingNotifier{err: wantErr})

		result, err := svc.Run(ctx(), 30, 0)

		require.ErrorIs(t, err, wantErr)
		assert.Equal(t, 1, result.Closed)
	})
}

func TestRetentionService_ReturnsPartialArchiveResult(t *testing.T) {
	factory, store := testStack(t)
	incidents := eventstore.NewIncidentRepository(store)
	layers := eventstore.NewLayerRepository(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	first, err := incidentSvc.CreateIncident(ctx(), "First", nil, nil, nil, testActor)
	require.NoError(t, err)
	second, err := incidentSvc.CreateIncident(ctx(), "Second", nil, nil, nil, testActor)
	require.NoError(t, err)
	for _, id := range []shared.IncidentID{first.IncidentID, second.IncidentID} {
		_, err = incidentSvc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)
	}

	wantErr := errors.New("archive failed")
	retention := &retentionStore{
		archiveIDs:           []shared.IncidentID{first.IncidentID, second.IncidentID},
		archiveErr:           wantErr,
		archiveErrAfterCalls: 1,
	}
	svc := service.NewRetentionService(inmem.NewTransactor(), incidents, retention, fixedClock{t: testAt}, inmem.NewNotifier())

	result, err := svc.Run(ctx(), 0, 730)

	require.ErrorIs(t, err, wantErr)
	assert.Equal(t, 1, result.Archived)
	assert.Equal(t, []shared.IncidentID{first.IncidentID}, retention.archived)
}

func TestRetentionService_SkipsStaleCandidates(t *testing.T) {
	factory, store := testStack(t)
	incidents := eventstore.NewIncidentRepository(store)
	layers := eventstore.NewLayerRepository(store)
	incidentSvc := factory.IncidentService(incidents, layers)
	closed, err := incidentSvc.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), closed.IncidentID, testActor)
	require.NoError(t, err)

	retention := &retentionStore{openIDs: []shared.IncidentID{closed.IncidentID}}
	svc := service.NewRetentionService(inmem.NewTransactor(), incidents, retention, fixedClock{t: testAt}, inmem.NewNotifier())

	result, err := svc.Run(ctx(), 30, 0)

	require.NoError(t, err)
	assert.Zero(t, result.Closed)
}

func TestRetentionService_ArchivesManuallyDeletedIncident(t *testing.T) {
	factory, store := testStack(t)
	incidents := eventstore.NewIncidentRepository(store)
	layers := eventstore.NewLayerRepository(store)
	incidentSvc := factory.IncidentService(incidents, layers)

	incident, err := incidentSvc.CreateIncident(ctx(), "Deleted", nil, nil, nil, testActor)
	require.NoError(t, err)
	_, err = incidentSvc.CloseIncident(ctx(), incident.IncidentID, testActor)
	require.NoError(t, err)
	require.NoError(t, incidentSvc.DeleteIncident(ctx(), incident.IncidentID, testActor))

	retention := &retentionStore{archiveIDs: []shared.IncidentID{incident.IncidentID}}
	svc := service.NewRetentionService(inmem.NewTransactor(), incidents, retention, fixedClock{t: testAt}, inmem.NewNotifier())

	result, err := svc.Run(ctx(), 0, 730)

	require.NoError(t, err)
	assert.Equal(t, 1, result.Archived)
	assert.Equal(t, []shared.IncidentID{incident.IncidentID}, retention.archived)
}

func TestRetentionService_ZeroDisablesPolicies(t *testing.T) {
	retention := &retentionStore{}
	svc := service.NewRetentionService(inmem.NewTransactor(), eventstore.NewIncidentRepository(inmem.NewEventStore()), retention, fixedClock{t: testAt}, inmem.NewNotifier())

	result, err := svc.Run(ctx(), 0, 0)

	require.NoError(t, err)
	assert.Equal(t, service.RetentionResult{}, result)
	assert.Empty(t, retention.archived)
}
