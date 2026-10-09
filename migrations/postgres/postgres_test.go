package postgres_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/migrations/postgres"
)

// The Postgres migrations need a live server, so this test only runs when
// SITREP_TEST_POSTGRES_URL points at one (any database on it; the test creates and drops its
// own), for example:
//
//	docker compose up -d postgres
//	SITREP_TEST_POSTGRES_URL="postgres://user:pass@localhost:5432/postgres?sslmode=disable" \
//	  go test ./migrations/postgres/...
const testURLEnv = "SITREP_TEST_POSTGRES_URL"

// scratchDatabase creates an empty database on the server and returns a handle to it.
func scratchDatabase(t *testing.T) *sql.DB {
	t.Helper()

	url := os.Getenv(testURLEnv)
	if url == "" {
		t.Skipf("%s is not set; skipping the Postgres migration tests", testURLEnv)
	}

	cfg, err := pgx.ParseConfig(url)
	require.NoError(t, err)

	admin := stdlib.OpenDB(*cfg)

	t.Cleanup(func() { _ = admin.Close() })

	name := "migration_test_" + uuid.NewString()[:8]
	_, err = admin.ExecContext(t.Context(), fmt.Sprintf(`CREATE DATABASE %q`, name))
	require.NoError(t, err)

	// Not t.Context(): it is already cancelled when cleanups run.
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, name))
	})

	cfg.Database = name
	db := stdlib.OpenDB(*cfg)

	t.Cleanup(func() { _ = db.Close() })

	return db
}

func provider(t *testing.T, db *sql.DB) *goose.Provider {
	t.Helper()

	p, err := goose.NewProvider(
		goose.DialectPostgres, db, postgres.FS, goose.WithGoMigrations(postgres.GoMigrations()...),
	)
	require.NoError(t, err)

	return p
}

func TestMigrationsUpDownUp(t *testing.T) {
	db := scratchDatabase(t)
	p := provider(t, db)

	_, err := p.Up(t.Context())
	require.NoError(t, err)

	columnCount := func() int {
		var n int

		require.NoError(t, db.QueryRowContext(t.Context(), `
			SELECT count(*) FROM information_schema.columns
			WHERE table_schema = 'readmodel'
			  AND ((table_name = 'incident_division' AND column_name = 'kind')
			    OR (table_name = 'layer_features' AND column_name = 'kind')
			    OR (table_name = 'message' AND column_name = 'acknowledgements'))`).Scan(&n))

		return n
	}
	hasFeatureChange := func() bool {
		var found sql.NullString

		require.NoError(t, db.QueryRowContext(t.Context(),
			`SELECT to_regclass('readmodel.feature_change')::text`).Scan(&found))

		return found.Valid
	}

	assert.Equal(t, 3, columnCount(), "kinds and acknowledgements are added")
	assert.True(t, hasFeatureChange())

	_, err = p.DownTo(t.Context(), 0)
	require.NoError(t, err)

	_, err = p.Up(t.Context())
	require.NoError(t, err, "up again after rolling everything back")
	assert.Equal(t, 3, columnCount())
	assert.True(t, hasFeatureChange())
}

