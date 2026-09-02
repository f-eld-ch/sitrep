package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

type retentionStore struct {
	openIDs    []shared.IncidentID
	archiveIDs []shared.IncidentID
	archived   []shared.IncidentID
}

func (s *retentionStore) OpenBefore(_ context.Context, _ time.Time, _ int) ([]shared.IncidentID, error) {
	return s.openIDs, nil
}

func (s *retentionStore) ArchiveBefore(_ context.Context, _, _ time.Time, _ int) ([]shared.IncidentID, error) {
	return s.archiveIDs, nil
}

func (s *retentionStore) Archive(_ context.Context, id shared.IncidentID, _ time.Time) error {
	s.archived = append(s.archived, id)
	return nil
}

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
