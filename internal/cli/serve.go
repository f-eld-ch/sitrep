package cli

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"log/slog"
	"net/http"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

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

var serveConfigOptions = []configOption{
	uintOption("port", 4180, "Server port", "SITREP_SERVER_PORT", "SERVER_PORT"),
	uintOption("auto-close-incidents", 0, "Automatically close incidents after this many days (0 disables)"),
	uintOption("auto-archive-incidents", 0, "Archive closed incidents after this many days (0 disables)"),
	stringOption("oidc-client-id", "", "OIDC client ID", "OIDC_CLIENT_ID", "OAUTH2_PROXY_CLIENT_ID"),
	stringOption("oidc-issuer", "", "OIDC issuer URL", "OIDC_ISSUER", "OAUTH2_PROXY_OIDC_ISSUER_URL"),
	stringOption("oidc-client-secret", "", "OIDC client secret", "OIDC_CLIENT_SECRET", "OAUTH2_PROXY_CLIENT_SECRET"),
	stringOption("oidc-redirect-url", "", "OIDC redirect URL", "OIDC_REDIRECT_URL", "OAUTH2_PROXY_REDIRECT_URL"),
	stringOption("cookie-key", "", "Cookie signing key", "COOKIE_KEY", "OAUTH2_PROXY_COOKIE_SECRET", "OIDC_COOKIE_KEY"),
	boolOption("graphql-introspection", false, "Enable GraphQL introspection and playground (dev only)", "GRAPHQL_INTROSPECTION"),
	boolOption("migrate-on-startup", false, "Run database migrations before starting the server", "MIGRATE_ON_STARTUP"),
}

func newServeCmd(v *viper.Viper) (*cobra.Command, error) {
	serveCmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the SitRep API server",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runServe(cmd, args, v)
		},
	}
	if err := configureOptions(v, serveConfigOptions); err != nil {
		return nil, err
	}
	if err := bindFlags(v, serveCmd.Flags(), serveConfigOptions); err != nil {
		return nil, err
	}
	return serveCmd, nil
}

func runServe(cmd *cobra.Command, _ []string, v *viper.Viper) error {
	ctx := cmd.Context()
	slog.InfoContext(ctx, "starting sitrep", "version", Version, "sha", Sha)

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
	if v.GetBool("migrate-on-startup") {
		slog.InfoContext(ctx, "running startup migrations")
		if err := runMigrateUp(cmd, v.GetString("database-url")); err != nil {
			slog.ErrorContext(ctx, "failed to run startup migrations", "error", err)
			return err
		}
	}

	s, err := buildStack(
		ctx,
		v.GetString("database-url"),
		v.GetUint("auto-close-incidents"),
		v.GetUint("auto-archive-incidents"),
	)
	if err != nil {
		return err
	}
	defer s.Teardown()

	opts := []server.Option{
		server.WithPort(v.GetUint("port")),
		server.WithApiV2(s.IncidentSvc, s.MessageSvc, s.LayerSvc, s.FeatureSvc, s.Queries,
			v.GetBool("graphql-introspection")),
		server.WithVersion(Version, Sha),
	}

	if v.GetString("oidc-client-id") != "" {
		oidcClient, err := auth.NewOIDC(ctx,
			v.GetString("oidc-issuer"),
			v.GetString("oidc-client-id"),
			v.GetString("oidc-client-secret"),
			v.GetString("oidc-redirect-url"),
			deriveCookieKey(v.GetString("cookie-key")),
		)
		if err != nil {
			slog.ErrorContext(ctx, "failed to create OIDC client", "error", err)
			return err
		}
		if s.UserRepo != nil {
			oidcClient.WithUserRepository(s.UserRepo)
		}
		opts = append(opts, server.WithOidc(oidcClient))
	} else {
		slog.WarnContext(ctx, "OIDC client not configured, using local enforcer")
	}

	srv := server.NewServer(opts...)
	if err := srv.ListenAndServe(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.ErrorContext(ctx, "failed to start server", "error", err)
		return err
	}

	slog.InfoContext(ctx, "server stopped")
	return nil
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
