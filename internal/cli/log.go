package cli

import (
	"log/slog"
	"os"
)

// logLevel is shared across all log handlers. Updating it takes effect immediately
// on all handlers that reference it, including any OTLP fanout installed later.
var logLevel = new(slog.LevelVar) // defaults to slog.LevelInfo

// initLogger installs a plain-text stdout handler that honours logLevel.
// It is called after configuration is loaded, and again by setupOpenTelemetry
// when it builds the OTLP fanout.
func initLogger() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))
}
