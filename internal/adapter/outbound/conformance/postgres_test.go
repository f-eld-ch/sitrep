//go:build integration

package conformance_test

import (
	"context"
	"os"
	"testing"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/conformance"
	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	pgqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/postgres"
	pguser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/postgres"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

// TestConformance_Postgres runs the shared suite against PostgreSQL in a container.
// Run it with: go test -tags integration ./internal/adapter/outbound/conformance/
func TestConformance_Postgres(t *testing.T) {
	conformance.Run(t, postgresFactory)
}

func postgresFactory(t *testing.T) *conformance.Backend {
	t.Helper()

	pool := pgtest.Pool(t)

	store := pgstore.NewEventStore(pool)
	transactor := pgstore.NewTransactor(pool)
	notifier := pgstore.NewNotifier(pool, "events")
	lock := pgstore.NewProjectorLock(pool)

	handlers := []pgprojection.Handler{
		pgprojection.NewIncidentHandler(pool),
		pgprojection.NewIncidentDivisionHandler(pool),
		pgprojection.NewMessageHandler(pool),
		pgprojection.NewLayerFeaturesHandler(pool),
		pgprojection.NewAccessHandler(pool),
		pgprojection.NewSchadenplatzHandler(pool),
		pgprojection.NewResourceHandler(pool),
	}

	proj := pgprojection.NewProjector(pool, store, notifier, handlers)

	// No access checker in queries: canRead always returns true, so tests need no
	// actor in the context (same as the in-memory and SQLite factories).
	return &conformance.Backend{
		Store:          store,
		Transactor:     transactor,
		Notifier:       notifier,
		Queries:        pgqueries.NewQueries(pool),
		AccessQueries:  pgqueries.NewAccessQueries(pool),
		IncidentAccess: pgstore.NewIncidentAccessChecker(pool),
		GlobalAccess:   pgstore.NewGlobalAccessChecker(pool),
		Lock:           lock,
		Users:          pguser.NewRepository(pool),

		Project: func(ctx context.Context) error {
			return proj.CatchUp(ctx)
		},
		ResetProjections: func(ctx context.Context) error {
			return proj.ResetAll(ctx)
		},
		ApplyEvent: func(ctx context.Context, handlerName string, e eventsourcing.Event) error {
			return proj.ApplySingle(ctx, handlerName, e)
		},
	}
}
