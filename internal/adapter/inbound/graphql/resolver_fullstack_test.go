package graphql_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	gqlresolver "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/filesystem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	inmemstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// fullStack wires everything the resolvers can reach: events, projections, the access service
// and its checkers, resources, Schadenplaetze and a filesystem blob store for attachments.
type fullStack struct {
	resolver *gqlresolver.Resolver
	proj     *projection.Projector
	// messages is the message service, which also exposes AttachFile.
	messages inbound.MessageService
}

func newFullStack(t *testing.T) *fullStack {
	t.Helper()

	store := inmemstore.NewEventStore()
	notifier := inmemstore.NewNotifier()

	incRepo := eventstore.NewIncidentRepository(store)
	msgRepo := eventstore.NewMessageRepository(store)
	layerRepo := eventstore.NewLayerRepository(store)
	featureRepo := eventstore.NewFeatureRepository(store)
	spRepo := eventstore.NewSchadenplatzRepository(store)
	resRepo := eventstore.NewResourceRepository(store)

	incHandler := projection.NewIncidentHandler()
	divHandler := projection.NewIncidentDivisionHandler()
	msgHandler := projection.NewMessageHandler()
	layerHandler := projection.NewLayerFeaturesHandler()
	spHandler := projection.NewSchadenplatzHandler()
	resourceHandler := projection.NewResourceHandler()
	accessHandler := projection.NewAccessHandler()

	accessChecker := inmemstore.NewIncidentAccessChecker(accessHandler)
	globalChecker := inmemstore.NewGlobalAccessChecker(accessHandler)
	accessQueries := inmemqueries.NewAccessQueries(accessHandler)
	queries := inmemqueries.NewQueries(
		incHandler, divHandler, msgHandler, layerHandler, spHandler, resourceHandler, accessChecker,
	)

	blobs, err := filesystem.New(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, blobs.Close()) })

	factory := service.NewFactory(
		service.WithTransactor(inmemstore.NewTransactor()),
		service.WithClock(inmemstore.WallClock{}),
		service.WithIDs(inmemstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(inmemstore.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmemstore.NewIncidentHierarchyGuard(store)),
		service.WithIncidentAccessRepository(eventstore.NewIncidentAccessRepository(store)),
		service.WithIncidentAccessChecker(accessChecker),
		service.WithAccessGuard(inmemstore.NewAccessGuard()),
		service.WithAccessGroupRepository(eventstore.NewAccessGroupRepository(store)),
		service.WithGlobalAccessRepository(eventstore.NewGlobalAccessRepository(store)),
		service.WithGlobalAccessChecker(globalChecker),
		service.WithAccessQueries(accessQueries),
		service.WithBlobStore(blobs),
		service.WithQueries(queries),
	)

	incidentSvc := factory.IncidentService(incRepo, layerRepo)
	incidentSvc.WithSchadenplatzRepository(spRepo)
	incidentSvc.WithMessageSource(queries, msgRepo)

	messageSvc := factory.MessageService(msgRepo, incRepo)

	proj := projection.NewProjector(store, []projection.Handler{
		incHandler, divHandler, msgHandler, layerHandler, spHandler, resourceHandler, accessHandler,
	})

	r := &gqlresolver.Resolver{
		Incidents:             incidentSvc,
		Messages:              messageSvc,
		Layers:                factory.LayerService(layerRepo, incRepo),
		Features:              factory.FeatureService(featureRepo, incRepo, layerRepo, msgRepo),
		Access:                factory.AccessService(),
		Schadenplaetze:        factory.SchadenplatzService(spRepo, incRepo),
		Resources:             factory.ResourceService(resRepo, incRepo, spRepo),
		Timeline:              factory.TimelineService(store, queries),
		Queries:               queries,
		AccessQueries:         accessQueries,
		IncidentAccessChecker: accessChecker,
		GlobalAccessChecker:   globalChecker,
	}

	return &fullStack{resolver: r, proj: proj, messages: messageSvc}
}

// ctxFor returns a context authenticated as the given subject.
func ctxFor(sub string) context.Context {
	return identity.WithActor(context.Background(), identity.Actor{Sub: sub, Name: sub, Email: sub + "@example.com"})
}

// catchUp flushes the projections so read-model queries see earlier writes.
func (s *fullStack) catchUp(t *testing.T) {
	t.Helper()

	require.NoError(t, s.proj.CatchUp(context.Background()))
}

// createIncident creates an incident as the given subject sub in the given access mode.
func (s *fullStack) createIncident(
	t *testing.T,
	sub string,
	name string,
	mode model.IncidentAccessMode,
) *model.Incident {
	t.Helper()

	res, err := s.resolver.Mutation().CreateIncident(ctxFor(sub), model.CreateIncidentInput{
		Name:      name,
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
		Mode:      &mode,
	})
	require.NoError(t, err)
	s.catchUp(t)

	return res.Incident
}

// bootstrapAdmin makes sub a system administrator.
func (s *fullStack) bootstrapAdmin(t *testing.T, sub string) {
	t.Helper()

	ctx := ctxFor(sub)
	actor, err := identity.ActorFrom(ctx)
	require.NoError(t, err)
	require.NoError(t, s.resolver.Access.BootstrapFirstSystemAdmin(ctx, sub, actor))
	s.catchUp(t)
}
