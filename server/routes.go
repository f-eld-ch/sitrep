package server

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"

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
	oidc.GET("/sign_in", s.Enforcer.SignInHandler)
	oidc.GET("/callback", s.Enforcer.CallbackHandler)
	oidc.GET("/sign_out", s.Enforcer.SignOutHandler)
	oidc.GET("/userinfo", s.Enforcer.UserInfoHandler)
}

func (s *Server) RegisterMiddlewares() {
	s.router.Use(middleware.Recover())
	s.router.Use(middleware.Secure())
	s.router.Use(middleware.RequestID())

	// CORS MiddleWare
	s.router.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))
	s.router.Use(cacheControlMiddleWare)

	// Use the otelecho middleware with options
	s.router.Use(otelecho.Middleware("server",
		otelecho.WithSkipper(func(c echo.Context) bool {
			// Skip tracing for health check endpoints
			return c.Path() == "/health" || strings.HasPrefix(c.Path(), "/assets") || strings.HasPrefix(c.Path(), "/map")
		}),
	))

	// Static file serving
	s.router.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		HTML5:      true,
		Root:       ui.Build,
		Filesystem: http.FS(ui.Assets),
		Index:      "index.html",
	}))
}
