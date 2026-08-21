package server

import (
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/f-eld-ch/sitrep/server/auth"
)

// WithVersion records the build identity so it can be served to clients.
//
// The UI is embedded in this binary (see ui.Assets), so these values describe the frontend
// being served as much as the backend, which is what lets the update prompt name the
// version it is offering.
func WithVersion(version, sha string) Option {
	return func(s *Server) error {
		s.version = version
		s.sha = sha
		return nil
	}
}

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

func WithApiV1Proxy(upstream string) Option {
	return func(s *Server) error {
		// Protect API routes
		apiv1 := s.router.Group("/v1/graphql")
		apiv1.Use(s.Enforcer.RequireLogin)
		hasura, _ := url.Parse(upstream)

		client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
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
