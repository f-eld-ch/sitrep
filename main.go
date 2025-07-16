package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/f-eld-ch/sitrep/server"
	"github.com/f-eld-ch/sitrep/server/auth"
)

func main() {
	opts := []server.Option{
		server.WithPort(8081),
	}

	if os.Getenv("OIDC_CLIENT_ID") != "" && os.Getenv("OIDC_ISSUER") != "" {
		issuer := os.Getenv("OIDC_ISSUER")
		clientID := os.Getenv("OIDC_CLIENT_ID")
		clientSecret := os.Getenv("OIDC_CLIENT_SECRET")
		redirectURI := os.Getenv("OIDC_REDIRECT_URL")
		key := os.Getenv("OIDC_COOKIE_KEY")

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
		server.WithApiV1Proxy(),
	)

	server := server.NewServer(opts...)

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))

	err := server.ListenAndServe(context.Background())
	if err != nil {
		slog.Error("failed to start server", "error", err)
	}
	slog.Info("server stopped")
}
