package cli

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/filesystem"
	pgblobs "github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/postgres"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	inprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	pgqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/postgres"
	pguser "github.com/f-eld-ch/sitrep/internal/adapter/outbound/user/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// attachmentConfig carries blob-storage configuration derived from viper flags.
type attachmentConfig struct {
	enabled bool
	backend string
	maxSize int64
	dir     string
}

// stack holds all wired-up application services and the infrastructure teardown.
type stack struct {
	IncidentSvc           inbound.IncidentService
	MessageSvc            inbound.MessageService
	LayerSvc              inbound.LayerService
	FeatureSvc            inbound.FeatureService
	AccessSvc             inbound.AccessService
	Queries               outbound.Queries
	AccessQueries         outbound.AccessQueries
	IncidentAccessChecker outbound.IncidentAccessChecker
	GlobalAccessChecker   outbound.GlobalAccessChecker
	// UserRepo is nil when running with the in-memory backend.
	UserRepo outbound.UserRepository
	// Teardown stops the projector and releases infrastructure resources.
	Teardown func()
}

// stackOption is a functional option for buildStack.
type stackOption func(*stackConfig)

// stackConfig holds all configuration for buildStack.
type stackConfig struct {
	dsn             string
	autoCloseDays   uint
	autoArchiveDays uint
	attCfg          attachmentConfig
}

func withDSN(dsn string) stackOption { return func(c *stackConfig) { c.dsn = dsn } }
func withAutoClose(days uint) stackOption {
	return func(c *stackConfig) { c.autoCloseDays = days }
}

func withAutoArchive(days uint) stackOption {
	return func(c *stackConfig) { c.autoArchiveDays = days }
}

func withAttachmentConfig(cfg attachmentConfig) stackOption {
	return func(c *stackConfig) { c.attCfg = cfg }
}

// buildStack wires the full application stack. When DATABASE_URL is set it uses
// PostgreSQL; otherwise it falls back to in-memory stores (useful for local dev
// without a running database).
func buildStack(ctx context.Context, opts ...stackOption) (*stack, error) {
	cfg := &stackConfig{}
	for _, o := range opts {
		o(cfg)
	}

	if cfg.dsn == "" {
		slog.WarnContext(ctx, "no database_url set, using in-memory stores (data will not persist)")
		return buildInmemStack(ctx, cfg.attCfg)
	}

	return buildPostgresStack(ctx, cfg.dsn, cfg.autoCloseDays, cfg.autoArchiveDays, cfg.attCfg)
}

// buildBlobStore constructs the BlobStore for the given config and returns a teardown function.
// The teardown must be called even when an error is returned (it is a no-op in that case).
func buildBlobStore(ctx context.Context, pool *pgxpool.Pool, cfg attachmentConfig) (outbound.BlobStore, func(), error) {
	if !cfg.enabled {
		return nil, func() {}, nil
	}

	backend := cfg.backend
	if backend == "" {
		if pool != nil {
			backend = "database"
		} else {
			backend = "ephemeral"
		}

		slog.InfoContext(ctx, "attachment backend not configured; using default",
			slog.String("backend", backend))
	}

	switch backend {
	case "ephemeral":
		dir, err := os.MkdirTemp("", "sitrep-attachments-*")
		if err != nil {
			return nil, func() {}, fmt.Errorf("create ephemeral attachment dir: %w", err)
		}

		slog.WarnContext(ctx, "attachment backend is ephemeral; files will be lost on restart",
			slog.String("dir", dir))

		store, err := filesystem.New(dir)
		if err != nil {
			_ = os.RemoveAll(dir)

			return nil, func() {}, fmt.Errorf("open ephemeral attachment store: %w", err)
		}

		return store, func() {
			_ = store.Close()
			_ = os.RemoveAll(dir)
		}, nil

	case "database":
		if pool == nil {
			return nil, func() {}, fmt.Errorf("attachment backend=database requires database-url to be configured")
		}

		return pgblobs.New(pool), func() {}, nil

	default: // "filesystem"
		store, err := filesystem.New(cfg.dir)
		if err != nil {
			return nil, func() {}, fmt.Errorf("open attachment store at %q: %w", cfg.dir, err)
		}

		return store, func() { _ = store.Close() }, nil
	}
}

