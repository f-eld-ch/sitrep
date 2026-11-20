//go:build integration

package postgres_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/postgres"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

func TestRepository_Upsert(t *testing.T) {
	pool := pgtest.Pool(t)
	repo := postgres.NewRepository(pool)

	require.NoError(t, repo.Upsert(t.Context(), "sub-1", "a@example.com", "Anna"))

	var email, name string
	require.NoError(
		t,
		pool.QueryRow(t.Context(), `SELECT email, name FROM users WHERE sub = 'sub-1'`).Scan(&email, &name),
	)
	assert.Equal(t, "a@example.com", email)
	assert.Equal(t, "Anna", name)

	// The same subject updates its email and name instead of adding a row.
	require.NoError(t, repo.Upsert(t.Context(), "sub-1", "new@example.com", "Anna B"))

	var count int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM users WHERE sub = 'sub-1'`).Scan(&count))
	assert.Equal(t, 1, count)
	require.NoError(
		t,
		pool.QueryRow(t.Context(), `SELECT email, name FROM users WHERE sub = 'sub-1'`).Scan(&email, &name),
	)
	assert.Equal(t, "new@example.com", email)
	assert.Equal(t, "Anna B", name)
}

func TestRepository_UpsertAndReportFirst(t *testing.T) {
	repo := postgres.NewRepository(pgtest.Pool(t))

	first, err := repo.UpsertAndReportFirst(t.Context(), "sub-1", "a@example.com", "Anna")
	require.NoError(t, err)
	assert.True(t, first, "the first user of an empty table is reported as first")

	second, err := repo.UpsertAndReportFirst(t.Context(), "sub-2", "b@example.com", "Ben")
	require.NoError(t, err)
	assert.False(t, second)

	// Signing in again is not "first" either, even for the very first user.
	again, err := repo.UpsertAndReportFirst(t.Context(), "sub-1", "a@example.com", "Anna")
	require.NoError(t, err)
	assert.False(t, again)
}

// The restore after each test gives the next one an empty table: this one would
// fail if TestRepository_UpsertAndReportFirst had left its users behind.
func TestRepository_DatabaseIsCleanPerTest(t *testing.T) {
	repo := postgres.NewRepository(pgtest.Pool(t))

	first, err := repo.UpsertAndReportFirst(t.Context(), "sub-x", "x@example.com", "X")
	require.NoError(t, err)
	assert.True(t, first)
}
