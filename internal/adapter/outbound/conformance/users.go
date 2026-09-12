package conformance

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// RunUsers runs the user repository sub-suite.
func RunUsers(t *testing.T, f Factory) {
	t.Helper()

	b := f(t)
	if b.Users == nil {
		t.Skip("backend does not provide FirstUserRepository")
	}

	t.Run("UpsertAndReportFirst", func(t *testing.T) {
		b := f(t)

		first, err := b.Users.UpsertAndReportFirst(t.Context(), "sub|001", "alice@example.com", "Alice")
		require.NoError(t, err)
		assert.True(t, first, "first user must be reported as first")
	})

	t.Run("SecondUpsert_NotFirst", func(t *testing.T) {
		b := f(t)

		_, err := b.Users.UpsertAndReportFirst(t.Context(), "sub|001", "alice@example.com", "Alice")
		require.NoError(t, err)

		second, err := b.Users.UpsertAndReportFirst(t.Context(), "sub|002", "bob@example.com", "Bob")
		require.NoError(t, err)
		assert.False(t, second, "second user must not be reported as first")
	})

	t.Run("Upsert_SameSub_UpdatesFields", func(t *testing.T) {
		b := f(t)

		err := b.Users.Upsert(t.Context(), "sub|001", "alice@example.com", "Alice")
		require.NoError(t, err)

		// Same sub, updated name and email — must not error.
		err = b.Users.Upsert(t.Context(), "sub|001", "alice2@example.com", "Alice Updated")
		require.NoError(t, err)
	})

	t.Run("Upsert_Idempotent", func(t *testing.T) {
		b := f(t)

		for range 3 {
			err := b.Users.Upsert(t.Context(), "sub|idem", "idem@example.com", "Idem")
			require.NoError(t, err)
		}
	})
}