func TestNachrichtenkarteBackfill(t *testing.T) {
	db := scratchDatabase(t)
	p := provider(t, db)

	_, err := p.UpTo(t.Context(), 25)
	require.NoError(t, err)

	const (
		karteDivision = "00000000-0000-0000-0000-0000000000d1"
		scDivision    = "00000000-0000-0000-0000-0000000000d2"
		incident      = "00000000-0000-0000-0000-0000000000a1"
	)

	appendEvent := func(streamType, streamID string, version int, eventType, data string) {
		t.Helper()

		_, err := db.ExecContext(t.Context(), `
			INSERT INTO eventsourcing.events
			  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
			VALUES ($1, $2, $3, $4, $5::jsonb, '{}', '2026-01-01T10:00:00Z', '2026-01-01T10:00:00Z')`,
			streamType, streamID, version, eventType, data)
		require.NoError(t, err)

		if version == 1 && streamType != "Incident" {
			_, err = db.ExecContext(t.Context(), `
				INSERT INTO eventsourcing.aggregate_index (stream_type, stream_id, incident_id)
				VALUES ($1, $2, $3)`, streamType, streamID, incident)
			require.NoError(t, err)
		}
	}
	division := func(id, name, description string) string {
		return fmt.Sprintf(`{"division":{"id":%q,"name":%q,"description":%q,"kind":""}}`, id, name, description)
	}

	// An incident from before the Nachrichtenkarte had a kind: an ordinary division and layer.
	appendEvent("Incident", incident, 1, "Opened", `{"name":"Legacy"}`)
	appendEvent("Incident", incident, 2, "DivisionAdded", division(karteDivision, "Karte", "Nachrichtenkarte"))
	appendEvent("Incident", incident, 3, "DivisionAdded", division(scDivision, "SC", "Stabschef"))

	layerID := "00000000-0000-0000-0000-0000000000b1"
	appendEvent("Layer", layerID, 1, "Created",
		fmt.Sprintf(`{"incidentId":%q,"name":"Nachrichtenkarte","kind":""}`, incident))

	// One message triaged to the Nachrichtenkarte, one to another division.
	recorded := fmt.Sprintf(`{"incidentId":%q}`, incident)
	appendEvent("Message", "00000000-0000-0000-0000-0000000000c1", 1, "Recorded", recorded)
	appendEvent("Message", "00000000-0000-0000-0000-0000000000c1", 2, "Triaged",
		fmt.Sprintf(`{"divisionIds":[%q]}`, karteDivision))
	appendEvent("Message", "00000000-0000-0000-0000-0000000000c2", 1, "Recorded", recorded)
	appendEvent("Message", "00000000-0000-0000-0000-0000000000c2", 2, "Triaged",
		fmt.Sprintf(`{"divisionIds":[%q]}`, scDivision))

	_, err = p.Up(t.Context())
	require.NoError(t, err)

	eventTypes := func(streamType, streamID string) []string {
		t.Helper()

		rows, err := db.QueryContext(t.Context(),
			`SELECT event_type FROM eventsourcing.events WHERE stream_type = $1 AND stream_id = $2 ORDER BY version`,
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
	layersOf := func() int {
		var n int

		require.NoError(t, db.QueryRowContext(t.Context(), `
			SELECT count(*) FROM eventsourcing.aggregate_index WHERE stream_type = 'Layer' AND incident_id = $1`,
			incident).Scan(&n))

		return n
	}

	// The existing division and layer are marked, nothing new is created for them.
	assert.Equal(t, []string{"Opened", "DivisionAdded", "DivisionAdded", "DivisionKindAssigned"},
		eventTypes("Incident", incident))
	assert.Equal(t, []string{"Created", "KindAssigned"}, eventTypes("Layer", layerID))

	// Historical messages of the Nachrichtenkarte count as drawn; others are left alone.
	assert.Equal(t, []string{"Recorded", "Triaged", "DivisionAcknowledged"},
		eventTypes("Message", "00000000-0000-0000-0000-0000000000c1"))
	assert.Equal(t, []string{"Recorded", "Triaged"},
		eventTypes("Message", "00000000-0000-0000-0000-0000000000c2"))

	// The Nachrichtenkarte is read-only outside a message, so the incident gets a layer to draw on.
	assert.Equal(t, 2, layersOf())

	// Rolling back removes exactly what the backfills wrote.
	_, err = p.DownTo(t.Context(), 25)
	require.NoError(t, err)

	assert.Equal(t, []string{"Opened", "DivisionAdded", "DivisionAdded"}, eventTypes("Incident", incident))
	assert.Equal(t, []string{"Created"}, eventTypes("Layer", layerID))
	assert.Equal(t, []string{"Recorded", "Triaged"},
		eventTypes("Message", "00000000-0000-0000-0000-0000000000c1"))
	assert.Equal(t, 1, layersOf())
}
