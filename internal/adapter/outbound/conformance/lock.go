package conformance

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// RunLock runs the projector lock sub-suite.
func RunLock(t *testing.T, f Factory) {
	t.Helper()

	b := f(t)
	if b.Lock == nil {
		t.Skip("backend does not provide ProjectorLock")
	}

	t.Run("Acquire_Success", func(t *testing.T) {
		b := f(t)

		release, err := b.Lock.Acquire(t.Context(), "test-projection")
		require.NoError(t, err)
		require.NotNil(t, release)

		release()
	})

	t.Run("Acquire_AlreadyHeld", func(t *testing.T) {
		b := f(t)

		release, err := b.Lock.Acquire(t.Context(), "singleton")
		require.NoError(t, err)

		defer release()

		_, err = b.Lock.Acquire(t.Context(), "singleton")
		require.ErrorIs(t, err, outbound.ErrLockHeld)
	})

	t.Run("Acquire_DifferentNames_Independent", func(t *testing.T) {
		b := f(t)

		r1, err := b.Lock.Acquire(t.Context(), "projA")
		require.NoError(t, err)

		defer r1()

		r2, err := b.Lock.Acquire(t.Context(), "projB")
		require.NoError(t, err)

		r2()
	})

	t.Run("Release_Idempotent", func(t *testing.T) {
		b := f(t)

		release, err := b.Lock.Acquire(t.Context(), "idem")
		require.NoError(t, err)

		release()
		release() // second call must not panic or deadlock

		// Lock must be acquirable again after release.
		r2, err := b.Lock.Acquire(t.Context(), "idem")
		require.NoError(t, err)
		assert.NotNil(t, r2)
		r2()
	})
}
