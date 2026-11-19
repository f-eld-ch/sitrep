package eventstore_test

import (
	"context"
	"encoding/json/jsontext"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var at = time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC)

// brokenStore fails every call with err.
type brokenStore struct{ err error }

func (s brokenStore) Load(context.Context, string, uuid.UUID) ([]eventsourcing.Event, error) {
	return nil, s.err
}

func (s brokenStore) LoadMany(context.Context, string, []uuid.UUID) (map[uuid.UUID][]eventsourcing.Event, error) {
	return nil, s.err
}

func (s brokenStore) Append(context.Context, eventsourcing.Aggregate) (outbound.Cursor, error) {
	return nil, s.err
}

func (s brokenStore) Read(context.Context, outbound.Cursor, int) ([]eventsourcing.Event, outbound.Cursor, error) {
	return nil, nil, s.err
}

// repoCase exercises one repository through its Load and Save.
type repoCase struct {
	name   string
	prefix string // what the repository puts in front of the error
	load   func(ctx context.Context, store outbound.EventStore, id uuid.UUID) error
	save   func(ctx context.Context, store outbound.EventStore, id uuid.UUID) error
	// seed creates and stores a minimal aggregate with that id.
	seed func(t *testing.T, ctx context.Context, store outbound.EventStore, id uuid.UUID)
}

