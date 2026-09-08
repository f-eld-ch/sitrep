package cli

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

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
	boolOption(
		"graphql-introspection",
		false,
		"Enable GraphQL introspection and playground (dev only)",
		"GRAPHQL_INTROSPECTION",
	),
	boolOption("migrate-on-startup", false, "Run database migrations before starting the server", "MIGRATE_ON_STARTUP"),
	boolOption(
		"insecure-local-auth",
		false,
		"Allow unauthenticated access using a hardcoded local identity (development only)",
		"INSECURE_LOCAL_AUTH",
	),
	stringSliceOption(
		"allowed-origins",
		nil,
		"Allowed CORS origins (e.g. https://sitrep.example.com). Empty = same-origin only.",
		"ALLOWED_ORIGINS",
	),
	stringOption("tls-cert", "", "Path to a PEM certificate; enables HTTPS together with --tls-key", "TLS_CERT"),
	stringOption("tls-key", "", "Path to the PEM private key matching --tls-cert", "TLS_KEY"),
	stringSliceOption(
		"acme-domains",
		nil,
		"Hostnames to obtain a Let's Encrypt certificate for; enables ACME and requires --port 443",
	),
	stringOption("acme-email", "", "Contact address registered with the ACME CA for expiry notices"),
	stringOption("acme-cache-dir", "/var/lib/sitrep/acme", "Directory persisting ACME account keys and certificates"),
	stringOption("acme-directory-url", "", "ACME directory URL; empty uses Let's Encrypt production"),
}

// splitList accepts a repeated flag, a comma-separated string, or a YAML list,
// so the same value works from the command line, the environment and the file.
func splitList(values []string) []string {
	out := make([]string, 0, len(values))

	for _, value := range values {
		for part := range strings.SplitSeq(value, ",") {
			if part = strings.TrimSpace(part); part != "" {
				out = append(out, part)
			}
		}
	}

	return out
}

// tlsOptions returns the TLS server option, or nothing when the server should
// serve plain HTTP behind a terminating proxy.
func tlsOptions(v *viper.Viper) []server.Option {
	cfg := server.TLSConfig{
		CertFile:         v.GetString("tls-cert"),
		KeyFile:          v.GetString("tls-key"),
		ACMEDomains:      splitList(v.GetStringSlice("acme-domains")),
		ACMEEmail:        v.GetString("acme-email"),
		ACMECacheDir:     v.GetString("acme-cache-dir"),
		ACMEDirectoryURL: v.GetString("acme-directory-url"),
	}

	if cfg.CertFile == "" && cfg.KeyFile == "" && len(cfg.ACMEDomains) == 0 {
		return nil
	}

	return []server.Option{server.WithTLS(cfg)}
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
	slog.InfoContext(ctx, "starting sitrep", slog.String("version", Version), slog.String("sha", Sha))

	shutdown, err := setupOpenTelemetry(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "failed to configure OpenTelemetry", slog.String("error", err.Error()))
		return err
	}
	defer func() {
		if err := shutdown(ctx); err != nil {
			slog.ErrorContext(ctx, "failed to shutdown OpenTelemetry", slog.String("error", err.Error()))
		}
	}()

	if v.GetBool("migrate-on-startup") {
		slog.InfoContext(ctx, "running startup migrations")

		if err := runMigrateUp(cmd, v.GetString("database-url")); err != nil {
			slog.ErrorContext(ctx, "failed to run startup migrations", slog.String("error", err.Error()))
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

	apiOpts := []server.APIV2Option{}
	if v.GetBool("graphql-introspection") {
		apiOpts = append(apiOpts, server.WithGraphQLIntrospection())
	}

	opts := []server.Option{
		server.WithPort(v.GetUint("port")),
		server.WithVersion(Version, Sha),
		server.WithAllowedOrigins(splitList(v.GetStringSlice("allowed-origins"))),
		server.WithApiV2(server.Stack{
			Incidents:             s.IncidentSvc,
			Messages:              s.MessageSvc,
			Layers:                s.LayerSvc,
			Features:              s.FeatureSvc,
			Access:                s.AccessSvc,
			IncidentAccessChecker: s.IncidentAccessChecker,
			GlobalAccessChecker:   s.GlobalAccessChecker,
			AccessQueries:         s.AccessQueries,
			Queries:               s.Queries,
		}, apiOpts...),
	}
	opts = append(opts, tlsOptions(v)...)

	oidcPartial := []string{"oidc-issuer", "oidc-client-secret", "oidc-redirect-url"}
	if v.GetString("oidc-client-id") != "" {
		for _, key := range oidcPartial {
			if v.GetString(key) == "" {
				err := fmt.Errorf("oidc-client-id, oidc-issuer, oidc-client-secret, and oidc-redirect-url must be configured together")
				slog.ErrorContext(ctx, "incomplete OIDC configuration", slog.String("missing", key), slog.String("error", err.Error()))

				return err
			}
		}
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
			slog.ErrorContext(ctx, "failed to create OIDC client", slog.String("error", err.Error()))
			return err
		}

		if s.UserRepo != nil {
			oidcClient.WithUserRepository(s.UserRepo)
		}

		if s.AccessSvc != nil {
			oidcClient.WithFirstUserBootstrap(s.AccessSvc.BootstrapFirstSystemAdmin)
		}

		opts = append(opts, server.WithOidc(oidcClient))
	} else if !v.GetBool("insecure-local-auth") {
		slog.ErrorContext(
			ctx,
			"OIDC not configured: set --oidc-client-id or pass --insecure-local-auth to allow unauthenticated access",
		)

		return fmt.Errorf(
			"OIDC client ID is required; pass --insecure-local-auth to explicitly allow unauthenticated local access",
		)
	} else {
		slog.WarnContext(ctx, "INSECURE: running without authentication, all requests accepted as local-user")
	}

	srv, err := server.NewServer(opts...)
	if err != nil {
		slog.ErrorContext(ctx, "failed to configure server", slog.String("error", err.Error()))
		return err
	}

	if err := srv.ListenAndServe(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.ErrorContext(ctx, "failed to start server", slog.String("error", err.Error()))
		return err
	}

	slog.InfoContext(ctx, "server stopped")

	return nil
}

func deriveCookieKey(input string) string {
	if input == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			panic(fmt.Sprintf("crypto/rand unavailable, cannot generate cookie signing key: %v", err))
		}

		return string(b)
	}

	sum := sha256.Sum256([]byte(input))

	return string(sum[:])
}
