package server

import (
	"log/slog"
	"net/http"
	"net/url"

	"github.com/f-eld-ch/sitrep/server/auth"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/zitadel/logging"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Option defines a functional option for Server.
type Option func(*Server) error

// WithPort sets the server port.
func WithPort(port uint) Option {
	return func(s *Server) error {
		s.port = port
		return nil
	}
}

// WithAddress sets the server address.
func WithAddress(addr string) Option {
	return func(s *Server) error {
		s.address = addr
		return nil
	}
}

func WithOidc(oidcClient *auth.OIDCClient) Option {
	return func(s *Server) error {
		s.Enforcer = oidcClient
		return nil
	}
}

func WithApiV1Proxy() Option {
	return func(s *Server) error {
		// Protect API routes
		apiv1 := s.router.Group("/v1/graphql")
		apiv1.Use(s.Enforcer.RequireLogin)
		hasura, _ := url.Parse("http://localhost:8080")

		client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
		logging.EnableHTTPClient(client,
			logging.WithClientGroup("client"),
			logging.WithFallbackLogger(slog.Default().WithGroup("hasura_client")),
		)

		apiv1.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
			// add the id token to the request to hasura
			return func(c echo.Context) error {
				idToken, ok := c.Get("id_token").(string)
				if !ok || idToken == "" {
					return echo.NewHTTPError(http.StatusUnauthorized, "missing id_token")
				}
				c.Request().Header.Set("Authorization", "Bearer "+idToken)
				return next(c)
			}
		})

		apiv1.Use(middleware.ProxyWithConfig(
			middleware.ProxyConfig{
				Transport: client.Transport,
				Balancer:  middleware.NewRoundRobinBalancer([]*middleware.ProxyTarget{{URL: hasura}}),
			},
		))

		return nil
	}
}

func WithApiV2() Option {
	return func(s *Server) error {
		// Protect API routes
		apiv2 := s.router.Group("/api/v2", s.Enforcer.RequireLogin)
		apiv2.GET("/health", func(c echo.Context) error {
			return c.String(http.StatusOK, "OK")
		})
		return nil
	}
}
