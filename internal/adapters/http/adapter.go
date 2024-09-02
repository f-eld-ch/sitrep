package http

import (
	"context"
	"errors"
	"net"
	"net/http"

	"log/slog"

	"github.com/f-eld-ch/sitrep/internal/adapters/logger"
)

const (
	NAME string = "http-server"
)

// Adapter is http server app adapter.
type Adapter struct {
	httpServer *http.Server
}

// NewAdapter provides new primary HTTP adapter.
func NewAdapter(httpServer *http.Server) *Adapter {
	return &Adapter{
		httpServer: httpServer,
	}
}

// Start start http application adapter.
func (adapter *Adapter) Start(ctx context.Context) error {
	adapter.httpServer.BaseContext = func(_ net.Listener) context.Context { return ctx }
	logger.Info(ctx, "starting http server")

	var err error
	if adapter.httpServer.TLSConfig != nil {
		logger.Info(ctx, "starting http server", slog.String("address", adapter.httpServer.Addr), slog.Bool("withTLS", true))

		err = adapter.httpServer.ListenAndServeTLS("", "")
	} else {
		logger.Info(ctx, "starting http server", slog.String("address", adapter.httpServer.Addr), slog.Bool("withTLS", false))

		err = adapter.httpServer.ListenAndServe()
	}

	if err != http.ErrServerClosed && errors.Is(err, context.Canceled) {
		logger.Error(ctx, "failed to listenandServe", slog.String("errorMsg", err.Error()))
		return err
	}

	return nil
}

// Stop stops http application adapter.
func (adapter *Adapter) Stop(ctx context.Context) error {
	logger.Info(ctx, "stopping http server")
	return adapter.httpServer.Shutdown(ctx)
}

func (adapter *Adapter) Name() string {
	return NAME
}
