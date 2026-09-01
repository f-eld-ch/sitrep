package cli

import (
	"context"
	"errors"
	"log/slog"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	inprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	pgqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/postgres"
	pguser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// stack holds all wired-up application services and the infrastructure teardown.
type stack struct {
	IncidentSvc inbound.IncidentService
	MessageSvc  inbound.MessageService
	LayerSvc    inbound.LayerService
	FeatureSvc  inbound.FeatureService
	Queries     outbound.Queries
	// UserRepo is nil when running with the in-memory backend.
	UserRepo outbound.UserRepository
	// Teardown stops the projector and releases infrastructure resources.
	Teardown func()
}

// buildStack wires the full application stack. When DATABASE_URL is set it uses
// PostgreSQL; otherwise it falls back to in-memory stores (useful for local dev
// without a running database).
func buildStack(ctx context.Context) (*stack, error) {
	dsn := viper.GetString("database_url")
	if dsn == "" {
		slog.WarnContext(ctx, "DATABASE_URL not set, using in-memory stores (data will not persist)")
		return buildInmemStack(ctx)
	}
	return buildPostgresStack(ctx, dsn)
}

// ── Postgres ──────────────────────────────────────────────────────────────────

func buildPostgresStack(ctx context.Context, dsn string) (*stack, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.Tracer = otelpgx.NewTracer()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	store := pgstore.NewEventStore(pool)
	tx := pgstore.NewTransactor(pool)
	notifier := pgstore.NewNotifier(pool, "events")

	repos := eventstore.NewIncidentRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)
	features := eventstore.NewFeatureRepository(store)

	factory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(pgstore.WallClock{}),
		service.WithIDs(pgstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(pgstore.NewMessageCounter()),
	)

	handlers := []pgprojection.Handler{
		pgprojection.NewIncidentHandler(pool),
		pgprojection.NewIncidentDivisionHandler(pool),
		pgprojection.NewMessageHandler(pool),
		pgprojection.NewLayerFeaturesHandler(pool),
	}
	proj := pgprojection.NewProjector(pool, store, notifier, handlers)

	projCtx, cancelProj := context.WithCancel(ctx)
	projDone := make(chan struct{})
	go func() {
		defer close(projDone)
		if err := proj.Run(projCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(projCtx, "projector stopped unexpectedly", "error", err)
		}
	}()

	return &stack{
		IncidentSvc: factory.IncidentService(repos, layers),
		MessageSvc:  factory.MessageService(messages, repos),
		LayerSvc:    factory.LayerService(layers),
		FeatureSvc:  factory.FeatureService(features),
		Queries:     pgqueries.NewQueries(pool),
		UserRepo:    pguser.NewRepository(pool),
		Teardown: func() {
			cancelProj()
			<-projDone
			pool.Close()
		},
	}, nil
}

// ── In-memory ─────────────────────────────────────────────────────────────────

func buildInmemStack(ctx context.Context) (*stack, error) {
	store := inmem.NewEventStore()
	tx := inmem.NewTransactor()
	notifier := inmem.NewNotifier()

	repos := eventstore.NewIncidentRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)
	features := eventstore.NewFeatureRepository(store)

	factory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(pgstore.WallClock{}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(inmem.NewMessageCounter()),
	)

	incHandler := inprojection.NewIncidentHandler()
	divHandler := inprojection.NewIncidentDivisionHandler()
	msgHandler := inprojection.NewMessageHandler()
	layerHandler := inprojection.NewLayerFeaturesHandler()

	proj := inprojection.NewProjector(store, []inprojection.Handler{
		incHandler, divHandler, msgHandler, layerHandler,
	})

	projCtx, cancelProj := context.WithCancel(ctx)
	projDone := make(chan struct{})
	go func() {
		defer close(projDone)
		if err := proj.Run(projCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(projCtx, "projector stopped unexpectedly", "error", err)
		}
	}()

	return &stack{
		IncidentSvc: factory.IncidentService(repos, layers),
		MessageSvc:  factory.MessageService(messages, repos),
		LayerSvc:    factory.LayerService(layers),
		FeatureSvc:  factory.FeatureService(features),
		Queries:     inmemqueries.NewQueries(incHandler, divHandler, msgHandler, layerHandler),
		UserRepo:    nil,
		Teardown: func() {
			cancelProj()
			<-projDone
		},
	}, nil
}
