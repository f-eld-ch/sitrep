package sqlite_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	squser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/sqlite"
	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

func openWriteDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "users.db")
	dsn := "file:" + dbPath +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=foreign_keys(1)" +
		"&_txlock=immediate"

	db, err := sql.Open("sqlite", dsn)
	require.NoError(t, err)
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	t.Cleanup(func() { _ = db.Close() })

	provider, err := goose.NewProvider(goose.DialectSQLite3, db, sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...))
	require.NoError(t, err)
	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	return db
}

func TestRepository_Upsert_CreatesAndUpdates(t *testing.T) {
	db := openWriteDB(t)
	repo := squser.NewRepository(db, sqstore.WallClock{})

	require.NoError(t, repo.Upsert(t.Context(), "sub|001", "alice@example.com", "Alice"))

	var email, name string
	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT email, name FROM users WHERE sub = ?`, "sub|001").Scan(&email, &name))
	assert.Equal(t, "alice@example.com", email)
	assert.Equal(t, "Alice", name)

	// Update — email and name change, sub is the conflict key.
	require.NoError(t, repo.Upsert(t.Context(), "sub|001", "alice2@example.com", "Alice Updated"))

	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT email, name FROM users WHERE sub = ?`, "sub|001").Scan(&email, &name))
	assert.Equal(t, "alice2@example.com", email)
	assert.Equal(t, "Alice Updated", name)

	// Exactly one row must exist.
	var count int
	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM users WHERE sub = ?`, "sub|001").Scan(&count))
	assert.Equal(t, 1, count)
}

func TestRepository_UpsertAndReportFirst_ReportsCorrectly(t *testing.T) {
	db := openWriteDB(t)
	repo := squser.NewRepository(db, sqstore.WallClock{})

	// First user — table is empty, must return true.
	first, err := repo.UpsertAndReportFirst(t.Context(), "sub|002", "bob@example.com", "Bob")
	require.NoError(t, err)
	assert.True(t, first, "first call on empty table must return true")

	// Second user — must return false.
	first, err = repo.UpsertAndReportFirst(t.Context(), "sub|003", "carol@example.com", "Carol")
	require.NoError(t, err)
	assert.False(t, first, "second call must return false")

	// Same sub again — idempotent, must return false.
	first, err = repo.UpsertAndReportFirst(t.Context(), "sub|002", "bob2@example.com", "Bob2")
	require.NoError(t, err)
	assert.False(t, first, "upsert of existing sub must return false")

	var count int
	require.NoError(t, db.QueryRowContext(t.Context(), `SELECT COUNT(*) FROM users`).Scan(&count))
	assert.Equal(t, 2, count, "should have exactly 2 distinct users")
}
