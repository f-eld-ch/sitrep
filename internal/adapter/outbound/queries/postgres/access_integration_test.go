//go:build integration

package postgres_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

const (
	alice = "sub|alice" // owner of the restricted incident
	bob   = "sub|bob"   // no grant at all
	carol = "sub|carol" // viewer of the restricted incident
)

// world is a database with one restricted incident, one open incident and a restricted
// child of the open one, all projected, plus queries that enforce access.
type world struct {
	queries    *postgres.Queries
	restricted uuid.UUID // owner alice, viewer carol
	open       uuid.UUID // open_operational
	child      uuid.UUID // restricted child of the open incident, owner alice
}

func newWorld(t *testing.T) *world {
	t.Helper()

	ctx := t.Context()
	pool := pgtest.Pool(t)

	store := pgstore.NewEventStore(pool)
	tx := pgstore.NewTransactor(pool)
	notifier := pgstore.NewNotifier(pool, "events")

	proj := pgprojection.NewProjector(pool, store, notifier, []pgprojection.Handler{
		pgprojection.NewIncidentHandler(pool),
		pgprojection.NewAccessHandler(pool),
	})

	w := &world{
		queries: postgres.NewQueries(pool, pgstore.NewIncidentAccessChecker(pool)),
	}

	now := time.Now().UTC()

	create := func(name string, mode access.IncidentMode, owner string, parent *uuid.UUID, viewers ...string) uuid.UUID {
		t.Helper()

		id := shared.IncidentID(uuid.New())

		inc := incident.New(id)
		require.NoError(t, inc.Open(name, nil, nil, now, "sys"))

		if parent != nil {
			require.NoError(t, inc.LinkParent(shared.IncidentID(*parent), "sys", now))
		}

		acc := access.NewIncidentAccess(id)
		require.NoError(t, acc.Initialize(&owner, mode, "sys", now))

		for _, v := range viewers {
			require.NoError(
				t,
				acc.GrantRole(access.Principal{Kind: access.UserPrincipal, ID: v}, access.Viewer, "sys", now),
			)
		}

		require.NoError(t, tx.WithinTx(ctx, func(ctx context.Context) error {
			if _, err := store.Append(ctx, inc); err != nil {
				return err
			}

			_, err := store.Append(ctx, acc)

			return err
		}))

		return uuid.UUID(id)
	}

	w.restricted = create("Restricted", access.Restricted, alice, nil, carol)
	w.open = create("Open", access.OpenOperational, alice, nil)
	w.child = create("Child of open", access.Restricted, alice, &w.open)

	require.NoError(t, proj.CatchUp(ctx))

	return w
}

func as(t *testing.T, sub string) context.Context {
	t.Helper()

	return identity.WithActor(t.Context(), identity.Actor{Sub: sub})
}

func TestQueries_ListIncidents_FiltersByAccess(t *testing.T) {
	w := newWorld(t)

	ids := func(sub string) []uuid.UUID {
		got, err := w.queries.ListIncidents(as(t, sub))
		require.NoError(t, err)

		out := make([]uuid.UUID, 0, len(got))
		for _, i := range got {
			out = append(out, i.ID)
		}

		return out
	}

	assert.ElementsMatch(t, []uuid.UUID{w.restricted, w.open, w.child}, ids(alice), "the owner sees everything")
	assert.ElementsMatch(
		t,
		[]uuid.UUID{w.restricted, w.open},
		ids(carol),
		"a viewer sees what was shared with them and open incidents",
	)
	assert.ElementsMatch(t, []uuid.UUID{w.open}, ids(bob), "a user without grants sees only open incidents")
}

func TestQueries_ListIncidents_RequiresActor(t *testing.T) {
	w := newWorld(t)

	_, err := w.queries.ListIncidents(t.Context())
	require.Error(t, err, "listing without an authenticated actor must not return data")
}

func TestQueries_GetIncident_HidesRestricted(t *testing.T) {
	w := newWorld(t)

	got, err := w.queries.GetIncident(as(t, carol), w.restricted)
	require.NoError(t, err)
	assert.Equal(t, w.restricted, got.ID)

	_, err = w.queries.GetIncident(as(t, bob), w.restricted)
	require.ErrorIs(t, err, shared.ErrNotFound, "an unlisted user must not learn that the incident exists")

	_, err = w.queries.GetIncident(as(t, bob), w.open)
	require.NoError(t, err, "open incidents are readable by every authenticated user")
}

func TestQueries_ListMessages_DeniesWithoutRead(t *testing.T) {
	w := newWorld(t)

	msgs, err := w.queries.ListMessages(as(t, carol), w.restricted)
	require.NoError(t, err)
	assert.Empty(t, msgs)

	_, err = w.queries.ListMessages(as(t, bob), w.restricted)
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = w.queries.ListMessages(t.Context(), w.open)
	require.ErrorIs(t, err, shared.ErrNotFound, "without an actor nothing is readable, not even an open incident")
}

func TestQueries_ListVisibleLayers_DeniesWithoutRead(t *testing.T) {
	w := newWorld(t)

	_, err := w.queries.ListVisibleLayers(as(t, bob), w.restricted)
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = w.queries.ListVisibleLayers(as(t, bob), w.open)
	require.NoError(t, err)
}

func TestQueries_ListChildIncidents_HidesUnreadableChildren(t *testing.T) {
	w := newWorld(t)

	children, err := w.queries.ListChildIncidents(as(t, alice), w.open)
	require.NoError(t, err)
	require.Len(t, children, 1)
	assert.Equal(t, w.child, children[0].ID)

	children, err = w.queries.ListChildIncidents(as(t, bob), w.open)
	require.NoError(t, err)
	assert.Empty(t, children, "a restricted child is not listed for a user without a grant on it")
}
