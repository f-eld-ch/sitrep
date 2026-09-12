package conformance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// RunQueries runs the read-model query sub-suite.
func RunQueries(t *testing.T, f Factory) {
	t.Helper()

	b := f(t)
	if b.Queries == nil || b.Project == nil {
		t.Skip("backend does not provide Queries or Project func")
	}

	t.Run("ListIncidents_Empty", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		assert.Empty(t, list)
	})

	t.Run("GetIncident_NotFound", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		_, err := b.Queries.GetIncident(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("GetIncident_AfterProjection", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		id := openIncident(t, b, ctx, "Bravo Incident")

		rm, err := b.Queries.GetIncident(ctx, id)
		require.NoError(t, err)
		require.NotNil(t, rm)
		assert.Equal(t, "Bravo Incident", rm.Name)
		assert.Equal(t, id, rm.ID)
	})

	t.Run("ListIncidents_DeletedExcluded", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		repo := incidentRepo(b)

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("ToDelete", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, inc)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		// Close first (Delete requires prior Close).
		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			loaded, err := repo.Load(ctx, id)
			if err != nil {
				return err
			}

			if err := loaded.Close(shared.ReasonManual, "sys", time.Now().UTC()); err != nil {
				return err
			}

			_, err = b.Store.Append(ctx, loaded)

			return err
		}))
		require.NoError(t, b.Project(ctx))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			loaded, err := repo.Load(ctx, id)
			if err != nil {
				return err
			}

			if err := loaded.Delete(shared.DeleteReasonManual, "sys", time.Now().UTC()); err != nil {
				return err
			}

			_, err = b.Store.Append(ctx, loaded)

			return err
		}))
		require.NoError(t, b.Project(ctx))

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		assert.Empty(t, list, "deleted incidents must not appear in ListIncidents")
	})

	t.Run("ListMessages_Empty", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		id := openIncident(t, b, ctx, "Msg Incident")

		msgs, err := b.Queries.ListMessages(ctx, id)
		require.NoError(t, err)
		assert.Empty(t, msgs)
	})

	t.Run("ListChildIncidents", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		repo := incidentRepo(b)

		parentID := shared.IncidentID(uuid.New())
		parent := incident.New(parentID)
		require.NoError(t, parent.Open("Parent", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, parent)
			return err
		}))

		childID := shared.IncidentID(uuid.New())
		child := incident.New(childID)
		require.NoError(t, child.Open("Child", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, child)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		// Link child to parent.
		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			loaded, err := repo.Load(ctx, childID)
			if err != nil {
				return err
			}

			if err := loaded.LinkParent(parentID, "sys", time.Now().UTC()); err != nil {
				return err
			}

			_, err = b.Store.Append(ctx, loaded)

			return err
		}))
		require.NoError(t, b.Project(ctx))

		children, err := b.Queries.ListChildIncidents(ctx, uuid.UUID(parentID))
		require.NoError(t, err)
		require.Len(t, children, 1)
		assert.Equal(t, uuid.UUID(childID), children[0].ID)
	})
}

// openIncident creates an incident, appends it, projects, and returns its ID.
func openIncident(t *testing.T, b *Backend, ctx context.Context, name string) uuid.UUID {
	t.Helper()

	id := shared.IncidentID(uuid.New())
	inc := incident.New(id)
	require.NoError(t, inc.Open(name, nil, nil, time.Now().UTC(), "sys"))

	require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
		_, err := b.Store.Append(ctx, inc)
		return err
	}))

	require.NoError(t, b.Project(ctx))

	return uuid.UUID(id)
}

// incidentRepo builds a shared repository from the backend's event store.
func incidentRepo(b *Backend) interface {
	Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error)
} {
	return incidentRepoAdapter{store: b.Store}
}

type incidentRepoAdapter struct{ store outbound.EventStore }

func (r incidentRepoAdapter) Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	inc := incident.New(id)

	events, err := r.store.Load(ctx, "Incident", uuid.UUID(id))
	if err != nil {
		return nil, err
	}

	for _, e := range events {
		if err := eventsourcing.Apply(inc, e); err != nil {
			return nil, err
		}
	}

	inc.Root().ClearPending()

	return inc, nil
}
