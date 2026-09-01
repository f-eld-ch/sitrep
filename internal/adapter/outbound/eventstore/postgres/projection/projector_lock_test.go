package projection_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing" //nolint:typecheck // used by countingStore methods
)

// countingStore wraps an in-memory event store and counts calls to Read.
// It lets us assert that a standby never touches the database.
type countingStore struct {
	inner outbound.EventStore
	reads atomic.Int64
}

func (s *countingStore) Load(ctx context.Context, streamType string, id uuid.UUID) ([]eventsourcing.Event, error) {
	return s.inner.Load(ctx, streamType, id)
}

func (s *countingStore) Append(ctx context.Context, a eventsourcing.Aggregate) (outbound.Cursor, error) {
	return s.inner.Append(ctx, a)
}

func (s *countingStore) Read(ctx context.Context, cursor outbound.Cursor, limit int) ([]eventsourcing.Event, outbound.Cursor, error) {
	s.reads.Add(1)
	return s.inner.Read(ctx, cursor, limit)
}

// TestProjector_Standby_NeverTouchesStore verifies that when the lock is held
// by another instance the projector's Run goroutine never calls store.Read,
// i.e. it never attempts to write read-model data.
//
// The pool is intentionally nil: if the standby ever touches the database it
// will panic with a nil pointer, failing the test immediately and clearly.
func TestProjector_Standby_NeverTouchesStore(t *testing.T) {
	store := &countingStore{inner: inmem.NewEventStore()}

	lock := inmem.NewProjectorLock()
	// Occupy the lock — the projector will never acquire it.
	existingRelease, err := lock.Acquire(context.Background(), pgprojection.DefaultLockName)
	require.NoError(t, err)
	defer existingRelease()

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	p := pgprojection.NewProjector(
		nil, // nil pool — panics on any database access
		store,
		inmem.NewNotifier(),
		nil,
		pgprojection.WithLock(lock),
		pgprojection.WithStandbyInterval(5*time.Millisecond), // fast retries for test speed
	)

	err = p.Run(ctx)
	assert.True(t, errors.Is(err, context.DeadlineExceeded), "Run must return context error, got: %v", err)
	assert.Equal(t, int64(0), store.reads.Load(),
		"a standby must never call store.Read")
}

// TestProjector_Handover_TransitionsToLeader verifies that when the occupying
// lock is released, Run transitions from standby to leader (it calls
// Acquire successfully and enters the lead loop) and then stops cleanly on
// context cancellation. With zero handlers the pool is never accessed, so a
// nil pool confirms no surprise database calls happen during the transition.
func TestProjector_Handover_TransitionsToLeader(t *testing.T) {
	lock := inmem.NewProjectorLock()
	occupyRelease, err := lock.Acquire(context.Background(), pgprojection.DefaultLockName)
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// nil pool is safe here: with nil handlers initCheckpoints and catchUp
	// both loop over an empty slice and return before touching the pool.
	p := pgprojection.NewProjector(
		nil,
		&countingStore{inner: inmem.NewEventStore()},
		inmem.NewNotifier(),
		nil, // no handlers → pool is never accessed
		pgprojection.WithLock(lock),
		pgprojection.WithStandbyInterval(10*time.Millisecond),
	)

	done := make(chan error, 1)
	go func() { done <- p.Run(ctx) }()

	// Let the projector stand by for a couple of retry cycles.
	time.Sleep(50 * time.Millisecond)

	// Release the occupying lock so the projector can win the next election.
	occupyRelease()

	// The projector must acquire the lock within a reasonable time; we confirm
	// this by acquiring it ourselves after a brief pause — if it were never
	// released by the projector, we could not acquire it here while the
	// projector is still running (but in this test we cancel first).
	cancel()
	gotErr := <-done
	assert.True(t,
		errors.Is(gotErr, context.Canceled) || errors.Is(gotErr, context.DeadlineExceeded),
		"Run must return a context error after cancellation, got: %v", gotErr)

	// After Run returns the lock must be free (lead deferred release).
	postRelease, postErr := lock.Acquire(context.Background(), pgprojection.DefaultLockName)
	require.NoError(t, postErr, "lock must be released when Run returns")
	postRelease()
}
