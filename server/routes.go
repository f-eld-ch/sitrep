package server

import (
	"net/http"
	"strings"

	echootel "github.com/labstack/echo-opentelemetry"

	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"

	"github.com/f-eld-ch/sitrep/ui"
)

// Routes registers all HTTP routes and handlers on the server's router.
func (s *Server) RegisterRoutes() {
	// static file service is handled with echo.Static middleware

	// health endpoints
	s.router.GET("/health", s.health)
	s.router.GET("/ping", s.health)
	s.router.GET("/ready", s.ready)

	// Build identity. Unauthenticated like the health endpoints: it exposes nothing the
	// served asset filenames do not already reveal.
	s.router.GET("/version", s.buildInfo)

	// OIDC handlers
	oidc := s.router.Group("/oauth2")
	oidc.GET("/sign_in", s.SignInHandler)
	oidc.GET("/callback", s.CallbackHandler)
	oidc.GET("/sign_out", s.SignOutHandler)
	oidc.GET("/userinfo", s.UserInfoHandler)
}

func (s *Server) RegisterMiddlewares() {
	s.router.Use(middleware.Recover())
	s.router.Use(middleware.Secure())
	s.router.Use(middleware.RequestID())

	// CORS MiddleWare
	s.router.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:  []string{"*"},
		AllowMethods:  []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:  []string{"Content-Type", "Authorization"},
		ExposeHeaders: []string{"Content-Length"},
	}))
	s.router.Use(cacheControlMiddleWare)

	// Use the echootel middleware with options
	s.router.Use(echootel.NewMiddlewareWithConfig(echootel.Config{
		ServerName: "server",
		Skipper: func(c *echo.Context) bool {
			// Skip tracing for health check endpoints
			return c.Path() == "/health" || strings.HasPrefix(c.Path(), "/assets") ||
				strings.HasPrefix(c.Path(), "/map")
		},
	}))

	// Static file serving
	s.router.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		HTML5:      true,
		Root:       ui.Build,
		Filesystem: ui.Assets,
		Index:      "index.html",
	}))
}
