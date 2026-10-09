package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var errBoom = errors.New("boom")

// failingQueries lists streams to replay, or fails doing so.
type failingQueries struct {
	outbound.Queries
	resources     []*outbound.ResourceRM
	schadenplatz  []*outbound.SchadenplatzRM
	listingFailed bool
}

func (q failingQueries) ListResourcesForIncident(context.Context, uuid.UUID) ([]*outbound.ResourceRM, error) {
	if q.listingFailed {
		return nil, errBoom
	}

	return q.resources, nil
}

func (q failingQueries) ListAllSchadenplaetze(context.Context, uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	if q.listingFailed {
		return nil, errBoom
	}

	return q.schadenplatz, nil
}

// failingStore cannot load any stream.
type failingStore struct{ outbound.EventStore }

func (failingStore) LoadMany(context.Context, string, []uuid.UUID) (map[uuid.UUID][]eventsourcing.Event, error) {
	return nil, errBoom
}

func TestTimelineService_ReportsFailures(t *testing.T) {
	incidentID := shared.IncidentID(uuid.New())
	asOf := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

	t.Run("a failing read model", func(t *testing.T) {
		timeline := service.NewTimelineService(failingStore{}, failingQueries{listingFailed: true})

		_, err := timeline.ResourcesAsOf(t.Context(), incidentID, asOf)
		require.ErrorIs(t, err, errBoom)

		_, err = timeline.SchadenplaetzeAsOf(t.Context(), incidentID, asOf)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("a stream that cannot be loaded", func(t *testing.T) {
		timeline := service.NewTimelineService(failingStore{}, failingQueries{
			resources:    []*outbound.ResourceRM{{ID: uuid.New()}},
			schadenplatz: []*outbound.SchadenplatzRM{{ID: uuid.New()}},
		})

		_, err := timeline.ResourcesAsOf(t.Context(), incidentID, asOf)
		require.ErrorIs(t, err, errBoom)

		_, err = timeline.SchadenplaetzeAsOf(t.Context(), incidentID, asOf)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("nothing to replay gives an empty answer, not an error", func(t *testing.T) {
		timeline := service.NewTimelineService(failingStore{}, failingQueries{})

		resources, err := timeline.ResourcesAsOf(t.Context(), incidentID, asOf)
		require.NoError(t, err)
		assert.Empty(t, resources)
	})
}
