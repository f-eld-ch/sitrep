package cli

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/postgres/readmodel"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/server"
	"github.com/f-eld-ch/sitrep/server/auth"
)

// Version and Sha are set by main.go via SetBuildInfo before Execute() is called.
var (
	Version = "dev"
	Sha     = "dev"
)

// SetBuildInfo injects the link-time build identity before Execute() is called.
func SetBuildInfo(version, sha string) {
	Version = version
	Sha = sha
}

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the SitRep API server",
	RunE:  runServe,
}

func runServe(cmd *cobra.Command, _ []string) error {
	ctx := cmd.Context()

	shutdown, err := setupOpenTelemetry(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "failed to configure OpenTelemetry", "error", err)
		return err
	}
	defer func() {
		if err := shutdown(ctx); err != nil {
			slog.ErrorContext(ctx, "failed to shutdown OpenTelemetry", "error", err)
		}
	}()

	// ── Database ──────────────────────────────────────────────────────────────
	pool, err := buildPool(ctx)
	if err != nil {
		return err
	}
	// Pool is closed explicitly after the projector stops (see shutdown sequence below).

	// ── Eventstore infrastructure ─────────────────────────────────────────────
	store := pgstore.NewEventStore(pool)
	tx := pgstore.NewTransactor(pool)
	notifier := pgstore.NewNotifier(pool, "events")

	// ── Generic event-sourced repositories ───────────────────────────────────
	incidents := eventstore.NewIncidentRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)
	features := eventstore.NewFeatureRepository(store)

	// ── Application services ──────────────────────────────────────────────────
	svcFactory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(pgstore.WallClock{}),
		service.WithIDs(pgstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(pgstore.NewMessageCounter()),
	)
	incidentSvc := svcFactory.IncidentService(incidents, layers)
	messageSvc := svcFactory.MessageService(messages, incidents)
	layerSvc := svcFactory.LayerService(layers)
	featureSvc := svcFactory.FeatureService(features)
	queries := readmodel.NewQueries(pool)

	// ── Projector ─────────────────────────────────────────────────────────────
	projCtx, cancelProj := context.WithCancel(ctx)
	projDone := make(chan struct{})
	proj := buildProjector(pool, store, notifier)
	go func() {
		defer close(projDone)
		if err := proj.Run(projCtx); err != nil && !errors.Is(err, context.Canceled) {
			slog.ErrorContext(projCtx, "projector stopped unexpectedly", "error", err)
		}
	}()

	// ── HTTP server ───────────────────────────────────────────────────────────
	opts := []server.Option{
		server.WithPort(viper.GetUint("server_port")),
	}

	if viper.GetString("oidc_client_id") != "" && viper.GetString("oidc_issuer") != "" {
		clientID := viper.GetString("oidc_client_id")
		issuer := viper.GetString("oidc_issuer")
		clientSecret := viper.GetString("oidc_client_secret")
		redirectURI := viper.GetString("oidc_redirect_url")
		keyInput := viper.GetString("cookie_key")
		key := deriveCookieKey(keyInput)

		oidcClient, err := auth.NewOIDC(ctx, issuer, clientID, clientSecret, redirectURI, key)
		if err != nil {
			slog.ErrorContext(ctx, "failed to create OIDC client", "error", err)
			cancelProj()
			<-projDone
			pool.Close()
			return err
		}
		opts = append(opts, server.WithOidc(oidcClient))
	} else {
		slog.WarnContext(ctx, "OIDC client not configured, using local enforcer")
	}

	opts = append(opts,
		server.WithApiV2(incidentSvc, messageSvc, layerSvc, featureSvc, queries,
			viper.GetBool("graphql_introspection")),
		server.WithVersion(Version, Sha),
		server.WithApiV1Proxy(viper.GetString("hasura_backend")),
	)

	srv := server.NewServer(opts...)
	if err := srv.ListenAndServe(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.ErrorContext(ctx, "failed to start server", "error", err)
		cancelProj()
		<-projDone
		pool.Close()
		return err
	}

	// Graceful shutdown: stop projector before closing the pool so in-flight
	// catch-up iterations can finish cleanly without "closed pool" errors.
	cancelProj()
	<-projDone
	pool.Close()
	slog.InfoContext(ctx, "server stopped")
	return nil
}

func buildPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := viper.GetString("database_url")
	if dsn == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("invalid DATABASE_URL: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("cannot open database pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %w", err)
	}
	return pool, nil
}

func buildProjector(pool *pgxpool.Pool, store outbound.EventStore, notifier outbound.EventNotifier) *projection.Projector {
	handlers := []projection.Handler{
		projection.NewIncidentHandler(pool),
		projection.NewIncidentDivisionHandler(pool),
		projection.NewMessageHandler(pool),
		projection.NewLayerFeaturesHandler(pool),
	}
	return projection.NewProjector(pool, store, notifier, handlers)
}

func deriveCookieKey(input string) string {
	if input == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return string(make([]byte, 32))
		}
		return string(b)
	}
	sum := sha256.Sum256([]byte(input))
	return string(sum[:])
}
