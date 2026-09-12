package conformance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// RunProjection runs the projection sub-suite.
func RunProjection(t *testing.T, f Factory) {
	t.Helper()

	if f(t).Project == nil {
		t.Skip("backend does not provide Project func")
	}

	t.Run("Incident_Created_Visible", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("Alpha Incident", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, inc)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, uuid.UUID(id), list[0].ID)
		assert.Equal(t, "Alpha Incident", list[0].Name)
	})

	t.Run("Incident_Renamed_Reflected", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		repo := eventstore.NewIncidentRepository(b.Store)

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("Original", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, inc)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		// Rename via the repository so rehydration is handled correctly.
		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			loaded, err := repo.Load(ctx, id)
			if err != nil {
				return err
			}

			if err := loaded.Rename("Renamed", "sys", time.Now().UTC()); err != nil {
				return err
			}

			_, err = b.Store.Append(ctx, loaded)

			return err
		}))
		require.NoError(t, b.Project(ctx))

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, "Renamed", list[0].Name)
	})

	t.Run("Reset_RebuildsIdenticalState", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("Reset Test", nil, nil, time.Now().UTC(), "sys"))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, inc)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		before, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		require.Len(t, before, 1)

		require.NoError(t, b.ResetProjections(ctx))

		after, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		require.Len(t, after, 1)
		assert.Equal(t, before[0].ID, after[0].ID)
		assert.Equal(t, before[0].Name, after[0].Name)
	})

	t.Run("Idempotent_SameEventTwice", func(t *testing.T) {
		b := f(t)
		if b.ApplyEvent == nil {
			t.Skip("backend does not provide ApplyEvent")
		}

		ctx := t.Context()
		id := uuid.New()
		e := rawEvent("Incident", id, "Opened", 1, struct {
			Name string `json:"name"`
		}{Name: "Idempotent"})

		require.NoError(t, b.ApplyEvent(ctx, "readmodel.incident", e))
		require.NoError(t, b.ApplyEvent(ctx, "readmodel.incident", e))

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		assert.Len(t, list, 1, "applying the same event twice must not duplicate the row")
	})

	t.Run("MultipleIncidents_OrderedNewestFirst", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		names := []string{"First", "Second", "Third"}
		for _, name := range names {
			id := shared.IncidentID(uuid.New())
			inc := incident.New(id)
			require.NoError(t, inc.Open(name, nil, nil, time.Now().UTC(), "sys"))

			require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
				_, err := b.Store.Append(ctx, inc)
				return err
			}))

			time.Sleep(time.Millisecond)
		}

		require.NoError(t, b.Project(ctx))

		list, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)
		require.Len(t, list, 3)

		// ListIncidents returns newest first.
		assert.Equal(t, "Third", list[0].Name)
		assert.Equal(t, "First", list[2].Name)
	})
}

// ensure eventstore is used
var _ *eventstore.IncidentRepository
