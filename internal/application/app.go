package application

import (
	"context"
	"log/slog"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/f-eld-ch/sitrep/internal/adapters/logger"
)

// Adapter interface
type Adapter interface {
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Name() string
}

// App represents application service
type App struct {
	adapters        []Adapter
	shutdownTimeout time.Duration
}

// New provides new service application
func New() *App {
	return &App{
		shutdownTimeout: 5 * time.Second, // Default shutdown timeout
	}
}

// AddAdapters adds adapters to application service
func (app *App) AddAdapters(adapters ...Adapter) {
	app.adapters = append(app.adapters, adapters...)
}

// WithShutdownTimeout overrides default shutdown timout
func (app *App) WithShutdownTimeout(timeout time.Duration) {
	app.shutdownTimeout = timeout
}

// Run runs the service application
func (app *App) Run(ctx context.Context) {
	ctx, stop := gracefulStopCtx(ctx)
	defer stop()

	g, gCtx := errgroup.WithContext(ctx)

	for _, a := range app.adapters {
		adapter := a

		// start the adapters
		g.Go(func() error {
			logger.Info(ctx, "starting adapter", slog.String("name", adapter.Name()))
			err := adapter.Start(ctx)
			if err != nil {
				logger.Critical(ctx, "adapter start error", slog.String("error", err.Error()), slog.String("adapter", adapter.Name()))
				return err
			}
			return nil
		})

		// setup the termination handlers for the adapters
		g.Go(func() error {
			<-gCtx.Done()
			ctxWithTimeout, cancel := context.WithTimeout(ctx, app.shutdownTimeout)
			defer cancel()
			logger.Info(ctx, "stopping adapter", slog.String("name", adapter.Name()))
			err := adapter.Stop(ctxWithTimeout)

			if err != nil {
				logger.Critical(ctx, "adapter start error", slog.String("error", err.Error()), slog.String("adapter", adapter.Name()))
				return err
			}
			return nil
		})
	}

	<-gCtx.Done()

	err := g.Wait()
	if err != nil {
		logger.Critical(ctx, "unclean exit of application", slog.String("error", err.Error()))

	}
}
