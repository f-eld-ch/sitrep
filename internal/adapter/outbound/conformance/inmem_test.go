package conformance_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/conformance"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	inmemproj "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func TestConformance_Inmem(t *testing.T) {
	conformance.Run(t, inmemFactory)
}

func inmemFactory(t *testing.T) *conformance.Backend {
	t.Helper()

	store := inmem.NewEventStore()
	transactor := inmem.NewTransactor()
	notifier := inmem.NewNotifier()
	lock := inmem.NewProjectorLock()

	incidentH := inmemproj.NewIncidentHandler()
	divisionH := inmemproj.NewIncidentDivisionHandler()
	messageH := inmemproj.NewMessageHandler()
	layerH := inmemproj.NewLayerFeaturesHandler()
	accessH := inmemproj.NewAccessHandler()

	handlers := []inmemproj.Handler{incidentH, divisionH, messageH, layerH, accessH}
	projector := inmemproj.NewProjector(store, handlers)

	incidentAccess := inmem.NewIncidentAccessChecker(accessH)
	globalAccess := inmem.NewGlobalAccessChecker(accessH)

	// No access checker: canRead always returns true, so tests don't need an actor in ctx.
	queries := inmemqueries.NewQueries(incidentH, divisionH, messageH, layerH)
	accessQueries := inmemqueries.NewAccessQueries(accessH)

	return &conformance.Backend{
		Store:          store,
		Transactor:     transactor,
		Notifier:       notifier,
		Queries:        queries,
		AccessQueries:  accessQueries,
		IncidentAccess: incidentAccess,
		GlobalAccess:   globalAccess,
		Lock:           lock,

		Project: func(ctx context.Context) error {
			return projector.CatchUp(ctx)
		},
		ResetProjections: func(ctx context.Context) error {
			return projector.Reset(ctx)
		},
		ApplyEvent: func(ctx context.Context, handlerName string, e eventsourcing.Event) error {
			for _, h := range handlers {
				if h.Name() == handlerName {
					return h.Apply(ctx, e)
				}
			}

			return fmt.Errorf("no handler named %q", handlerName)
		},

		// Known divergences in the inmem projection layer.
		// Each false value corresponds to an open bug in that handler.
		Caps: conformance.Capabilities{
			// inmem/projection/layer.go bumps revision unconditionally on Moved/Restyled.
			RevisionIdempotent: false,
			// inmem/projection/layer.go errors on Placed into a missing layer.
			PlaceIntoMissingLayerIsNoop: false,
			// inmem/projection/layer.go uses a map, not an ordered slice.
			FeatureOrderStable: false,
			// queries/postgres/queries.go:553-568 filters on the wrong id column.
			FeatureLookupByID: false,
		},
	}
}
