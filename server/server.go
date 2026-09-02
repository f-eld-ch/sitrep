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

	"github.com/labstack/echo/v5"

	"github.com/f-eld-ch/sitrep/server/auth"
)

type Server struct {
	logger         *slog.Logger
	isShuttingDown atomic.Bool
	port           uint
	address        string
	version        string
	sha            string
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

	for _, opt := range opts {
		err := opt(s)
		if err != nil {
			s.logger.Error("failed to apply server option", "error", err)
			return nil
		}
	}

	// register routes && middlewares
	s.RegisterMiddlewares()
	s.RegisterRoutes()

	s.Server = &http.Server{
		Addr:              net.JoinHostPort(s.address, fmt.Sprint(s.port)),
		Handler:           s.router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	return s
}

func (s *Server) ListenAndServe(ctx context.Context) error {
	s.isShuttingDown.Store(false)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, os.Kill)
	defer cancel()

	go func() {
		<-ctx.Done()
		s.logger.InfoContext(ctx, "shutting down server")

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		err := s.Shutdown(ctx)
		if err != nil {
			s.logger.ErrorContext(ctx, "failed to shutdown server", "error", err)
		}
	}()

	//  signal and shutdown the server gracefully
	s.RegisterOnShutdown(func() {
		s.isShuttingDown.Store(true)
	})

	s.logger.InfoContext(ctx, "starting server", "address", s.Addr)

	return s.Server.ListenAndServe()
}

func cacheControlMiddleWare(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		resp, err := echo.UnwrapResponse(c.Response())
		if err != nil {
			return next(c)
		}

		resp.Before(func() {
			path := c.Request().URL.Path
			if resp.Status == http.StatusOK {
				if strings.HasPrefix(path, "/assets/") {
					resp.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
					return
				}
				// map is not immutable, so we set a shorter cache time
				if strings.HasPrefix(path, "/map/") {
					resp.Header().Set("Cache-Control", "public, max-age=604800")
					return
				}
			}

			// for everything else set no-cache
			resp.Header().Set("Cache-Control", "no-store")
		})

		return next(c)
	}
}
