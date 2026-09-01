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

	s, err := buildStack(ctx)
	if err != nil {
		return err
	}
	defer s.Teardown()

	opts := []server.Option{
		server.WithPort(viper.GetUint("server_port")),
		server.WithApiV2(s.IncidentSvc, s.MessageSvc, s.LayerSvc, s.FeatureSvc, s.Queries,
			viper.GetBool("graphql_introspection")),
		server.WithVersion(Version, Sha),
	}

	if viper.GetString("oidc_client_id") != "" && viper.GetString("oidc_issuer") != "" {
		oidcClient, err := auth.NewOIDC(ctx,
			viper.GetString("oidc_issuer"),
			viper.GetString("oidc_client_id"),
			viper.GetString("oidc_client_secret"),
			viper.GetString("oidc_redirect_url"),
			deriveCookieKey(viper.GetString("cookie_key")),
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
