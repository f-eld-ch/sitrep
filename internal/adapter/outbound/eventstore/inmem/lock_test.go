package inmem_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func TestProjectorLock_Acquire_Success(t *testing.T) {
	l := inmem.NewProjectorLock()
	release, err := l.Acquire(context.Background(), "test")
	require.NoError(t, err)
	require.NotNil(t, release)
	release() // must not panic
}

func TestProjectorLock_Acquire_Contention(t *testing.T) {
	l := inmem.NewProjectorLock()
	release, err := l.Acquire(context.Background(), "test")
	require.NoError(t, err)

	defer release()

	release2, err2 := l.Acquire(context.Background(), "test")
	require.Error(t, err2)
	require.ErrorIs(t, err2, outbound.ErrLockHeld)
	assert.Nil(t, release2)
}

func TestProjectorLock_DifferentNames_AreIndependent(t *testing.T) {
	l := inmem.NewProjectorLock()

	releaseA, err := l.Acquire(context.Background(), "a")
	require.NoError(t, err, "first acquisition must succeed")

	defer releaseA()

	releaseB, err := l.Acquire(context.Background(), "b")
	require.NoError(t, err, "different name must not contend")

	defer releaseB()
}

func TestProjectorLock_ReleaseAllowsReacquire(t *testing.T) {
	l := inmem.NewProjectorLock()

	release, err := l.Acquire(context.Background(), "test")
	require.NoError(t, err)
	release()

	release2, err := l.Acquire(context.Background(), "test")
	require.NoError(t, err, "after release the lock must be re-acquirable")

	defer release2()
}

func TestProjectorLock_DoubleRelease_DoesNotPanic(t *testing.T) {
	l := inmem.NewProjectorLock()
	release, err := l.Acquire(context.Background(), "test")
	require.NoError(t, err)

	require.NotPanics(t, func() {
		release()
		release()
		release()
	})
}

func TestProjectorLock_ConcurrentAcquire_ExactlyOneWinner(t *testing.T) {
	const goroutines = 20

	l := inmem.NewProjectorLock()

	var (
		winners atomic.Int64
		wg      sync.WaitGroup
	)

	releases := make(chan func(), goroutines)

	for range goroutines {
		wg.Go(func() {
			release, err := l.Acquire(context.Background(), "shared")
			if err == nil {
				winners.Add(1)

				releases <- release
			}
		})
	}

	wg.Wait()
	close(releases)

	assert.Equal(t, int64(1), winners.Load(), "exactly one goroutine must win the election")

	for release := range releases {
		release()
	}

	// After all releases the lock should be free.
	release, err := l.Acquire(context.Background(), "shared")
	require.NoError(t, err, "lock must be free after all releases")
	release()
}
