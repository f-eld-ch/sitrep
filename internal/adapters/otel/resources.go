package otel

import (
	"fmt"
	"os"

	"github.com/f-eld-ch/sitrep/internal/buildinfo"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

func Resources() (*resource.Resource, error) {
	env := "production"
	version := buildinfo.GetVersion()

	if version.Version == "devel" {
		env = "development"
	}

	hostname, err := os.Hostname()
	if err != nil {
		return nil, fmt.Errorf("cannot get hostname: %w", err)
	}

	return resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(semconv.SchemaURL,
			semconv.ServiceName("sitrep"),
			semconv.ServiceVersion(version.Version),
			semconv.ServiceInstanceID(hostname),
			semconv.DeploymentEnvironment(env),
		),
	)
}