func repoCases() []repoCase {
	return []repoCase{
		{
			name: "incident", prefix: "incident repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewIncidentRepository(s).Load(ctx, shared.IncidentID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewIncidentRepository(s).Save(ctx, incident.New(shared.IncidentID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := incident.New(shared.IncidentID(id))
				require.NoError(t, a.Open("Hochwasser", nil, nil, at, "sys"))

				_, err := eventstore.NewIncidentRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "message", prefix: "message repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewMessageRepository(s).Load(ctx, shared.MessageID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewMessageRepository(s).Save(ctx, message.New(shared.MessageID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := message.New(shared.MessageID(id))
				require.NoError(t, a.Record(shared.IncidentID(uuid.New()), 1, "c", "s", "", "r", "",
					shared.MediumRadio, at, "sys", at, "sys"))

				_, err := eventstore.NewMessageRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "layer", prefix: "layer repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewLayerRepository(s).Load(ctx, shared.LayerID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewLayerRepository(s).Save(ctx, layer.New(shared.LayerID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := layer.New(shared.LayerID(id))
				require.NoError(t, a.Create(shared.IncidentID(uuid.New()), "Karte", "sys", at))

				_, err := eventstore.NewLayerRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "feature", prefix: "feature repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewFeatureRepository(s).Load(ctx, shared.FeatureID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewFeatureRepository(s).Save(ctx, feature.New(shared.FeatureID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := feature.New(shared.FeatureID(id))
				require.NoError(t, a.Place(shared.IncidentID(uuid.New()), shared.LayerID(uuid.New()),
					map[string]any{"type": "Point", "coordinates": []any{1.0, 2.0}}, map[string]any{},
					feature.ChangeContext{EffectiveAt: at}, "sys", at))

				_, err := eventstore.NewFeatureRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "incident access", prefix: "incident access repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewIncidentAccessRepository(s).Load(ctx, shared.IncidentID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewIncidentAccessRepository(s).
					Save(ctx, access.NewIncidentAccess(shared.IncidentID(id)))

				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := access.NewIncidentAccess(shared.IncidentID(id))
				require.NoError(t, a.Initialize(nil, access.OpenOperational, "sys", at))

				_, err := eventstore.NewIncidentAccessRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "access group", prefix: "access group repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewAccessGroupRepository(s).Load(ctx, id)
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewAccessGroupRepository(s).Save(ctx, access.NewAccessGroup(id))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := access.NewAccessGroup(id)
				require.NoError(t, a.Create("Ops", "", "sys", at))

				_, err := eventstore.NewAccessGroupRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "global access", prefix: "global access repository",
			load: func(ctx context.Context, s outbound.EventStore, _ uuid.UUID) error {
				_, err := eventstore.NewGlobalAccessRepository(s).Load(ctx)
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, _ uuid.UUID) error {
				_, err := eventstore.NewGlobalAccessRepository(s).Save(ctx, access.NewGlobalAccess())
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, _ uuid.UUID) {
				t.Helper()

				a := access.NewGlobalAccess()
				require.NoError(t, a.Initialize("sys", at))

				_, err := eventstore.NewGlobalAccessRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "schadenplatz", prefix: "schadenplatz repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewSchadenplatzRepository(s).Load(ctx, shared.SchadenplatzID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewSchadenplatzRepository(s).Save(ctx, schadenplatz.New(shared.SchadenplatzID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := schadenplatz.New(shared.SchadenplatzID(id))
				require.NoError(t, a.Create(shared.IncidentID(uuid.New()), "Platz", false, "sys", at))

				_, err := eventstore.NewSchadenplatzRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
		{
			name: "resource", prefix: "resource repository",
			load: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewResourceRepository(s).Load(ctx, shared.ResourceID(id))
				return err
			},
			save: func(ctx context.Context, s outbound.EventStore, id uuid.UUID) error {
				_, err := eventstore.NewResourceRepository(s).Save(ctx, resource.New(shared.ResourceID(id)))
				return err
			},
			seed: func(t *testing.T, ctx context.Context, s outbound.EventStore, id uuid.UUID) {
				t.Helper()

				a := resource.New(shared.ResourceID(id))
				require.NoError(t, a.Alert(shared.IncidentID(uuid.New()), shared.SchadenplatzID(uuid.New()),
					resource.FormationFW, "Zug 1", resource.UnitSizeZug, 5, "", nil, nil, nil, "sys", at))

				_, err := eventstore.NewResourceRepository(s).Save(ctx, a)
				require.NoError(t, err)
			},
		},
	}
}

func TestRepositories_LoadAfterSaveAndNotFound(t *testing.T) {
	for _, tc := range repoCases() {
		t.Run(tc.name, func(t *testing.T) {
			ctx := t.Context()
			store := inmem.NewEventStore()
			id := uuid.New()

			err := tc.load(ctx, store, id)
			require.ErrorIs(t, err, shared.ErrNotFound, "nothing stored yet")
			require.ErrorContains(t, err, tc.prefix, "the error names the repository")

			tc.seed(t, ctx, store, id)
			require.NoError(t, tc.load(ctx, store, id))
		})
	}
}

func TestRepositories_StoreFailuresAreWrappedWithTheRepositoryName(t *testing.T) {
	boom := errors.New("store down")

	for _, tc := range repoCases() {
		t.Run(tc.name, func(t *testing.T) {
			store := brokenStore{err: boom}

			err := tc.load(t.Context(), store, uuid.New())
			require.ErrorIs(t, err, boom)
			require.ErrorContains(t, err, tc.prefix+" load")

			err = tc.save(t.Context(), store, uuid.New())
			require.ErrorIs(t, err, boom)
			assert.ErrorContains(t, err, tc.prefix+" save")
		})
	}
}

// replayStore returns a canned stream so a repository has to replay it.
type replayStore struct {
	brokenStore

	events []eventsourcing.Event
}

func (s replayStore) Load(context.Context, string, uuid.UUID) ([]eventsourcing.Event, error) {
	return s.events, nil
}

func (s replayStore) LoadMany(
	_ context.Context,
	_ string,
	ids []uuid.UUID,
) (map[uuid.UUID][]eventsourcing.Event, error) {
	out := map[uuid.UUID][]eventsourcing.Event{}
	for _, id := range ids {
		out[id] = s.events
	}

	return out, nil
}

func TestRepositories_LoadFailsOnAnEventTheAggregateCannotReplay(t *testing.T) {
	unknown := replayStore{events: []eventsourcing.Event{{
		EventType: "NeverRegistered", Version: 1, Data: jsontext.Value(`{}`),
	}}}

	err := repoCases()[0].load(t.Context(), unknown, uuid.New())
	require.ErrorContains(t, err, "unknown event type")
	assert.ErrorContains(t, err, "incident repository load")
}

func TestMessageRepository_LoadMany(t *testing.T) {
	ctx := t.Context()
	store := inmem.NewEventStore()
	repo := eventstore.NewMessageRepository(store)

	first, second, missing := shared.MessageID(uuid.New()), shared.MessageID(uuid.New()), shared.MessageID(uuid.New())

	for _, id := range []shared.MessageID{first, second} {
		m := message.New(id)
		require.NoError(t, m.Record(shared.IncidentID(uuid.New()), 1, "c", "s", "", "r", "",
			shared.MediumRadio, at, "sys", at, "sys"))
		_, err := repo.Save(ctx, m)
		require.NoError(t, err)
	}

	t.Run("loads the existing ones in the requested order and skips the missing", func(t *testing.T) {
		got, err := repo.LoadMany(ctx, []shared.MessageID{second, missing, first})
		require.NoError(t, err)
		require.Len(t, got, 2)
		assert.Equal(t, second, shared.MessageID(got[0].Root().ID()))
		assert.Equal(t, first, shared.MessageID(got[1].Root().ID()))
		assert.Equal(t, 1, got[0].Root().Version(), "the aggregates are rebuilt from their events")
	})

	t.Run("no ids, no messages", func(t *testing.T) {
		got, err := repo.LoadMany(ctx, nil)
		require.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("a store failure is wrapped", func(t *testing.T) {
		boom := errors.New("store down")

		_, err := eventstore.NewMessageRepository(brokenStore{err: boom}).LoadMany(ctx, []shared.MessageID{first})
		require.ErrorIs(t, err, boom)
		assert.ErrorContains(t, err, "message repository load many")
	})

	t.Run("an event that cannot be replayed names the message", func(t *testing.T) {
		unknown := replayStore{events: []eventsourcing.Event{{
			EventType: "NeverRegistered", Version: 1, Data: jsontext.Value(`{}`),
		}}}

		_, err := eventstore.NewMessageRepository(unknown).LoadMany(ctx, []shared.MessageID{first})
		require.ErrorContains(t, err, "unknown event type")
		assert.ErrorContains(t, err, first.String())
	})
}
