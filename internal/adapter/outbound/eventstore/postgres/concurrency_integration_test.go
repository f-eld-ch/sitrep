//go:build integration

package postgres_test

import (
	"context"
	"os"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

// How long a test waits to see that something does NOT happen (a blocked lock).
const blockedFor = 300 * time.Millisecond

func newIncident(
	t *testing.T,
	store *postgres.EventStore,
	tx *postgres.Transactor,
	parent *uuid.UUID,
) shared.IncidentID {
	t.Helper()

	id := shared.IncidentID(uuid.New())
	inc := incident.New(id)

	require.NoError(t, inc.Open("incident", nil, nil, time.Now().UTC(), "sys"))

	if parent != nil {
		require.NoError(t, inc.LinkParent(shared.IncidentID(*parent), "sys", time.Now().UTC()))
	}

	require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := store.Append(ctx, inc)

		return err
	}))

	return id
}

func load(t *testing.T, store *postgres.EventStore, id shared.IncidentID) *incident.Incident {
	t.Helper()

	events, err := store.Load(t.Context(), "Incident", uuid.UUID(id))
	require.NoError(t, err)

	inc := incident.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(inc, e))
	}

	inc.Root().ClearPending()

	return inc
}

func TestEventStore_ConcurrentWritersOnOneStream_OneWins(t *testing.T) {
	pool := pgtest.Pool(t)
	store := postgres.NewEventStore(pool)
	tx := postgres.NewTransactor(pool)
	id := newIncident(t, store, tx, nil)

	// Two writers load the same version and each renames the incident.
	a, b := load(t, store, id), load(t, store, id)
	require.NoError(t, a.Rename("from a", "a", time.Now().UTC()))
	require.NoError(t, b.Rename("from b", "b", time.Now().UTC()))

	errs := make([]error, 2)

	var wg sync.WaitGroup

	for i, inc := range []*incident.Incident{a, b} {
		wg.Go(func() {
			errs[i] = tx.WithinTx(t.Context(), func(ctx context.Context) error {
				_, err := store.Append(ctx, inc)

				return err
			})
		})
	}

	wg.Wait()

	failed := 0

	for _, err := range errs {
		if err != nil {
			failed++

			require.ErrorIs(t, err, shared.ErrConflict)
			assert.True(t, postgres.IsConflict(err), "the conflict must be recognisable to the caller")
		}
	}

	assert.Equal(t, 1, failed, "exactly one of two writers on the same version must lose")
}

func TestMessageCounter_ConcurrentWritersGetGaplessNumbers(t *testing.T) {
	pool := pgtest.Pool(t)
	tx := postgres.NewTransactor(pool)
	counter := postgres.NewMessageCounter()
	id := shared.IncidentID(uuid.New())

	const writers = 25

	var (
		mu      sync.Mutex
		numbers []int
		wg      sync.WaitGroup
	)

	for range writers {
		wg.Go(func() {
			err := tx.WithinTx(t.Context(), func(ctx context.Context) error {
				n, err := counter.Next(ctx, id)
				if err != nil {
					return err
				}

				mu.Lock()

				numbers = append(numbers, n)
				mu.Unlock()

				return nil
			})
			assert.NoError(t, err)
		})
	}

	wg.Wait()

	sort.Ints(numbers)

	want := make([]int, writers)
	for i := range want {
		want[i] = i + 1
	}

	assert.Equal(t, want, numbers, "message numbers must be 1..N without gaps or duplicates")
}

func TestMessageCounter_NumbersAreSeparatePerIncident(t *testing.T) {
	pool := pgtest.Pool(t)
	tx := postgres.NewTransactor(pool)
	counter := postgres.NewMessageCounter()

	next := func(id shared.IncidentID) int {
		var n int

		require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
			var err error

			n, err = counter.Next(ctx, id)

			return err
		}))

		return n
	}

	a, b := shared.IncidentID(uuid.New()), shared.IncidentID(uuid.New())

	assert.Equal(t, 1, next(a))
	assert.Equal(t, 2, next(a))
	assert.Equal(t, 1, next(b))
}

func TestMessageCounter_RollbackLeavesNoGap(t *testing.T) {
	pool := pgtest.Pool(t)
	tx := postgres.NewTransactor(pool)
	counter := postgres.NewMessageCounter()
	id := shared.IncidentID(uuid.New())

	errFail := assert.AnError

	err := tx.WithinTx(t.Context(), func(ctx context.Context) error {
		n, err := counter.Next(ctx, id)
		require.NoError(t, err)
		assert.Equal(t, 1, n)

		return errFail
	})
	require.ErrorIs(t, err, errFail)

	require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
		n, err := counter.Next(ctx, id)
		require.NoError(t, err)
		assert.Equal(t, 1, n, "a rolled-back write must not consume a message number")

		return nil
	}))
}

func TestMessageCounter_RequiresTransaction(t *testing.T) {
	_ = pgtest.Pool(t)

	_, err := postgres.NewMessageCounter().Next(t.Context(), shared.IncidentID(uuid.New()))
	require.Error(t, err, "outside a transaction the counter cannot lock, so it must refuse")
}

