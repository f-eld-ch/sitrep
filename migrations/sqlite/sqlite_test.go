package sqlite_test

import (
	"database/sql"
	"encoding/json"
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
		"readmodel_message_casualties",
		"readmodel_resource",
		"readmodel_schadenplatz",
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

func TestBackfillMessageMap(t *testing.T) {
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

	_, err = provider.UpTo(t.Context(), 14)
	require.NoError(t, err)

	const (
		matched   = "00000000-0000-0000-0000-0000000000a1" // german defaults
		unmatched = "00000000-0000-0000-0000-0000000000a2" // nothing resembles a message map
		migrated  = "00000000-0000-0000-0000-0000000000a3" // already has a kind
	)

	appendEv := func(streamType, streamID string, version int, eventType, data string) {
		t.Helper()

		_, err := db.ExecContext(t.Context(), `
			INSERT INTO eventsourcing_events
			  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
			VALUES (?, ?, ?, ?, ?, '{}', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`,
			streamType, streamID, version, eventType, data)
		require.NoError(t, err)

		if version == 1 && streamType != "Incident" {
			var incID string
			require.NoError(t, json.Unmarshal([]byte(data), &struct {
				IncidentID *string `json:"incidentId"`
			}{&incID}))

			_, err = db.ExecContext(t.Context(), `
				INSERT INTO eventsourcing_aggregate_index (stream_type, stream_id, incident_id) VALUES (?, ?, ?)`,
				streamType, streamID, incID)
			require.NoError(t, err)
		}
	}

	division := func(id, name, desc, kind string) string {
		return `{"division":{"id":"` + id + `","name":"` + name + `","description":"` + desc + `","kind":"` + kind + `"}}`
	}
	created := func(incID, name, kind string) string {
		return `{"incidentId":"` + incID + `","name":"` + name + `","kind":"` + kind + `"}`
	}

	// matched: german defaults on division and layer
	appendEv("Incident", matched, 1, "Opened", `{"name":"A"}`)
	appendEv(
		"Incident",
		matched,
		2,
		"DivisionAdded",
		division("00000000-0000-0000-0000-0000000000d1", "Karte", "Nachrichtenkarte", ""),
	)
	appendEv(
		"Incident",
		matched,
		3,
		"DivisionAdded",
		division("00000000-0000-0000-0000-0000000000d2", "SC", "Stabschef", ""),
	)
	appendEv("Layer", "l-matched-1", 1, "Created", created(matched, "Lage", ""))
	appendEv("Layer", "l-matched-2", 1, "Created", created(matched, "Nachrichtenkarte", ""))

	// unmatched: nothing resembles a message map
	appendEv("Incident", unmatched, 1, "Opened", `{"name":"B"}`)
	appendEv(
		"Incident",
		unmatched,
		2,
		"DivisionAdded",
		division("00000000-0000-0000-0000-0000000000d3", "SC", "Stabschef", ""),
	)
	appendEv("Layer", "l-unmatched-1", 1, "Created", created(unmatched, "Lage", ""))

	// migrated: already has both kinds
	appendEv("Incident", migrated, 1, "Opened", `{"name":"C"}`)
	appendEv(
		"Incident",
		migrated,
		2,
		"DivisionAdded",
		division("00000000-0000-0000-0000-0000000000d4", "Karte", "Nachrichtenkarte", "MESSAGE_MAP"),
	)
	appendEv("Layer", "l-migrated-1", 1, "Created", created(migrated, "Nachrichtenkarte", "MESSAGE_MAP"))

	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	eventTypes := func(streamType, streamID string) []string {
		t.Helper()

		rows, err := db.QueryContext(t.Context(),
			`SELECT event_type FROM eventsourcing_events WHERE stream_type = ? AND stream_id = ? ORDER BY version`,
			streamType, streamID)
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

	// matched: existing entities are marked, nothing new is created
	assert.Equal(
		t,
		[]string{"Opened", "DivisionAdded", "DivisionAdded", "DivisionKindAssigned"},
		eventTypes("Incident", matched),
	)
	assert.Equal(t, []string{"Created"}, eventTypes("Layer", "l-matched-1"))
	assert.Equal(t, []string{"Created", "KindAssigned"}, eventTypes("Layer", "l-matched-2"))

	// unmatched: a new division is added and a new layer stream is created and indexed
	assert.Equal(t, []string{"Opened", "DivisionAdded", "DivisionAdded"}, eventTypes("Incident", unmatched))

	var newLayers int

	require.NoError(t, db.QueryRowContext(t.Context(), `
		SELECT COUNT(*) FROM eventsourcing_aggregate_index WHERE stream_type = 'Layer' AND incident_id = ?`,
		unmatched).Scan(&newLayers))
	assert.Equal(t, 2, newLayers)

	// migrated: untouched
	assert.Equal(t, []string{"Opened", "DivisionAdded"}, eventTypes("Incident", migrated))
	assert.Equal(t, []string{"Created"}, eventTypes("Layer", "l-migrated-1"))

	// down removes exactly what the backfill wrote
	_, err = provider.DownTo(t.Context(), 14)
	require.NoError(t, err)
	assert.Equal(t, []string{"Opened", "DivisionAdded", "DivisionAdded"}, eventTypes("Incident", matched))
	assert.Equal(t, []string{"Created"}, eventTypes("Layer", "l-matched-2"))

	require.NoError(t, db.QueryRowContext(t.Context(), `
		SELECT COUNT(*) FROM eventsourcing_aggregate_index WHERE stream_type = 'Layer' AND incident_id = ?`,
		unmatched).Scan(&newLayers))
	assert.Equal(t, 1, newLayers)
}
