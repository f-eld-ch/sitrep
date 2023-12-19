package logger

import (
	"context"
	"log/slog"
	"os"

	"github.com/f-eld-ch/sitrep/internal/metadata"
)

var Logger slog.Logger
var logLevel slog.LevelVar

type LogHandler struct {
	level slog.Leveler
}

const (
	LevelTrace    = slog.Level(-8)
	LevelCritical = slog.Level(9)
	LevelFatal    = slog.Level(12)
)

var LevelNames = map[slog.Leveler]string{
	LevelFatal:    "FATAL",
	LevelCritical: "CRITICAL",
	LevelTrace:    "TRACE",
}

func SetVerbosity(verbosity slog.Leveler) {
	logLevel.Set(verbosity.Level())
}

func Trace(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, LevelTrace, m, attrs...)
}

func Debug(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, slog.LevelDebug, m, attrs...)
}

func Info(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, slog.LevelInfo, m, attrs...)
}

func Warning(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, slog.LevelWarn, m, attrs...)
}

func Error(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, slog.LevelError, m, attrs...)
}

func Critical(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, LevelCritical, m, attrs...)
}

func Fatal(ctx context.Context, m string, args ...slog.Attr) {
	attrs := getValuesFrom(ctx, args...)
	Logger.LogAttrs(ctx, LevelFatal, m, attrs...)
}

func getValuesFrom(ctx context.Context, args ...slog.Attr) []slog.Attr {
	mtd, ok := metadata.FromContext(ctx)

	if !ok {
		return args
	}

	attrs := []slog.Attr{
		slog.String("trace_id", mtd.TraceID),
		slog.Group("client",
			slog.String("ip_address", mtd.IPAddress.String()),
			slog.String("http_remote_addr", mtd.IPAddress.String()),
			slog.String("http_user_agent", mtd.UserAgent),
		),
		slog.Int("http_status", mtd.StatusCode),
	}

	attrs = append(attrs, args...)

	return attrs
}

func init() {
	logLevel.Set(slog.LevelInfo)
	opts := &slog.HandlerOptions{
		Level: &logLevel,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.LevelKey {
				level := a.Value.Any().(slog.Level)
				levelLabel, exists := LevelNames[level]
				if !exists {
					levelLabel = level.String()
				}

				a.Value = slog.StringValue(levelLabel)
			}
			return a
		},
	}
	l := slog.New(slog.NewJSONHandler(os.Stdout, opts))

	slog.SetDefault(l)
	Logger = *l
}
