package sqlite

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type backfill struct {
	name string
	run  func(context.Context, *sql.Tx) error
}

var backfills = []backfill{
	{"upBackfillDefaultSchadenplatz", upBackfillDefaultSchadenplatz},
	{"downBackfillDefaultSchadenplatz", downBackfillDefaultSchadenplatz},
	{"upNachrichtenkarte", upNachrichtenkarte},
	{"downNachrichtenkarte", downNachrichtenkarte},
	{"upBackfillMessageMap", upBackfillMessageMap},
	{"downBackfillMessageMap", downBackfillMessageMap},
	{"upBackfillMessageMapAcknowledgements", upBackfillMessageMapAcknowledgements},
	{"downBackfillMessageMapAcknowledgements", downBackfillMessageMapAcknowledgements},
	{"upBackfillStandardLayer", upBackfillStandardLayer},
	{"downBackfillStandardLayer", downBackfillStandardLayer},
}

// runInTx runs fn in a transaction that is always rolled back, so a database can be reused.
func runInTx(t *testing.T, db *sql.DB, fn func(context.Context, *sql.Tx) error) error {
	t.Helper()

	tx, err := db.BeginTx(t.Context(), nil)
	require.NoError(t, err)

	defer func() { _ = tx.Rollback() }()

	return fn(t.Context(), tx)
}

func newDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	return db
}

// migratedDB returns a database migrated to the version before the Nachrichtenkarte, holding one
// incident without any division or layer.
func migratedDB(t *testing.T) *sql.DB {
	t.Helper()

	db := newDB(t)

	provider, err := goose.NewProvider(goose.DialectSQLite3, db, FS, goose.WithGoMigrations(GoMigrations()...))
	require.NoError(t, err)

	_, err = provider.UpTo(t.Context(), 13)
	require.NoError(t, err)

	_, err = db.ExecContext(t.Context(), `
		INSERT INTO eventsourcing_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
		VALUES ('Incident', '00000000-0000-0000-0000-0000000000a1', 1, 'Opened', '{"name":"A"}', '{}',
		        '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`)
	require.NoError(t, err)

	return db
}

func TestBackfillsReportADatabaseWithoutTheSchema(t *testing.T) {
	prefixes := map[string]string{
		"upBackfillDefaultSchadenplatz":          "schadenplatz backfill: list incidents",
		"downBackfillDefaultSchadenplatz":        "schadenplatz backfill: remove indexes",
		"upNachrichtenkarte":                     "nachrichtenkarte: schema",
		"downNachrichtenkarte":                   "standard layer backfill: remove indexes",
		"upBackfillMessageMap":                   "message map backfill: list incidents",
		"downBackfillMessageMap":                 "message map backfill: remove layer indexes",
		"upBackfillMessageMapAcknowledgements":   "ack backfill: list incidents",
		"downBackfillMessageMapAcknowledgements": "ack backfill: remove events",
		"upBackfillStandardLayer":                "standard layer backfill: list incidents",
		"downBackfillStandardLayer":              "standard layer backfill: remove indexes",
	}

	for _, b := range backfills {
		t.Run(b.name, func(t *testing.T) {
			err := runInTx(t, newDB(t), b.run)

			require.Error(t, err)
			assert.ErrorContains(t, err, prefixes[b.name])
		})
	}
}

func TestBackfillsReportAMissingAggregateIndex(t *testing.T) {
	prefixes := map[string]string{
		"upBackfillDefaultSchadenplatz":   "schadenplatz backfill: index for incident",
		"downBackfillDefaultSchadenplatz": "schadenplatz backfill: remove indexes",
		"upNachrichtenkarte":              "message map backfill",
		"downNachrichtenkarte":            "standard layer backfill: remove indexes",
		"upBackfillMessageMap":            "message map backfill",
		"downBackfillMessageMap":          "message map backfill: remove layer indexes",
		"upBackfillStandardLayer":         "standard layer backfill: index for incident",
		"downBackfillStandardLayer":       "standard layer backfill: remove indexes",
	}

	for _, b := range backfills {
		want, ok := prefixes[b.name]
		if !ok {
			continue
		}

		t.Run(b.name, func(t *testing.T) {
			db := migratedDB(t)
			_, err := db.ExecContext(t.Context(), `DROP TABLE eventsourcing_aggregate_index`)
			require.NoError(t, err)

			err = runInTx(t, db, b.run)

			require.Error(t, err)
			assert.ErrorContains(t, err, want)
		})
	}
}

func TestDownNachrichtenkarteReportsMissingColumns(t *testing.T) {
	// The schema step of the migration was never applied here, so there is nothing to drop.
	err := runInTx(t, migratedDB(t), downNachrichtenkarte)

	require.ErrorContains(t, err, "nachrichtenkarte: drop schema")
}

func TestUpBackfillsAreANoOpWithoutIncidents(t *testing.T) {
	db := migratedDB(t)
	_, err := db.ExecContext(t.Context(), `DELETE FROM eventsourcing_events`)
	require.NoError(t, err)

	for _, b := range []backfill{
		{"upBackfillDefaultSchadenplatz", upBackfillDefaultSchadenplatz},
		{"upBackfillMessageMap", upBackfillMessageMap},
		{"upBackfillMessageMapAcknowledgements", upBackfillMessageMapAcknowledgements},
		{"upBackfillStandardLayer", upBackfillStandardLayer},
	} {
		require.NoError(t, runInTx(t, db, b.run), b.name)
	}
}
