package otel

import (
	"github.com/f-eld-ch/sitrep/internal/buildinfo"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func Resources() (*resource.Resource, error) {
	return resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(semconv.SchemaURL,
			semconv.ServiceName("github.com/f-eld/sitrep"),
			semconv.ServiceVersion(buildinfo.GetVersion().Version),
		),
	)
}
