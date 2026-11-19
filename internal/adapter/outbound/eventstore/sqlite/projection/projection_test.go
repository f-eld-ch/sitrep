package projection_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

// openTestDB opens a temp-file SQLite database with the same pragmas as
// production and runs all migrations up. Both handles are closed in t.Cleanup.
func openTestDB(t *testing.T) (read, write *sql.DB) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")

	writeDSN := "file:" + dbPath +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(10000)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=temp_store(MEMORY)" +
		"&_txlock=immediate"
	readDSN := "file:" + dbPath +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(10000)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=temp_store(MEMORY)" +
		"&_pragma=query_only(1)"

	write, err := sql.Open("sqlite", writeDSN)
	require.NoError(t, err)
	write.SetMaxOpenConns(1)
	write.SetMaxIdleConns(1)

	read, err = sql.Open("sqlite", readDSN)
	require.NoError(t, err)
	read.SetMaxOpenConns(4)
	read.SetMaxIdleConns(4)

	t.Cleanup(func() {
		_ = read.Close()
		_ = write.Close()
	})

	provider, err := goose.NewProvider(goose.DialectSQLite3, write, sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...))
	require.NoError(t, err)
	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	return read, write
}

// applyEvent applies a single event to the named handler in its own transaction
// via the projector's ApplySingle path (the same path the conformance suite uses).
func applyEvent(t *testing.T, proj *projection.Projector, handler string, e eventsourcing.Event) {
	t.Helper()
	require.NoError(t, proj.ApplySingle(t.Context(), handler, e))
}

func newEvent(streamType, streamID string, version int, eventType string, data any) eventsourcing.Event {
	id := uuid.MustParse(streamID)

	return eventsourcing.Event{
		StreamType: streamType,
		StreamID:   id,
		Version:    version,
		EventType:  eventType,
		Data:       data,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// IncidentHandler
// ─────────────────────────────────────────────────────────────────────────────

func TestIncidentHandler_OpenedAndRenamed(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewIncidentHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000001"

	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 1, "Opened", map[string]any{
		"name": "Alpha", "location": nil,
	}))

	var name string
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT name FROM readmodel_incident WHERE id = ?`, incID).Scan(&name))
	assert.Equal(t, "Alpha", name)

	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 2, "Renamed", map[string]any{
		"name": "Alpha Renamed",
	}))

	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT name FROM readmodel_incident WHERE id = ?`, incID).Scan(&name))
	assert.Equal(t, "Alpha Renamed", name)
}

func TestIncidentHandler_ClosedAndReopened(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewIncidentHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000002"

	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 1, "Opened", map[string]any{
		"name": "Bravo", "location": nil,
	}))
	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 2, "Closed", map[string]any{
		"reason": "MANUAL", "closedAt": "2024-01-01T00:00:00Z",
	}))

	var closed int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT is_closed FROM readmodel_incident WHERE id = ?`, incID).Scan(&closed))
	assert.Equal(t, 1, closed)

	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 3, "Reopened", map[string]any{}))

	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT is_closed FROM readmodel_incident WHERE id = ?`, incID).Scan(&closed))
	assert.Equal(t, 0, closed)
}

// ─────────────────────────────────────────────────────────────────────────────
// LayerFeaturesHandler — revision idempotency
// ─────────────────────────────────────────────────────────────────────────────

