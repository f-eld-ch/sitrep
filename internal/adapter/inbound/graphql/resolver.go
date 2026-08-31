package graphql

import (
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Resolver is the root dependency-injection container for all GraphQL resolvers.
// It holds inbound port interfaces (services) for the write path and the outbound
// Queries port for the read path. Never concrete service types or adapters.
type Resolver struct {
	Incidents inbound.IncidentService
	Messages  inbound.MessageService
	Layers    inbound.LayerService
	Features  inbound.FeatureService
	Queries   outbound.Queries
}
