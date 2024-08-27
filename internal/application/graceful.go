package application

import (
	"context"
	"os/signal"
	"syscall"
)

// gracefulStopCtx sets up the context for graceful shutdown
func gracefulStopCtx(ctx context.Context) (context.Context, context.CancelFunc) {

	return signal.NotifyContext(ctx,
		syscall.SIGHUP,  // kill -SIGHUP XXXX
		syscall.SIGINT,  // kill -SIGINT XXXX or Ctrl+c
		syscall.SIGTERM, // kill -SIGTERM XXXX
		syscall.SIGQUIT, // kill -SIGQUIT XXXX
	)
}