func TestLayerHandler_RevisionBumpsOnPlaced(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewLayerFeaturesHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000010"
	layerID := "00000000-0000-0000-0000-000000000011"
	featID := "00000000-0000-0000-0000-000000000012"

	applyEvent(t, proj, "readmodel.layer_features", newEvent("Layer", layerID, 1, "Created", map[string]any{
		"incidentId": incID, "name": "Layer A",
	}))
	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 1, "Placed", map[string]any{
		"layerId":    layerID,
		"geometry":   map[string]any{"type": "Point", "coordinates": []float64{8.5, 47.3}},
		"properties": map[string]any{},
	}))

	var rev int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT revision FROM readmodel_layer_features WHERE id = ?`, layerID).Scan(&rev))
	assert.Equal(t, 1, rev, "revision should be 1 after Placed")
}

func TestLayerHandler_MovedWithSameGeometryDoesNotBumpRevision(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewLayerFeaturesHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000020"
	layerID := "00000000-0000-0000-0000-000000000021"
	featID := "00000000-0000-0000-0000-000000000022"

	applyEvent(t, proj, "readmodel.layer_features", newEvent("Layer", layerID, 1, "Created", map[string]any{
		"incidentId": incID, "name": "Layer B",
	}))
	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 1, "Placed", map[string]any{
		"layerId":    layerID,
		"geometry":   map[string]any{"type": "Point", "coordinates": []float64{8.5, 47.3}},
		"properties": map[string]any{},
	}))

	var revAfterPlace int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT revision FROM readmodel_layer_features WHERE id = ?`, layerID).Scan(&revAfterPlace))

	// Moved with the same geometry — different whitespace, same value.
	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 2, "Moved", map[string]any{
		"geometry": map[string]any{"type": "Point", "coordinates": []float64{8.5, 47.3}},
	}))

	var revAfterMove int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT revision FROM readmodel_layer_features WHERE id = ?`, layerID).Scan(&revAfterMove))
	assert.Equal(t, revAfterPlace, revAfterMove, "revision must not bump when geometry is semantically equal")
}

func TestLayerHandler_MovedWithDifferentGeometryBumpsRevision(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewLayerFeaturesHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000030"
	layerID := "00000000-0000-0000-0000-000000000031"
	featID := "00000000-0000-0000-0000-000000000032"

	applyEvent(t, proj, "readmodel.layer_features", newEvent("Layer", layerID, 1, "Created", map[string]any{
		"incidentId": incID, "name": "Layer C",
	}))
	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 1, "Placed", map[string]any{
		"layerId":    layerID,
		"geometry":   map[string]any{"type": "Point", "coordinates": []float64{8.5, 47.3}},
		"properties": map[string]any{},
	}))

	var revAfterPlace int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT revision FROM readmodel_layer_features WHERE id = ?`, layerID).Scan(&revAfterPlace))

	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 2, "Moved", map[string]any{
		"geometry": map[string]any{"type": "Point", "coordinates": []float64{9.0, 48.0}},
	}))

	var revAfterMove int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT revision FROM readmodel_layer_features WHERE id = ?`, layerID).Scan(&revAfterMove))
	assert.Equal(t, revAfterPlace+1, revAfterMove, "revision must bump when geometry changes")
}

func TestLayerHandler_PlaceIntoMissingLayerIsNoop(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewLayerFeaturesHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	missingLayerID := "00000000-0000-0000-0000-000000000099"
	featID := "00000000-0000-0000-0000-000000000098"

	// Placing into a non-existent layer must not error (no-op, not dead-letter).
	applyEvent(t, proj, "readmodel.layer_features", newEvent("Feature", featID, 1, "Placed", map[string]any{
		"layerId":    missingLayerID,
		"geometry":   map[string]any{"type": "Point", "coordinates": []float64{0.0, 0.0}},
		"properties": map[string]any{},
	}))

	// No row should exist for the missing layer.
	var count int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM readmodel_layer_features WHERE id = ?`, missingLayerID).Scan(&count))
	assert.Equal(t, 0, count)
}

// ─────────────────────────────────────────────────────────────────────────────
// ApplySingle idempotency — same event twice
// ─────────────────────────────────────────────────────────────────────────────

func TestIncidentHandler_ApplySingleIsIdempotent(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewIncidentHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000050"
	e := newEvent("Incident", incID, 1, "Opened", map[string]any{"name": "Delta", "location": nil})

	applyEvent(t, proj, "readmodel.incident", e)
	applyEvent(t, proj, "readmodel.incident", e) // same event again — must not error or duplicate

	var count int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM readmodel_incident WHERE id = ?`, incID).Scan(&count))
	assert.Equal(t, 1, count, "idempotent apply must not insert duplicate rows")
}

// ─────────────────────────────────────────────────────────────────────────────
// ResetAll
// ─────────────────────────────────────────────────────────────────────────────

func TestProjector_ResetAll(t *testing.T) {
	_, write := openTestDB(t)
	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(write, write, clock)
	notifier := sqstore.NewNotifier()
	handlers := []projection.Handler{projection.NewIncidentHandler(write)}
	proj := projection.NewProjector(write, write, store, notifier, handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	incID := "00000000-0000-0000-0000-000000000060"
	applyEvent(t, proj, "readmodel.incident", newEvent("Incident", incID, 1, "Opened", map[string]any{
		"name": "Echo", "location": nil,
	}))

	var count int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM readmodel_incident WHERE id = ?`, incID).Scan(&count))
	require.Equal(t, 1, count)

	require.NoError(t, proj.ResetAll(context.Background()))

	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM readmodel_incident WHERE id = ?`, incID).Scan(&count))
	assert.Equal(t, 0, count, "reset must clear all projection rows")
}
