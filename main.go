package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"log/slog"
	"net/http"

	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/server"
	"github.com/f-eld-ch/sitrep/server/auth"
)

// Build identity, set at link time via -ldflags (see .ko.yaml). The defaults apply to
// local `go build` and `go run`, so an unset value is visibly "dev" rather than empty.
var (
	version = "dev"
	sha     = "dev"
)

func init() {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AutomaticEnv()

	_ = viper.BindEnv("oidc_client_id", "OIDC_CLIENT_ID", "OAUTH2_PROXY_CLIENT_ID")
	_ = viper.BindEnv("oidc_issuer", "OIDC_ISSUER", "OAUTH2_PROXY_OIDC_ISSUER_URL")
	_ = viper.BindEnv("oidc_client_secret", "OIDC_CLIENT_SECRET", "OAUTH2_PROXY_CLIENT_SECRET")
	_ = viper.BindEnv("oidc_redirect_url", "OIDC_REDIRECT_URL", "OAUTH2_PROXY_REDIRECT_URL")
	_ = viper.BindEnv("cookie_key", "COOKIE_KEY", "OAUTH2_PROXY_COOKIE_SECRET", "OIDC_COOKIE_KEY")
	_ = viper.BindEnv("hasura_backend", "HASURA_BACKEND")
	_ = viper.BindEnv("server_port", "SERVER_PORT")
	viper.SetDefault("hasura_backend", "http://localhost:8080")
	viper.SetDefault("server_port", 4180)
}

// deriveCookieKey returns a 32-byte key derived from the provided input.
// If input is empty, it generates a random 32-byte key.
// The returned value is a string whose underlying bytes are exactly 32 bytes long,
// suitable for libraries that expect a 32-byte secret.
func deriveCookieKey(input string) string {
	if input == "" {
		b := make([]byte, 32)
		_, err := rand.Read(b)
		if err != nil {
			// fallback: use zeroed bytes (should rarely happen)
			return string(make([]byte, 32))
		}
		return string(b)
	}
	sum := sha256.Sum256([]byte(input))
	return string(sum[:])
}

func main() {
	ctx := context.Background()
	shutdown, err := setupOpenTelemetry(ctx)
	if err != nil {
		slog.Error("failed to configure OpenTelemetry", "error", err)
		return
	}

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

		// Pass the derived key (32 bytes) to the OIDC constructor
		oidcClient, err := auth.NewOIDC(context.Background(), issuer, clientID, clientSecret, redirectURI, key)
		if err != nil {
			slog.Error("failed to create OIDC client", "error", err)
			return
		}

		opts = append(opts, server.WithOidc(oidcClient))
	} else {
		slog.Warn("OIDC client not configured, using local enforcer")
	}

	// needs to go last to make use of correct enforcers
	opts = append(opts,
		server.WithApiV2(),
		server.WithVersion(version, sha),
		server.WithApiV1Proxy(viper.GetString("hasura_backend")),
	)

	server := server.NewServer(opts...)

	err = server.ListenAndServe(ctx)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("failed to start server", "error", err)
	}
	slog.Info("server stopped")

	err = shutdown(ctx)
	if err != nil {
		slog.Error("failed to shutdown OpenTelemetry", "error", err)
	}

	slog.Info("Sitrep shutdown complete")
}