// ── Postgres ──────────────────────────────────────────────────────────────────

func buildPostgresStack(
	ctx context.Context, dsn string, autoCloseDays, autoArchiveDays uint, attCfg attachmentConfig,
) (*stack, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}

	cfg.ConnConfig.Tracer = otelpgx.NewTracer()
	// The projector leader holds one connection for the advisory lock for its
	// entire lifetime; Notifier.Wait keeps one persistent LISTEN connection. The pgx default of
	// max(4, NumCPU) is too small under concurrent load, so we enforce a floor.
	if cfg.MaxConns < 8 {
		cfg.MaxConns = 8
	}

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
	accessRepo := eventstore.NewIncidentAccessRepository(store)
	groupRepo := eventstore.NewAccessGroupRepository(store)
	globalRepo := eventstore.NewGlobalAccessRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)
	features := eventstore.NewFeatureRepository(store)
	accessChecker := pgstore.NewIncidentAccessChecker(pool)
	globalChecker := pgstore.NewGlobalAccessChecker(pool)
	retention := pgstore.NewIncidentRetention(pool)

	queries := pgqueries.NewQueries(pool, accessChecker)

	blobs, blobsTeardown, err := buildBlobStore(ctx, pool, attCfg)
	if err != nil {
		pool.Close()
		notifier.Close()

		return nil, err
	}

	factoryOpts := []service.FactoryOption{
		service.WithTransactor(tx),
		service.WithClock(pgstore.WallClock{}),
		service.WithIDs(pgstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(pgstore.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(pgstore.NewIncidentHierarchyGuard()),
		service.WithIncidentAccessRepository(accessRepo),
		service.WithIncidentAccessChecker(accessChecker),
		service.WithAccessGuard(pgstore.NewAccessGuard()),
		service.WithAccessGroupRepository(groupRepo),
		service.WithGlobalAccessRepository(globalRepo),
		service.WithGlobalAccessChecker(globalChecker),
	}

	if blobs != nil {
		factoryOpts = append(factoryOpts,
			service.WithBlobStore(blobs),
			service.WithQueries(queries),
		)
	}

	factory := service.NewFactory(factoryOpts...)

	handlers := []pgprojection.Handler{
		pgprojection.NewIncidentHandler(pool),
		pgprojection.NewIncidentDivisionHandler(pool),
		pgprojection.NewMessageHandler(pool),
		pgprojection.NewLayerFeaturesHandler(pool),
		pgprojection.NewAccessHandler(pool),
	}
	projLock := pgstore.NewProjectorLock(pool)

	retentionSvc := service.NewRetentionService(tx, repos, retention, pgstore.WallClock{}, notifier)
	if blobs != nil {
		retentionSvc.WithBlobStore(blobs)
	}

	proj := projection.NewInstrumentedProjector(pgprojection.NewProjector(pool, store, notifier, handlers,
		pgprojection.WithLock(projLock),
		pgprojection.WithRetention(func(ctx context.Context) (bool, error) {
			result, err := retentionSvc.Run(ctx, autoCloseDays, autoArchiveDays)
			return result.Archived > 0, err
		})), "postgres")

	projCtx, cancelProj := context.WithCancel(ctx)

	projDone := make(chan struct{})
	go func() {
		defer close(projDone)

		if err := proj.Run(projCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(projCtx, "projector stopped unexpectedly", slog.String("error", err.Error()))
		}
	}()

	return &stack{
		IncidentSvc:           factory.IncidentService(repos, layers),
		MessageSvc:            factory.MessageService(messages, repos),
		LayerSvc:              factory.LayerService(layers, repos),
		FeatureSvc:            factory.FeatureService(features, repos, layers),
		AccessSvc:             factory.AccessService(),
		Queries:               queries,
		AccessQueries:         pgqueries.NewAccessQueries(pool),
		IncidentAccessChecker: accessChecker,
		GlobalAccessChecker:   globalChecker,
		UserRepo:              pguser.NewRepository(pool),
		Teardown: func() {
			cancelProj()
			<-projDone
			proj.Unregister()
			blobsTeardown()
			notifier.Close()
			pool.Close()
		},
	}, nil
}

// ── In-memory ─────────────────────────────────────────────────────────────────

func buildInmemStack(ctx context.Context, attCfg attachmentConfig) (*stack, error) {
	store := inmem.NewEventStore()
	tx := inmem.NewTransactor()
	notifier := inmem.NewNotifier()

	repos := eventstore.NewIncidentRepository(store)
	accessRepo := eventstore.NewIncidentAccessRepository(store)
	groupRepo := eventstore.NewAccessGroupRepository(store)
	globalRepo := eventstore.NewGlobalAccessRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)
	features := eventstore.NewFeatureRepository(store)
	accessHandler := inprojection.NewAccessHandler()
	accessChecker := inmem.NewIncidentAccessChecker(accessHandler)
	globalChecker := inmem.NewGlobalAccessChecker(accessHandler)

	incHandler := inprojection.NewIncidentHandler()
	divHandler := inprojection.NewIncidentDivisionHandler()
	msgHandler := inprojection.NewMessageHandler()
	layerHandler := inprojection.NewLayerFeaturesHandler()

	// For the no-DSN dev path, default to ephemeral if no backend is configured.
	if attCfg.enabled && attCfg.backend == "" {
		attCfg.backend = "ephemeral"
	}

	queries := inmemqueries.NewQueries(incHandler, divHandler, msgHandler, layerHandler, accessChecker)

	blobs, blobsTeardown, err := buildBlobStore(ctx, nil, attCfg)
	if err != nil {
		return nil, err
	}

	inmemFactoryOpts := []service.FactoryOption{
		service.WithTransactor(tx),
		service.WithClock(pgstore.WallClock{}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
		service.WithIncidentAccessRepository(accessRepo),
		service.WithIncidentAccessChecker(accessChecker),
		service.WithAccessGuard(inmem.NewAccessGuard()),
		service.WithAccessGroupRepository(groupRepo),
		service.WithGlobalAccessRepository(globalRepo),
		service.WithGlobalAccessChecker(globalChecker),
	}

	if blobs != nil {
		inmemFactoryOpts = append(inmemFactoryOpts,
			service.WithBlobStore(blobs),
			service.WithQueries(queries),
		)
	}

	factory := service.NewFactory(inmemFactoryOpts...)

	proj := projection.NewInstrumentedProjector(inprojection.NewProjector(store, []inprojection.Handler{
		incHandler, divHandler, msgHandler, layerHandler, accessHandler,
	}).WithNotifier(notifier), "inmem")

	projCtx, cancelProj := context.WithCancel(ctx)

	projDone := make(chan struct{})
	go func() {
		defer close(projDone)

		if err := proj.Run(projCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(projCtx, "projector stopped unexpectedly", slog.String("error", err.Error()))
		}
	}()

	return &stack{
		IncidentSvc:           factory.IncidentService(repos, layers),
		MessageSvc:            factory.MessageService(messages, repos),
		LayerSvc:              factory.LayerService(layers, repos),
		FeatureSvc:            factory.FeatureService(features, repos, layers),
		AccessSvc:             factory.AccessService(),
		Queries:               queries,
		AccessQueries:         inmemqueries.NewAccessQueries(accessHandler),
		IncidentAccessChecker: accessChecker,
		GlobalAccessChecker:   globalChecker,
		UserRepo:              nil,
		Teardown: func() {
			cancelProj()
			<-projDone
			proj.Unregister()
			blobsTeardown()
		},
	}, nil
}
