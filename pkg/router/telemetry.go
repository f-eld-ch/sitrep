package router

import (
	"context"

	"go.opentelemetry.io/otel"
	stdout "go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	resource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"

	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"

	"github.com/RedGecko/sitrep/pkg"
)

var tracer = otel.Tracer("sitrep-backend")

func getTracer() (*sdktrace.TracerProvider, error) {

	// TODO(daa): replace with proper exporter
	exporter, err := stdout.New(stdout.WithPrettyPrint())

	if err != nil {
		return nil, err
	}

	r, _ := resource.New(context.Background(),
		resource.WithFromEnv(),
		resource.WithContainer(),
		resource.WithSchemaURL(semconv.SchemaURL),
		resource.WithAttributes(
			semconv.ServiceNameKey.String("sitrep-backend"),
			semconv.ServiceVersionKey.String(pkg.Version),
		),
	)

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(r),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	return tp, nil
}
