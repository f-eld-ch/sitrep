package otel

import (
	"context"
	"errors"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/stdout/stdoutmetric"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const (
	NAME string = "otel-exporter"
)

// Adapter is http server app adapter.
type Adapter struct {
	Tracer  *sdktrace.TracerProvider
	Metrics *sdkmetric.MeterProvider
	// Logs    *sdklog.LoggerProvider
}

// NewAdapter provides new OpenTelemetry adapter.
func NewAdapter() *Adapter {
	slog.Info("creating OTEL adapter")
	// 1) setup the conn
	// 2) setup the resources
	res, err := Resources()
	if err != nil {
		slog.Error("cannot create OTEL resources", slog.String("error", err.Error()))
		return nil
	}

	// 2) set up the providers
	// 2.1) metrics
	metricExporter, err := stdoutmetric.New()
	meterProvider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
		sdkmetric.WithResource(res),
	)
	if err != nil {
		slog.Error("cannot create OTEL meterProvider", slog.String("error", err.Error()))
		return nil
	}
	otel.SetMeterProvider(meterProvider)

	// 2.2) traces
	traceExporter, err := stdouttrace.New()
	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(res),
		sdktrace.WithSpanProcessor(sdktrace.NewBatchSpanProcessor(traceExporter)),
	)
	if err != nil {
		slog.Error("cannot create OTEL tracerProvider", slog.String("error", err.Error()))
		return nil
	}
	otel.SetTracerProvider(tracerProvider)
	otel.SetTextMapPropagator(propagation.TraceContext{})

	// // 2.3 Logs
	// logsExporter, err := stdoutlog.New()
	// logProcessor := log.NewBatchProcessor(logsExporter)
	// loggerProvider := log.NewLoggerProvider(
	// 	log.WithResource(res),
	// 	log.WithProcessor(logProcessor),
	// )
	// if err != nil {
	// 	slog.Error("cannot create OTEL logsProvider", slog.String("error", err.Error()))
	// 	return nil
	// }
	// global.SetLoggerProvider(loggerProvider)
	// l := otelslog.NewLogger("github.com/f-eld/sitrep", otelslog.WithLoggerProvider(loggerProvider), otelslog.WithVersion(buildinfo.GetVersion().Version), otelslog.WithSchemaURL(semconv.SchemaURL))
	// slog.SetDefault(l)

	return &Adapter{
		Tracer:  tracerProvider,
		Metrics: meterProvider,
		// Logs:    loggerProvider,
	}
}

// NewAdapter creates and initializes a new OpenTelemetry adapter.
func (adapter *Adapter) Start(ctx context.Context) error {
	slog.Info("starting otel exporter")
	return nil
}

// Stop stops http application adapter.
func (adapter *Adapter) Stop(ctx context.Context) error {
	slog.Info("starting otel exporter")

	err := errors.Join(
		adapter.Tracer.ForceFlush(ctx),
		adapter.Metrics.ForceFlush(ctx),
		// adapter.Logs.ForceFlush(ctx),
	)
	if err != nil {
		slog.Error("cannot flush OTEL adapters", slog.String("error", err.Error()))
	}

	return errors.Join(
		adapter.Tracer.Shutdown(ctx),
		adapter.Metrics.Shutdown(ctx),
		// adapter.Logs.Shutdown(ctx),
	)
}

func (adapter *Adapter) Name() string {
	return NAME
}
