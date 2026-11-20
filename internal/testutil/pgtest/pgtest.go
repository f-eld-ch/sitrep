//go:build integration

// Package pgtest starts a throwaway PostgreSQL container for integration tests.
//
// The tests that use it carry the "integration" build tag and run with
//
//	go test -tags integration ./...
//
// A package calls [Main] from its TestMain: it starts one container, applies the
// migrations, and takes a snapshot of the migrated database. Each test then calls
// [Pool], which gives it a pool on a database restored to that snapshot, so tests
// are isolated without paying for a new container or a new migration run.
//
// Tests of one package share the container and must not call t.Parallel: the
// restore after a test replaces the database for everyone.
//
// Docker (or Podman with its Docker-compatible socket) is required. When it is not
// available the tests fail instead of being skipped, because asking for the
// integration tag means asking for these tests to run.
package pgtest

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"

	"github.com/f-eld-ch/sitrep/migrations"
)

const (
	image    = "postgres:17-alpine" // keep in line with production and docker-compose.yml
	database = "sitrep_test"        // not "postgres": snapshots work through the system database
	user     = "sitrep"
	password = "sitrep"

	startTimeout = 3 * time.Minute // the first run also pulls the image
)

var container *tcpostgres.PostgresContainer

// Main starts the container, migrates it, runs the tests and removes the container.
// Use it as the body of TestMain:
//
//	func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }
func Main(m *testing.M) int {
	ctx, cancel := context.WithTimeout(context.Background(), startTimeout)

	ctr, err := startWithRetry(ctx)

	cancel()

	if err != nil {
		fmt.Fprintf(os.Stderr, "pgtest: %v\n", err)

		if ctr != nil {
			_ = testcontainers.TerminateContainer(ctr)
		}

		return 1
	}

	container = ctr

	code := m.Run()

	if err := testcontainers.TerminateContainer(ctr); err != nil {
		fmt.Fprintf(os.Stderr, "pgtest: terminating the container: %v\n", err)
	}

	return code
}

// startWithRetry starts the container, trying again after a transient failure such as a connection
// reset while pulling the image. The first failure is the useful one if every attempt fails.
func startWithRetry(ctx context.Context) (*tcpostgres.PostgresContainer, error) {
	const attempts = 3

	var firstErr error

	for attempt := 1; attempt <= attempts; attempt++ {
		ctr, err := start(ctx)
		if err == nil {
			return ctr, nil
		}

		if ctr != nil {
			_ = testcontainers.TerminateContainer(ctr)
		}

		if firstErr == nil {
			firstErr = err
		}

		fmt.Fprintf(os.Stderr, "pgtest: attempt %d of %d failed: %v\n", attempt, attempts, err)

		if attempt < attempts {
			select {
			case <-ctx.Done():
				return nil, firstErr
			case <-time.After(time.Duration(attempt) * 3 * time.Second):
			}
		}
	}

	return nil, firstErr
}

func start(ctx context.Context) (*tcpostgres.PostgresContainer, error) {
	ctr, err := tcpostgres.Run(ctx, image,
		tcpostgres.WithDatabase(database),
		tcpostgres.WithUsername(user),
		tcpostgres.WithPassword(password),
		tcpostgres.WithSQLDriver("pgx"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		return ctr, fmt.Errorf("starting PostgreSQL (is Docker or Podman running?): %w", err)
	}

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		return ctr, fmt.Errorf("connection string: %w", err)
	}

	if err := migrate(ctx, dsn); err != nil {
		return ctr, err
	}

	if err := ctr.Snapshot(ctx); err != nil {
		return ctr, fmt.Errorf("snapshot: %w", err)
	}

	return ctr, nil
}

func migrate(ctx context.Context, dsn string) error {
	set, err := migrations.ForDSN(dsn)
	if err != nil {
		return err
	}

	cfg, err := pgxConfig(dsn)
	if err != nil {
		return err
	}

	db := stdlib.OpenDB(*cfg)
	defer func() { _ = db.Close() }()

	return migrateUp(ctx, db, set)
}

func migrateUp(ctx context.Context, db *sql.DB, set *migrations.MigrationSet) error {
	p, err := goose.NewProvider(set.Dialect, db, set.FS, goose.WithGoMigrations(set.GoMigrations...))
	if err != nil {
		return fmt.Errorf("goose provider: %w", err)
	}

	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("migrating: %w", err)
	}

	return nil
}

// Pool returns a pool on a database that holds the migrated schema and nothing
// else. The database is restored after the test, so the next test starts clean.
func Pool(tb testing.TB) *pgxpool.Pool {
	tb.Helper()

	require.NotNil(tb, container, "pgtest: TestMain must call pgtest.Main")

	ctx := tb.Context()

	// Cleanups run last-in-first-out: the pool closes first, then the database is restored.
	tb.Cleanup(func() {
		// tb.Context() is already cancelled here, so use a fresh one.
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()

		require.NoError(tb, container.Restore(ctx))
	})

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(tb, err)

	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(tb, err)

	tb.Cleanup(pool.Close)

	require.NoError(tb, pool.Ping(ctx))

	return pool
}
