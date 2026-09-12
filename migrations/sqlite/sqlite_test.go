package sqlite_test

import (
	"database/sql"
	"path/filepath"
	"sort"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

func TestMigrationsUpDownUp(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	provider, err := goose.NewProvider(
		goose.DialectSQLite3,
		db,
		sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...),
	)
	require.NoError(t, err)

	// Up
	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	wantTables := []string{
		"eventsourcing_aggregate_index",
		"eventsourcing_archive_aggregate_index",
		"eventsourcing_archive_events",
		"eventsourcing_archived_incidents",
		"eventsourcing_events",
		"eventsourcing_incident_counters",
		"eventsourcing_projection_checkpoint",
		"eventsourcing_projection_dead_letter",
		"readmodel_access_group",
		"readmodel_access_group_member",
		"readmodel_access_policy",
		"readmodel_global_access",
		"readmodel_incident",
		"readmodel_incident_access",
		"readmodel_incident_access_mode",
		"readmodel_incident_division",
		"readmodel_layer_features",
		"readmodel_message",
		"readmodel_message_attachment",
		"users",
	}
	assertTables(t, db, wantTables)

	// Down: roll back all
	_, err = provider.DownTo(t.Context(), 0)
	require.NoError(t, err)
	assertTables(t, db, nil)

	// Up again: idempotent
	_, err = provider.Up(t.Context())
	require.NoError(t, err)
	assertTables(t, db, wantTables)
}

func assertTables(t *testing.T, db *sql.DB, want []string) {
	t.Helper()

	rows, err := db.QueryContext(
		t.Context(),
		`SELECT name FROM sqlite_master
		  WHERE type='table'
		    AND name NOT LIKE 'goose_%'
		    AND name NOT LIKE 'sqlite_%'
		  ORDER BY name`,
	)
	require.NoError(t, err)

	defer func() { require.NoError(t, rows.Close()) }()

	var got []string

	for rows.Next() {
		var name string

		require.NoError(t, rows.Scan(&name))

		got = append(got, name)
	}

	require.NoError(t, rows.Err())

	sort.Strings(got)
	assert.Equal(t, want, got)
}