// lockGuard is what the hierarchy guard and the access guard have in common.
type lockGuard interface {
	LockForUpdate(ctx context.Context) (func(), error)
}

// holdLock acquires the guard inside a transaction and keeps the transaction open until release is closed.
// It returns a channel that is closed once the lock is held.
func holdLock(
	t *testing.T, tx *postgres.Transactor, g lockGuard, release <-chan struct{},
) (held <-chan struct{}, done <-chan error) {
	t.Helper()

	h, d := make(chan struct{}), make(chan error, 1)

	go func() {
		d <- tx.WithinTx(t.Context(), func(ctx context.Context) error {
			if _, err := g.LockForUpdate(ctx); err != nil {
				return err
			}

			close(h)
			<-release

			return nil
		})
	}()

	return h, d
}

func TestGuards_SecondTransactionWaitsForTheFirst(t *testing.T) {
	pool := pgtest.Pool(t)
	tx := postgres.NewTransactor(pool)

	guards := map[string]func() lockGuard{
		"hierarchy": func() lockGuard { return postgres.NewIncidentHierarchyGuard() },
		"access":    func() lockGuard { return postgres.NewAccessGuard() },
	}

	for name, newGuard := range guards {
		t.Run(name, func(t *testing.T) {
			release := make(chan struct{})
			releaseOnce := sync.OnceFunc(func() { close(release) })

			// A failing assertion must not leave the first transaction open: that would block the
			// pool shutdown and hang the whole package.
			t.Cleanup(releaseOnce)

			held, firstDone := holdLock(t, tx, newGuard(), release)

			<-held

			// A second writer asks for the same lock while the first still holds it.
			second := make(chan struct{})

			go func() {
				defer close(second)

				_ = tx.WithinTx(t.Context(), func(ctx context.Context) error {
					_, err := newGuard().LockForUpdate(ctx)

					return err
				})
			}()

			select {
			case <-second:
				t.Fatal("the second transaction got the lock while the first still held it")
			case <-time.After(blockedFor):
			}

			releaseOnce()
			require.NoError(t, <-firstDone)

			select {
			case <-second:
			case <-time.After(10 * time.Second):
				t.Fatal("the second transaction never got the lock after the first committed")
			}
		})
	}
}

func TestGuards_AreIndependentOfEachOther(t *testing.T) {
	pool := pgtest.Pool(t)
	tx := postgres.NewTransactor(pool)

	release := make(chan struct{})
	releaseOnce := sync.OnceFunc(func() { close(release) })

	t.Cleanup(releaseOnce)

	held, firstDone := holdLock(t, tx, postgres.NewIncidentHierarchyGuard(), release)

	<-held

	// Holding the hierarchy lock must not block a writer that needs only the access lock.
	otherDone := make(chan error, 1)

	go func() {
		otherDone <- tx.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := postgres.NewAccessGuard().LockForUpdate(ctx)

			return err
		})
	}()

	select {
	case err := <-otherDone:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("the access guard was blocked by the hierarchy guard")
	}

	releaseOnce()
	require.NoError(t, <-firstDone)
}

func TestGuards_RequireTransaction(t *testing.T) {
	_ = pgtest.Pool(t)

	_, err := postgres.NewIncidentHierarchyGuard().LockForUpdate(t.Context())
	require.Error(t, err)

	_, err = postgres.NewAccessGuard().LockForUpdate(t.Context())
	require.Error(t, err)

	_, err = postgres.NewIncidentHierarchyGuard().HasChildren(t.Context(), shared.IncidentID(uuid.New()))
	require.Error(t, err)
}

func TestHierarchyGuard_HasChildren(t *testing.T) {
	pool := pgtest.Pool(t)
	store := postgres.NewEventStore(pool)
	tx := postgres.NewTransactor(pool)
	guard := postgres.NewIncidentHierarchyGuard()

	hasChildren := func(id shared.IncidentID) bool {
		var got bool

		require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
			var err error

			got, err = guard.HasChildren(ctx, id)

			return err
		}))

		return got
	}

	parent := newIncident(t, store, tx, nil)
	assert.False(t, hasChildren(parent), "a new incident has no children")

	parentID := uuid.UUID(parent)
	child := newIncident(t, store, tx, &parentID)
	assert.True(t, hasChildren(parent), "a linked child counts")

	// Unlinking removes the relation.
	c := load(t, store, child)
	require.NoError(t, c.UnlinkParent("sys", time.Now().UTC()))
	require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := store.Append(ctx, c)

		return err
	}))
	assert.False(t, hasChildren(parent), "an unlinked child no longer counts")

	// A deleted child does not count either.
	child2 := newIncident(t, store, tx, &parentID)
	assert.True(t, hasChildren(parent))

	c2 := load(t, store, child2)
	require.NoError(t, c2.Close(shared.ReasonManual, "sys", time.Now().UTC()))
	require.NoError(t, c2.Delete(shared.DeleteReasonManual, "sys", time.Now().UTC()))
	require.NoError(t, tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := store.Append(ctx, c2)

		return err
	}))
	assert.False(t, hasChildren(parent), "a deleted child no longer counts")
}
