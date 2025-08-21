package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	slogecho "github.com/samber/slog-echo"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"

	"github.com/f-eld-ch/sitrep/server/auth"
	"github.com/f-eld-ch/sitrep/ui"
)

type Server struct {
	logger         *slog.Logger
	isShuttingDown atomic.Bool
	port           uint
	address        string
	auth.Enforcer
	router *echo.Echo
	*http.Server
}

func NewServer(opts ...Option) *Server {
	s := &Server{
		logger:   slog.Default().WithGroup("server"),
		port:     8081,
		address:  "",
		router:   echo.New(),
		Enforcer: auth.NewLocalEnforcer(),
	}

	s.router.Use(middleware.Recover())

	s.router.Use(middleware.Secure())

	config := slogecho.Config{
		WithSpanID:       true,
		WithTraceID:      true,
		DefaultLevel:     slog.LevelInfo,
		ClientErrorLevel: slog.LevelWarn,
		ServerErrorLevel: slog.LevelError,
	}
	s.router.Use(slogecho.NewWithConfig(slog.Default().WithGroup("http"), config))

	s.router.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{http.MethodGet, http.MethodPost, http.MethodOptions},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))
	s.router.Use(middleware.RequestID())
	// Cache-Control middleware for /assets/* and /map/*
	s.router.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Before(func() {
				path := c.Request().URL.Path
				if c.Response().Status == http.StatusOK {
					if strings.HasPrefix(path, "/assets/") {
						c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
						return
					}
					// map is not immutable, so we set a shorter cache time
					if strings.HasPrefix(path, "/map/") {
						c.Response().Header().Set("Cache-Control", "public, max-age=604800")
						return
					}
				}

				// for everything else set no-cache
				c.Response().Header().Set("Cache-Control", "no-store")
			})

			return next(c)
		}
	})

	// Use the otelecho middleware with options
	s.router.Use(otelecho.Middleware("server",
		otelecho.WithSkipper(func(c echo.Context) bool {
			// Skip tracing for health check endpoints
			return c.Path() == "/health" || strings.HasPrefix(c.Path(), "/assets") || strings.HasPrefix(c.Path(), "/map")
		}),
	))

	s.router.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		HTML5:      true,
		Root:       ui.Build,
		Filesystem: http.FS(ui.Assets),
		Index:      "index.html",
	}))

	for _, opt := range opts {
		err := opt(s)
		if err != nil {
			s.logger.Error("failed to apply server option", "error", err)
			return nil
		}
	}

	// OIDC handlers
	oidc := s.router.Group("/oauth2")
	oidc.GET("/sign_in", s.Enforcer.SignInHandler)
	oidc.GET("/callback", s.Enforcer.CallbackHandler)
	oidc.GET("/sign_out", s.Enforcer.SignOutHandler)
	oidc.GET("/userinfo", s.Enforcer.UserInfoHandler)

	s.Server = &http.Server{
		Addr:    net.JoinHostPort(s.address, fmt.Sprint(s.port)),
		Handler: s.router,
	}

	return s
}

func (s *Server) ListenAndServe(ctx context.Context) error {
	s.isShuttingDown.Store(false)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, os.Kill)
	defer cancel()

	go func() {
		<-ctx.Done()
		s.logger.Info("shutting down server")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := s.Server.Shutdown(ctx)
		if err != nil {
			s.logger.Error("failed to shutdown server", "error", err)
		}
	}()

	//  signal and shutdown the server gracefully
	s.Server.RegisterOnShutdown(func() {
		s.isShuttingDown.Store(true)
	})

	s.logger.Info("starting server", "address", s.Addr)
	return s.Server.ListenAndServe()
}
