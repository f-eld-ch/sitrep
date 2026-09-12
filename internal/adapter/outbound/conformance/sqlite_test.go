package conformance_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/conformance"
	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	sqprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	sqqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/sqlite"
	squser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	sqlitemig "github.com/f-eld-ch/sitrep/migrations/sqlite"
)

func TestConformance_SQLite(t *testing.T) {
	conformance.Run(t, sqliteFactory)
}

func sqliteFactory(t *testing.T) *conformance.Backend {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")

	writeDSN := "file:" + dbPath +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(10000)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=temp_store(MEMORY)" +
		"&_txlock=immediate"
	readDSN := "file:" + dbPath +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(10000)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=temp_store(MEMORY)" +
		"&_pragma=query_only(1)"

	write, err := sql.Open("sqlite", writeDSN)
	require.NoError(t, err)
	write.SetMaxOpenConns(1)
	write.SetMaxIdleConns(1)

	read, err := sql.Open("sqlite", readDSN)
	require.NoError(t, err)
	read.SetMaxOpenConns(4)
	read.SetMaxIdleConns(4)

	t.Cleanup(func() {
		_ = read.Close()
		_ = write.Close()
	})

	provider, err := goose.NewProvider(
		goose.DialectSQLite3,
		write,
		sqlitemig.FS,
		goose.WithGoMigrations(sqlitemig.GoMigrations()...),
	)
	require.NoError(t, err)

	_, err = provider.Up(t.Context())
	require.NoError(t, err)

	clock := sqstore.WallClock{}
	store := sqstore.NewEventStore(read, write, clock)
	transactor := sqstore.NewTransactor(write)
	notifier := sqstore.NewNotifier()
	lock := sqstore.NewProjectorLock()

	handlers := []sqprojection.Handler{
		sqprojection.NewIncidentHandler(write),
		sqprojection.NewIncidentDivisionHandler(write),
		sqprojection.NewMessageHandler(write),
		sqprojection.NewLayerFeaturesHandler(write),
		sqprojection.NewAccessHandler(write),
	}

	proj := sqprojection.NewProjector(read, write, store, notifier, handlers)

	// initCheckpoints is not exported, so we call CatchUp which initialises lazily.
	require.NoError(t, proj.CatchUp(t.Context()))

	accessChecker := sqstore.NewIncidentAccessChecker(read)
	globalChecker := sqstore.NewGlobalAccessChecker(read)

	// No access checker in queries — canRead always returns true so tests
	// need no actor in ctx, matching the inmem factory pattern.
	queries := sqqueries.NewQueries(read)
	accessQueries := sqqueries.NewAccessQueries(read)
	userRepo := squser.NewRepository(write, clock)

	return &conformance.Backend{
		Store:          store,
		Transactor:     transactor,
		Notifier:       notifier,
		Queries:        queries,
		AccessQueries:  accessQueries,
		IncidentAccess: accessChecker,
		GlobalAccess:   globalChecker,
		Lock:           lock,
		Users:          userRepo,

		Project: func(ctx context.Context) error {
			return proj.CatchUp(ctx)
		},
		ResetProjections: func(ctx context.Context) error {
			return proj.ResetAll(ctx)
		},
		ApplyEvent: func(ctx context.Context, handlerName string, e eventsourcing.Event) error {
			return proj.ApplySingle(ctx, handlerName, e)
		},

		Caps: conformance.Capabilities{
			RevisionIdempotent:          true,
			PlaceIntoMissingLayerIsNoop: true,
			FeatureOrderStable:          true,
			FeatureLookupByID:           true,
		},
	}
}
