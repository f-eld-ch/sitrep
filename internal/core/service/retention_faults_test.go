package service_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// retentionRig runs the retention service on incidents whose repository can fail.
type retentionRig struct {
	incidentRig

	retention *retentionStore
	blobs     *failingBlobs
	svc       *service.RetentionService
}

func newRetentionRig(t *testing.T) retentionRig {
	t.Helper()

	r := newIncidentRig(t)
	blobs := &failingBlobs{memBlobStore: newMemBlobStore(0)}
	retention := &retentionStore{}

	return retentionRig{
		incidentRig: r,
		retention:   retention,
		blobs:       blobs,
		svc: service.NewRetentionService(inmem.NewTransactor(), r.incidents, retention, fixedClock{t: testAt}, inmem.NewNotifier()).
			WithBlobStore(blobs),
	}
}

func TestRetentionService_AutoClose_Failures(t *testing.T) {
	t.Run("an incident that cannot be found stops the run", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.openIDs = []shared.IncidentID{shared.IncidentID(newID())}

		result, err := r.svc.Run(ctx(), 30, 0)
		require.ErrorIs(t, err, shared.ErrNotFound)
		assert.Zero(t, result.Closed)
	})

	t.Run("an incident that cannot be saved stops the run", func(t *testing.T) {
		r := newRetentionRig(t)
		first, second := r.create(t, "Eins"), r.create(t, "Zwei")
		r.retention.openIDs = []shared.IncidentID{first, second}
		r.incidents.save = errBoom
		r.incidents.saves = 0

		result, err := r.svc.Run(ctx(), 30, 0)
		require.ErrorIs(t, err, errBoom)
		assert.Zero(t, result.Closed, "what was not saved was not closed")
		assert.Equal(t, 1, r.incidents.saves, "the run stops at the first failure")
	})

	t.Run("an incident closes by timeout", func(t *testing.T) {
		r := newRetentionRig(t)
		id := r.create(t, "Eins")
		r.retention.openIDs = []shared.IncidentID{id}

		result, err := r.svc.Run(ctx(), 30, 0)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Closed)

		loaded, err := r.incidents.IncidentRepository.Load(ctx(), id)
		require.NoError(t, err)
		assert.True(t, loaded.IsClosed())
	})
}

func TestRetentionService_Archive_Failures(t *testing.T) {
	t.Run("the candidates cannot be listed", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveBeforeErr = errBoom

		_, err := r.svc.Run(ctx(), 0, 730)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("an incident that cannot be found stops the run", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveIDs = []shared.IncidentID{shared.IncidentID(newID())}

		result, err := r.svc.Run(ctx(), 0, 730)
		require.ErrorIs(t, err, shared.ErrNotFound)
		assert.Zero(t, result.Archived)
	})

	t.Run("an incident that is still open is not archived", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveIDs = []shared.IncidentID{r.create(t, "Offen")}

		result, err := r.svc.Run(ctx(), 0, 730)
		require.NoError(t, err)
		assert.Zero(t, result.Archived)
		assert.Empty(t, r.retention.archived)
	})

	t.Run("a closed incident that cannot be marked deleted is not archived", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveIDs = []shared.IncidentID{r.closed(t, "Zu")}
		r.incidents.save = errBoom

		result, err := r.svc.Run(ctx(), 0, 730)
		require.ErrorIs(t, err, errBoom)
		assert.Zero(t, result.Archived)
		assert.Empty(t, r.retention.archived)
	})

	t.Run("a closed incident is deleted and archived, and its blobs go", func(t *testing.T) {
		r := newRetentionRig(t)
		id := r.closed(t, "Zu")
		r.retention.archiveIDs = []shared.IncidentID{id}

		require.NoError(t, r.blobs.Put(ctx(), "incidents/"+id.String()+"/a", strings.NewReader("x"), 1, "text/plain"))
		require.NoError(t, r.blobs.Put(ctx(), "incidents/other/a", strings.NewReader("y"), 1, "text/plain"))

		result, err := r.svc.Run(ctx(), 0, 730)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Archived)

		loaded, err := r.incidents.IncidentRepository.Load(ctx(), id)
		require.NoError(t, err)
		assert.True(t, loaded.IsDeleted())
		assert.Equal(t, 1, r.blobs.count(), "only the blobs of this incident are removed")
	})

	t.Run("blobs that cannot be removed do not undo the archive", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveIDs = []shared.IncidentID{r.closed(t, "Zu")}
		r.blobs.prefixErr = errBoom

		result, err := r.svc.Run(ctx(), 0, 730)
		require.NoError(t, err)
		assert.Equal(t, 1, result.Archived)
	})

	t.Run("an archive that fails is reported", func(t *testing.T) {
		r := newRetentionRig(t)
		r.retention.archiveIDs = []shared.IncidentID{r.closed(t, "Zu")}
		r.retention.archiveErr = errBoom

		result, err := r.svc.Run(ctx(), 0, 730)
		require.ErrorIs(t, err, errBoom)
		assert.Zero(t, result.Archived)
	})
}
