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
var Version = "dev"
var Sha = "dev"

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
		slog.Error("failed to configure OpenTelemetry", "error", err)
		return err
	}
	defer func() {
		if err := shutdown(ctx); err != nil {
			slog.Error("failed to shutdown OpenTelemetry", "error", err)
		}
	}()

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
			slog.Error("failed to create OIDC client", "error", err)
			return err
		}
		opts = append(opts, server.WithOidc(oidcClient))
	} else {
		slog.Warn("OIDC client not configured, using local enforcer")
	}

	opts = append(opts,
		server.WithApiV2(),
		server.WithVersion(Version, Sha),
		server.WithApiV1Proxy(viper.GetString("hasura_backend")),
	)

	srv := server.NewServer(opts...)
	err = srv.ListenAndServe(ctx)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("failed to start server", "error", err)
		return err
	}
	slog.Info("server stopped")
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
