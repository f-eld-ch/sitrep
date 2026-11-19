package sqlite_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

func TestBackfillDefaultSchadenplatz(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	provider, err := goose.NewProvider(
		goose.DialectSQLite3,
		db,
		sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...),
	)
	require.NoError(t, err)

	_, err = provider.UpTo(t.Context(), 10)
	require.NoError(t, err)

	const (
		plain   = "00000000-0000-0000-0000-0000000000a1" // an incident from before schadenplaetze existed
		longer  = "00000000-0000-0000-0000-0000000000a2" // more events: the link goes after the last one
		already = "00000000-0000-0000-0000-0000000000a3" // already linked, must stay alone
	)

	appendEv := func(streamID string, version int, eventType, at string) {
		t.Helper()

		_, err := db.ExecContext(t.Context(), `
			INSERT INTO eventsourcing_events
			  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
			VALUES ('Incident', ?, ?, ?, '{"name":"x"}', '{}', ?, ?)`,
			streamID, version, eventType, at, at)
		require.NoError(t, err)
	}

	appendEv(plain, 1, "Opened", "2026-01-01T10:00:00.000000000Z")
	appendEv(longer, 1, "Opened", "2026-01-02T10:00:00.000000000Z")
	appendEv(longer, 2, "Renamed", "2026-01-03T10:00:00.000000000Z")
	appendEv(longer, 3, "Closed", "2026-01-04T10:00:00.000000000Z")
	appendEv(already, 1, "Opened", "2026-01-05T10:00:00.000000000Z")
	appendEv(already, 2, "DefaultSchadenplatzLinked", "2026-01-05T10:00:00.000000000Z")

	_, err = provider.UpTo(t.Context(), 11)
	require.NoError(t, err)

	versionsOf := func(incidentID string) []string {
		t.Helper()

		rows, err := db.QueryContext(
			t.Context(),
			`SELECT event_type FROM eventsourcing_events WHERE stream_type = 'Incident' AND stream_id = ? ORDER BY version`,
			incidentID,
		)
		require.NoError(t, err)

		defer func() { _ = rows.Close() }()

		var out []string

		for rows.Next() {
			var s string

			require.NoError(t, rows.Scan(&s))

			out = append(out, s)
		}

		require.NoError(t, rows.Err())

		return out
	}

	assert.Equal(t, []string{"Opened", "DefaultSchadenplatzLinked"}, versionsOf(plain))
	assert.Equal(t, []string{"Opened", "Renamed", "Closed", "DefaultSchadenplatzLinked"}, versionsOf(longer),
		"the link is appended after the last event of the stream")
	assert.Equal(
		t,
		[]string{"Opened", "DefaultSchadenplatzLinked"},
		versionsOf(already),
		"an incident that has a link is skipped",
	)

	type created struct {
		id, name, isDefault, occurredAt, source string
	}

	rows, err := db.QueryContext(t.Context(), `
		SELECT e.stream_id, json_extract(e.data, '$.name'), json_extract(e.data, '$.isDefault'),
		       e.occurred_at, json_extract(e.metadata, '$.source')
		FROM eventsourcing_events e
		WHERE e.stream_type = 'Schadenplatz' AND e.event_type = 'Created'
		ORDER BY json_extract(e.data, '$.incidentId')`)
	require.NoError(t, err)

	defer func() { _ = rows.Close() }()

	var got []created

	for rows.Next() {
		var c created

		require.NoError(t, rows.Scan(&c.id, &c.name, &c.isDefault, &c.occurredAt, &c.source))

		got = append(got, c)
	}

	require.NoError(t, rows.Err())
	require.Len(t, got, 2, "one default schadenplatz for each incident that had none")

	for _, c := range got {
		assert.Equal(t, "Allgemein", c.name)
		assert.Equal(t, "1", c.isDefault)
		assert.Equal(t, "schadenplatz-backfill", c.source)
	}

	assert.Equal(t, "2026-01-01T10:00:00.000000000Z", got[0].occurredAt, "dated like the incident's first event")
	assert.Equal(t, "2026-01-02T10:00:00.000000000Z", got[1].occurredAt)

	var indexed int

	require.NoError(t, db.QueryRowContext(t.Context(), `
		SELECT COUNT(*) FROM eventsourcing_aggregate_index
		WHERE stream_type = 'Schadenplatz' AND incident_id IN (?, ?)`, plain, longer).Scan(&indexed))
	assert.Equal(t, 2, indexed, "the new streams belong to their incident")

	// Down removes exactly what the backfill wrote.
	_, err = provider.DownTo(t.Context(), 10)
	require.NoError(t, err)

	assert.Equal(t, []string{"Opened"}, versionsOf(plain))
	assert.Equal(t, []string{"Opened", "Renamed", "Closed"}, versionsOf(longer))
	assert.Equal(t, []string{"Opened", "DefaultSchadenplatzLinked"}, versionsOf(already), "the original link stays")

	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM eventsourcing_events WHERE stream_type = 'Schadenplatz'`).Scan(&indexed))
	assert.Zero(t, indexed)

	require.NoError(t, db.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM eventsourcing_aggregate_index WHERE stream_type = 'Schadenplatz'`).Scan(&indexed))
	assert.Zero(t, indexed)
}
