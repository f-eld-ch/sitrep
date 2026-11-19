package sqlite_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	squser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/sqlite"
)

type fixedClock struct{ now time.Time }

func (c *fixedClock) Now() time.Time { return c.now }

func TestRepository_Upsert_KeepsCreationTimeAndRefreshesUpdateTime(t *testing.T) {
	db := openWriteDB(t)
	clock := &fixedClock{now: time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC)}
	repo := squser.NewRepository(db, clock)

	require.NoError(t, repo.Upsert(t.Context(), "sub|001", "a@example.com", "Alice"))

	clock.now = clock.now.Add(time.Hour)

	require.NoError(t, repo.Upsert(t.Context(), "sub|001", "a2@example.com", "Alice 2"))

	var created, updated string
	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT created_at, updated_at FROM users WHERE sub = 'sub|001'`).Scan(&created, &updated))
	assert.Equal(t, "2026-03-01T10:00:00.000000000Z", created)
	assert.Equal(t, "2026-03-01T11:00:00.000000000Z", updated)
}

func TestRepository_ReportsDatabaseFailures(t *testing.T) {
	t.Run("closed database", func(t *testing.T) {
		db := openWriteDB(t)
		repo := squser.NewRepository(db, sqstore.WallClock{})
		require.NoError(t, db.Close())

		require.Error(t, repo.Upsert(t.Context(), "sub|1", "a@example.com", "A"))

		first, err := repo.UpsertAndReportFirst(t.Context(), "sub|1", "a@example.com", "A")
		require.Error(t, err)
		assert.False(t, first)
	})

	t.Run("cancelled context", func(t *testing.T) {
		repo := squser.NewRepository(openWriteDB(t), sqstore.WallClock{})
		ctx, cancel := context.WithCancel(t.Context())
		cancel()

		_, err := repo.UpsertAndReportFirst(ctx, "sub|1", "a@example.com", "A")
		require.ErrorIs(t, err, context.Canceled)
	})

	t.Run("failed insert rolls back and does not report a first user", func(t *testing.T) {
		db := openWriteDB(t)
		repo := squser.NewRepository(db, sqstore.WallClock{})

		_, err := db.ExecContext(t.Context(),
			`CREATE TRIGGER users_reject BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'rejected'); END`)
		require.NoError(t, err)

		first, err := repo.UpsertAndReportFirst(t.Context(), "sub|1", "a@example.com", "A")
		require.ErrorContains(t, err, "rejected")
		assert.False(t, first)

		_, err = db.ExecContext(t.Context(), `DROP TRIGGER users_reject`)
		require.NoError(t, err)

		first, err = repo.UpsertAndReportFirst(t.Context(), "sub|1", "a@example.com", "A")
		require.NoError(t, err)
		assert.True(t, first, "the failed attempt left no user behind, so this one is still the first")
	})

	t.Run("missing table", func(t *testing.T) {
		db := openWriteDB(t)
		repo := squser.NewRepository(db, sqstore.WallClock{})

		_, err := db.ExecContext(t.Context(), `DROP TABLE users`)
		require.NoError(t, err)

		_, err = repo.UpsertAndReportFirst(t.Context(), "sub|1", "a@example.com", "A")
		require.ErrorContains(t, err, "users")
	})
}
