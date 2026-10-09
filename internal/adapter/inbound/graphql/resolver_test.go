package graphql_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gqlresolver "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	inmemstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// testStack wires the full inmem adapter set and exposes the resolver.
type testStack struct {
	resolver *gqlresolver.Resolver
	proj     *projection.Projector
}

func newTestStack(t *testing.T) *testStack {
	t.Helper()

	store := inmemstore.NewEventStore()
	tx := inmemstore.NewTransactor()
	notifier := inmemstore.NewNotifier()
	counter := inmemstore.NewMessageCounter()

	incRepo := eventstore.NewIncidentRepository(store)
	msgRepo := eventstore.NewMessageRepository(store)
	layerRepo := eventstore.NewLayerRepository(store)
	featureRepo := eventstore.NewFeatureRepository(store)
	spRepo := eventstore.NewSchadenplatzRepository(store)
	resRepo := eventstore.NewResourceRepository(store)

	factory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(inmemstore.WallClock{}),
		service.WithIDs(inmemstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(counter),
		service.WithIncidentHierarchyGuard(inmemstore.NewIncidentHierarchyGuard(store)),
	)

	incidentSvc := factory.IncidentService(incRepo, layerRepo)
	incidentSvc.WithSchadenplatzRepository(spRepo)

	messageSvc := factory.MessageService(msgRepo, incRepo)
	layerSvc := factory.LayerService(layerRepo, incRepo)
	featureSvc := factory.FeatureService(featureRepo, incRepo, layerRepo, msgRepo)
	resourceSvc := factory.ResourceService(resRepo, incRepo, spRepo)

	incHandler := projection.NewIncidentHandler()
	divHandler := projection.NewIncidentDivisionHandler()
	msgHandler := projection.NewMessageHandler()
	layerHandler := projection.NewLayerFeaturesHandler()

	spHandler := projection.NewSchadenplatzHandler()
	resourceHandler := projection.NewResourceHandler()

	proj := projection.NewProjector(store, []projection.Handler{
		incHandler, divHandler, msgHandler, layerHandler, spHandler, resourceHandler,
	})
	queries := inmemqueries.NewQueries(incHandler, divHandler, msgHandler, layerHandler, spHandler, resourceHandler)

	r := &gqlresolver.Resolver{
		Incidents: incidentSvc,
		Messages:  messageSvc,
		Layers:    layerSvc,
		Features:  featureSvc,
		Resources: resourceSvc,
		Queries:   queries,
		Timeline:  factory.TimelineService(store, queries),
	}

	return &testStack{resolver: r, proj: proj}
}

// actorCtx returns a context with a test actor injected.
func actorCtx() context.Context {
	return identity.WithActor(context.Background(), identity.Actor{
		Sub:   "test-sub",
		Email: "test@example.com",
		Name:  "Test User",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident mutation resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestCreateIncident_ReturnsModel(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	result, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Test Incident",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})

	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotNil(t, result.Incident)
	assert.Equal(t, "Test Incident", result.Incident.Name)
	assert.False(t, result.Incident.IsClosed)
	assert.NotEmpty(t, result.Incident.ID)
	_, err = uuid.Parse(result.Incident.ID)
	require.NoError(t, err, "ID must be a valid UUID")
}

func TestCreateIncident_WithDivisionsAndLayers(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	result, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Incident With Divisions",
		Divisions: []*model.DivisionInput{
			{Name: "Alpha", Description: "First division"},
			{Name: "Bravo", Description: "Second division"},
		},
		Layers: []*model.LayerInput{{Name: "Ops Map"}},
	})

	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotNil(t, result.Incident)
	assert.Equal(t, "Incident With Divisions", result.Incident.Name)
	// the system-managed message map division comes first
	require.Len(t, result.Incident.Divisions, 3)
	assert.Equal(t, model.DivisionKindMessageMap, result.Incident.Divisions[0].Kind)
	assert.Equal(t, "Alpha", result.Incident.Divisions[1].Name)
}

func TestCreateIncident_NoActor_ReturnsError(t *testing.T) {
	s := newTestStack(t)

	_, err := s.resolver.Mutation().CreateIncident(context.Background(), model.CreateIncidentInput{
		Name:      "Should Fail",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})

	require.Error(t, err)
}

func TestCreateIncident_InvalidUUID_NotAnIssue(t *testing.T) {
	// CreateIncident doesn't take a UUID; the server generates one.
	// This test just verifies the returned ID is always a valid UUID.
	s := newTestStack(t)
	ctx := actorCtx()

	result, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "UUID Check",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})

	require.NoError(t, err)
	require.NotNil(t, result.Incident)

	_, parseErr := uuid.Parse(result.Incident.ID)
	assert.NoError(t, parseErr)
}

func TestCloseAndReopenIncident(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Closeable",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.NotNil(t, created.Incident)

	closed, err := s.resolver.Mutation().CloseIncident(ctx, created.Incident.ID)
	require.NoError(t, err)
	// Only the closed state changes; identity and name must be preserved.
	assert.Equal(t, created.Incident.ID, closed.ID)
	assert.Equal(t, created.Incident.Name, closed.Name)
	assert.True(t, closed.IsClosed)
	require.NotNil(t, closed.ClosedAt)

	reopened, err := s.resolver.Mutation().ReopenIncident(ctx, closed.ID)
	require.NoError(t, err)
	// Reopen clears the closed state; everything else must be unchanged.
	assert.Equal(t, closed.ID, reopened.ID)
	assert.Equal(t, closed.Name, reopened.Name)
	assert.False(t, reopened.IsClosed)
	assert.Nil(t, reopened.ClosedAt)
}

func TestUpdateIncident(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Original Name",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	newName := "Updated Name"
	updated, err := s.resolver.Mutation().UpdateIncident(ctx, created.Incident.ID, model.UpdateIncidentInput{
		Name: &newName,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	// Fields not in the update input must be preserved unchanged.
	assert.Equal(t, created.Incident.ID, updated.ID)
	assert.Equal(t, created.Incident.IsClosed, updated.IsClosed)
	assert.Equal(t, created.Incident.ClosedAt, updated.ClosedAt)
}

func TestDeleteIncident(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "To Delete",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().CloseIncident(ctx, created.Incident.ID)
	require.NoError(t, err)

	deletedID, err := s.resolver.Mutation().DeleteIncident(ctx, created.Incident.ID)
	require.NoError(t, err)
	assert.Equal(t, created.Incident.ID, deletedID)
}

func TestUpdateIncident_InvalidID_ReturnsError(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	name := "X"
	_, err := s.resolver.Mutation().UpdateIncident(ctx, "not-a-uuid", model.UpdateIncidentInput{Name: &name})
	require.Error(t, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Incident query resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestIncidents_QueryAfterCatchUp(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	_, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "First",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Second",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	incidents, err := s.resolver.Query().Incidents(ctx)
	require.NoError(t, err)
	assert.Len(t, incidents, 2)
}

func TestIncident_QueryByID(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Lookup Target",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	got, err := s.resolver.Query().Incident(ctx, created.Incident.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.Incident.ID, got.ID)
	assert.Equal(t, "Lookup Target", got.Name)
}

func TestIncident_QueryByID_NotFound(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	require.NoError(t, s.proj.CatchUp(ctx))

	_, err := s.resolver.Query().Incident(ctx, uuid.NewString())
	require.Error(t, err)
}

func TestIncidents_DeletedNotVisible(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "To Delete",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CloseIncident(ctx, created.Incident.ID)
	require.NoError(t, err)
	_, err = s.resolver.Mutation().DeleteIncident(ctx, created.Incident.ID)
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	incidents, err := s.resolver.Query().Incidents(ctx)
	require.NoError(t, err)
	assert.Empty(t, incidents)
}

// ─────────────────────────────────────────────────────────────────────────────
// Message mutation resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestCreateMessage_ReturnsModel(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Msg Test",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	now := time.Now().UTC().Truncate(time.Second)
	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "Alice",
		Receiver:       "Bob",
		SenderDetail:   "alpha",
		ReceiverDetail: "bravo",
		Content:        "Hello World",
		Medium:         model.MediumRadio,
		Time:           &now,
	})

	require.NoError(t, err)
	require.NotNil(t, msg)
	assert.NotEmpty(t, msg.ID)
	assert.Equal(t, "Hello World", msg.Content)
	assert.Equal(t, "Alice", msg.Sender)
	assert.Equal(t, "Bob", msg.Receiver)
	assert.Equal(t, "alpha", msg.SenderDetail)
	assert.Equal(t, "bravo", msg.ReceiverDetail)
	assert.Equal(t, model.MediumRadio, msg.Medium)
	assert.Equal(t, now, msg.Time)
}

func TestUpdateMessage_CorrectContent(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Correct Test",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "Alice",
		Receiver:       "Bob",
		SenderDetail:   "555-1111",
		ReceiverDetail: "555-2222",
		Content:        "Original",
		Medium:         model.MediumPhone,
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	corrected := "Corrected"
	updated, err := s.resolver.Mutation().UpdateMessage(ctx, msg.ID, model.UpdateMessageInput{
		Content: &corrected,
	})

	require.NoError(t, err)
	assert.Equal(t, msg.ID, updated.ID)
	assert.Equal(t, "Corrected", updated.Content)
	// Fields not included in the update input must be preserved unchanged.
	assert.Equal(t, msg.Sender, updated.Sender)
	assert.Equal(t, msg.Receiver, updated.Receiver)
	assert.Equal(t, msg.SenderDetail, updated.SenderDetail)
	assert.Equal(t, msg.ReceiverDetail, updated.ReceiverDetail)
	assert.Equal(t, msg.Medium, updated.Medium)
}

func TestDeleteMessage(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Delete Msg",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "X",
		Receiver:       "Y",
		SenderDetail:   "sender@example.test",
		ReceiverDetail: "receiver@example.test",
		Content:        "To Remove",
		Medium:         model.MediumEmail,
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	deletedID, err := s.resolver.Mutation().DeleteMessage(ctx, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, msg.ID, deletedID)
}

// ─────────────────────────────────────────────────────────────────────────────
// Message query resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestMessage_QueryByID(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Msg Query",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	created, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "S",
		Receiver:       "R",
		SenderDetail:   "",
		ReceiverDetail: "",
		Content:        "Query me",
		Medium:         model.MediumOther,
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	got, err := s.resolver.Query().Message(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "Query me", got.Content)
}

func TestIncident_Messages_FieldResolver(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Messages Field",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "A",
		Receiver:       "B",
		SenderDetail:   "",
		ReceiverDetail: "",
		Content:        "First",
		Medium:         model.MediumRadio,
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.Incident.ID,
		Sender:         "A",
		Receiver:       "B",
		SenderDetail:   "",
		ReceiverDetail: "",
		Content:        "Second",
		Medium:         model.MediumRadio,
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	msgs, err := s.resolver.Incident().Messages(ctx, inc.Incident)
	require.NoError(t, err)
	assert.Len(t, msgs, 2)
}

func TestMessages_AcrossIncidents_Segregated(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	incA, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "A", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)
	incB, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "B", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: incA.Incident.ID, Sender: "X", Receiver: "Y",
		SenderDetail: "", ReceiverDetail: "", Content: "For A", Medium: model.MediumRadio,
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: incB.Incident.ID, Sender: "X", Receiver: "Y",
		SenderDetail: "", ReceiverDetail: "", Content: "For B", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	msgsA, err := s.resolver.Incident().Messages(ctx, incA.Incident)
	require.NoError(t, err)
	assert.Len(t, msgsA, 1)
	assert.Equal(t, "For A", msgsA[0].Content)

	msgsB, err := s.resolver.Incident().Messages(ctx, incB.Incident)
	require.NoError(t, err)
	assert.Len(t, msgsB, 1)
	assert.Equal(t, "For B", msgsB[0].Content)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer query resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestLayersForIncident_AfterCreate(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Layer Test",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "Sector Map"}},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)
	require.Len(t, layers, 2, "requested layer + message map layer")
	assert.Equal(t, model.LayerKindMessageMap, layers[0].Kind)

	layers = userLayers(layers)
	require.Len(t, layers, 1)
	assert.Equal(t, "Sector Map", layers[0].Name)
}

func TestCreateIncident_WithParentLinksAtomically(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	parent, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "KFS",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "KFS Karte"}},
	})
	require.NoError(t, err)

	child, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "GFS Altdorf",
		ParentID:  &parent.Incident.ID,
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "Lagekarte"}},
	})
	require.NoError(t, err)
	require.NotNil(t, child.Incident.ParentID)
	assert.Equal(t, parent.Incident.ID, *child.Incident.ParentID)

	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, parent.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)
	assert.Equal(t, []string{"KFS:KFS Karte", "GFS Altdorf:Lagekarte"}, []string{
		layers[0].SourceIncidentName + ":" + layers[0].Name,
		layers[1].SourceIncidentName + ":" + layers[1].Name,
	})
}

func TestLayersForIncident_IncludesChildLayersForParentOnly(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	parent, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Regional",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "Regional Map"}},
	})
	require.NoError(t, err)

	child, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Municipal",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "Municipal Map"}},
	})
	require.NoError(t, err)

	linked, err := s.resolver.Mutation().LinkIncidentParent(ctx, child.Incident.ID, parent.Incident.ID)
	require.NoError(t, err)
	require.NotNil(t, linked.ParentID)
	assert.Equal(t, parent.Incident.ID, *linked.ParentID)

	require.NoError(t, s.proj.CatchUp(ctx))

	parentLayers, err := s.resolver.Query().LayersForIncident(ctx, parent.Incident.ID, nil)
	require.NoError(t, err)

	parentLayers = userLayers(parentLayers)
	require.Len(t, parentLayers, 2)
	assert.ElementsMatch(
		t,
		[]string{"Regional Map", "Municipal Map"},
		[]string{parentLayers[0].Name, parentLayers[1].Name},
	)

	for _, layer := range parentLayers {
		switch layer.Name {
		case "Regional Map":
			assert.Equal(t, parent.Incident.ID, layer.SourceIncidentID)
			assert.Equal(t, "Regional", layer.SourceIncidentName)
		case "Municipal Map":
			assert.Equal(t, child.Incident.ID, layer.SourceIncidentID)
			assert.Equal(t, "Municipal", layer.SourceIncidentName)
		}
	}

	childLayers, err := s.resolver.Query().LayersForIncident(ctx, child.Incident.ID, nil)
	require.NoError(t, err)

	childLayers = userLayers(childLayers)
	require.Len(t, childLayers, 1)
	assert.Equal(t, "Municipal Map", childLayers[0].Name)

	unlinked, err := s.resolver.Mutation().UnlinkIncidentParent(ctx, child.Incident.ID)
	require.NoError(t, err)
	assert.Nil(t, unlinked.ParentID)

	require.NoError(t, s.proj.CatchUp(ctx))

	parentLayers, err = s.resolver.Query().LayersForIncident(ctx, parent.Incident.ID, nil)
	require.NoError(t, err)

	parentLayers = userLayers(parentLayers)
	require.Len(t, parentLayers, 1)
	assert.Equal(t, "Regional Map", parentLayers[0].Name)
}

func TestLayersForIncident_OrdersParentLayersBeforeGroupedChildLayers(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	parent, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "KFS",
		Divisions: []*model.DivisionInput{},
		Layers: []*model.LayerInput{
			{Name: "Zweite KFS Karte"},
			{Name: "Erste KFS Karte"},
		},
	})
	require.NoError(t, err)

	ahausen, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "GFS Ahausen",
		Divisions: []*model.DivisionInput{},
		Layers: []*model.LayerInput{
			{Name: "Rettungskarte"},
			{Name: "Führungskarte"},
		},
	})
	require.NoError(t, err)

	altdorf, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "GFS Altdorf",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{{Name: "Rettungskarte"}},
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().LinkIncidentParent(ctx, ahausen.Incident.ID, parent.Incident.ID)
	require.NoError(t, err)
	_, err = s.resolver.Mutation().LinkIncidentParent(ctx, altdorf.Incident.ID, parent.Incident.ID)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, parent.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)
	require.Len(t, layers, 5)

	assert.Equal(t, []string{
		"KFS:Erste KFS Karte",
		"KFS:Zweite KFS Karte",
		"GFS Ahausen:Führungskarte",
		"GFS Ahausen:Rettungskarte",
		"GFS Altdorf:Rettungskarte",
	}, []string{
		layers[0].SourceIncidentName + ":" + layers[0].Name,
		layers[1].SourceIncidentName + ":" + layers[1].Name,
		layers[2].SourceIncidentName + ":" + layers[2].Name,
		layers[3].SourceIncidentName + ":" + layers[3].Name,
		layers[4].SourceIncidentName + ":" + layers[4].Name,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// TriageMessage resolver
// ─────────────────────────────────────────────────────────────────────────────

func TestTriageMessage_SetsTriageAndPriority(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Triage Test", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B",
		SenderDetail: "", ReceiverDetail: "", Content: "Urgent", Medium: model.MediumRadio,
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	triaged, err := s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
		Triage:      model.TriageStatusDone,
		Priority:    model.PriorityStatusHigh,
		DivisionIds: []string{},
	})

	require.NoError(t, err)
	require.NotNil(t, triaged)
	assert.Equal(t, model.TriageStatusDone, triaged.Triage)
	assert.Equal(t, model.PriorityStatusHigh, triaged.Priority)
	// Non-triage fields must be preserved.
	assert.Equal(t, msg.ID, triaged.ID)
	assert.Equal(t, msg.Content, triaged.Content)
	assert.Equal(t, msg.Sender, triaged.Sender)
	assert.Equal(t, msg.Medium, triaged.Medium)
}

func TestTriageMessage_WithDivision_EnrichesResponse(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Division Triage",
		Divisions: []*model.DivisionInput{{Name: "Alpha", Description: "first"}},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.Len(t, inc.Incident.Divisions, 2)
	divID := inc.Incident.Divisions[1].ID

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B",
		SenderDetail: "", ReceiverDetail: "", Content: "Check", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	// CatchUp so the Queries side can resolve the division name.
	require.NoError(t, s.proj.CatchUp(ctx))

	triaged, err := s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
		Triage:      model.TriageStatusDone,
		Priority:    model.PriorityStatusNormal,
		DivisionIds: []string{divID},
	})

	require.NoError(t, err)
	require.Len(t, triaged.Divisions, 1)
	assert.Equal(t, "Alpha", triaged.Divisions[0].Name)
}

func TestTriageMessage_InvalidID_ReturnsError(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	_, err := s.resolver.Mutation().TriageMessage(ctx, "not-a-uuid", model.TriageMessageInput{
		Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: []string{},
	})
	require.Error(t, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer + Feature mutation resolvers
// ─────────────────────────────────────────────────────────────────────────────

func TestCreateLayer_ReturnsModel(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Layer Mut", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	layer, err := s.resolver.Mutation().CreateLayer(ctx, inc.Incident.ID, "Ops Map")

	require.NoError(t, err)
	require.NotNil(t, layer)
	assert.Equal(t, "Ops Map", layer.Name)
	assert.Equal(t, inc.Incident.ID, layer.SourceIncidentID)
	assert.Equal(t, "Layer Mut", layer.SourceIncidentName)
	assert.Equal(t, 0, layer.Revision)
	assert.Empty(t, layer.Features)
	_, parseErr := uuid.Parse(layer.ID)
	assert.NoError(t, parseErr)
}

func TestCreateLayer_AppearsInQuery(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Layer Query", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	created, err := s.resolver.Mutation().CreateLayer(ctx, inc.Incident.ID, "New Layer")
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)

	var found bool

	for _, l := range layers {
		if l.ID == created.ID {
			found = true

			assert.Equal(t, "New Layer", l.Name)
		}
	}

	assert.True(t, found, "created layer must appear in LayersForIncident query")
}

func TestAddFeature_ReturnsModel(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Feature Add", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{{Name: "Map"}},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)
	require.NotEmpty(t, layers)
	layerID := layers[0].ID

	geometry := map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}
	props := map[string]any{"label": "HQ"}

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, layerID, "draw-1", geometry, props, nil)

	require.NoError(t, err)
	require.NotNil(t, feat)

	incUUID, err := uuid.Parse(inc.Incident.ID)
	require.NoError(t, err)
	assert.Equal(
		t,
		feature.DeriveID(shared.IncidentID(incUUID), "draw-1").String(),
		feat.ID,
		"ID is derived server-side",
	)
	assert.Equal(t, geometry, map[string]any(feat.Geometry))
	assert.Equal(t, props, map[string]any(feat.Properties))
}

func TestModifyFeature_ReturnsUpdatedModel(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Feature Mod", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{{Name: "Map"}},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))
	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)

	layerID := layers[0].ID

	origGeom := map[string]any{"type": "Point", "coordinates": []any{0.0, 0.0}}
	origProps := map[string]any{"label": "Old"}
	added, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, layerID, "draw-1", origGeom, origProps, nil)
	require.NoError(t, err)

	featureID := added.ID

	newGeom := map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}
	newProps := map[string]any{"label": "New"}
	modified, err := s.resolver.Mutation().ModifyFeature(ctx, featureID, newGeom, newProps, nil)

	require.NoError(t, err)
	require.NotNil(t, modified)
	assert.Equal(t, featureID, modified.ID)
	assert.Equal(t, newGeom, map[string]any(modified.Geometry))
	assert.Equal(t, newProps, map[string]any(modified.Properties))
}

func TestDeleteFeature_ReturnsID(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Feature Del", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{{Name: "Map"}},
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))
	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	layers = userLayers(layers)

	layerID := layers[0].ID

	added, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, layerID, "draw-1",
		map[string]any{"type": "Point", "coordinates": []any{0.0, 0.0}},
		map[string]any{},
		nil,
	)
	require.NoError(t, err)

	featureID := added.ID
	deletedID, err := s.resolver.Mutation().DeleteFeature(ctx, featureID, nil)

	require.NoError(t, err)
	assert.Equal(t, featureID, deletedID)
}

func TestAddFeature_InvalidLayerID_ReturnsError(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Bad Layer", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, "not-a-uuid", "draw-1",
		map[string]any{}, map[string]any{}, nil)
	require.Error(t, err)
}

func TestAddFeature_MessageMapLayerRequiresMessage(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Map Layer", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	var mapLayerID string

	for _, l := range layers {
		if l.Kind == model.LayerKindMessageMap {
			mapLayerID = l.ID
		}
	}

	require.NotEmpty(t, mapLayerID)

	geometry := map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}

	_, err = s.resolver.Mutation().
		AddFeature(ctx, inc.Incident.ID, mapLayerID, "draw-1", geometry, map[string]any{}, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	var mapDivisionID string

	for _, d := range inc.Incident.Divisions {
		if d.Kind == model.DivisionKindMessageMap {
			mapDivisionID = d.ID
		}
	}

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B", Content: "Brand", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
		Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: []string{mapDivisionID},
	})
	require.NoError(t, err)

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, mapLayerID, "draw-1", geometry,
		map[string]any{}, &model.FeatureChangeInput{MessageID: &msg.ID})
	require.NoError(t, err)
	assert.NotEmpty(t, feat.ID)
}

func TestFeatureChangesAndMessages_FollowMessageTime(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Timeline", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	var mapLayerID string

	for _, l := range layers {
		if l.Kind == model.LayerKindMessageMap {
			mapLayerID = l.ID
		}
	}

	var mapDivisionID string

	for _, d := range inc.Incident.Divisions {
		if d.Kind == model.DivisionKindMessageMap {
			mapDivisionID = d.ID
		}
	}

	triaged := func(content string, at time.Time) *model.Message {
		msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
			IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B", Content: content,
			Medium: model.MediumRadio, Time: &at,
		})
		require.NoError(t, err)

		_, err = s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
			Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: []string{mapDivisionID},
		})
		require.NoError(t, err)

		return msg
	}

	now := time.Now().UTC()
	first := triaged("first", now.Add(-3*time.Hour))
	second := triaged("second", now.Add(-time.Hour))

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, mapLayerID, "draw-1",
		map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}}, map[string]any{"label": "A"},
		&model.FeatureChangeInput{MessageID: &first.ID})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().ModifyFeature(ctx, feat.ID,
		map[string]any{"type": "Point", "coordinates": []any{9.0, 47.0}}, nil,
		&model.FeatureChangeInput{MessageID: &second.ID})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	changes, err := s.resolver.Query().FeatureChanges(ctx, inc.Incident.ID)
	require.NoError(t, err)
	require.Len(t, changes, 2)
	assert.Equal(t, model.FeatureChangeKindPlaced, changes[0].Change)
	assert.Equal(t, model.FeatureChangeKindMoved, changes[1].Change)
	assert.WithinDuration(t, now.Add(-3*time.Hour), changes[0].EffectiveAt, time.Second, "effective at message time")
	assert.WithinDuration(t, now.Add(-time.Hour), changes[1].EffectiveAt, time.Second)
	require.NotNil(t, changes[1].MessageID)
	assert.Equal(t, second.ID, *changes[1].MessageID)
	assert.NotNil(t, changes[1].Geometry)

	// The map as of a point on the incident timeline.
	featuresOnMapLayer := func(asOf time.Time) []*model.Feature {
		t.Helper()

		got, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, &asOf)
		require.NoError(t, err)

		for _, l := range got {
			if l.ID == mapLayerID {
				return l.Features
			}
		}

		require.Fail(t, "message map layer missing")

		return nil
	}

	assert.Empty(t, featuresOnMapLayer(now.Add(-4*time.Hour)), "before the first message nothing is drawn")

	between := featuresOnMapLayer(now.Add(-2 * time.Hour))
	require.Len(t, between, 1)
	assert.Equal(t, []any{8.0, 47.0}, between[0].Geometry["coordinates"], "as of the first message")

	after := featuresOnMapLayer(now)
	require.Len(t, after, 1)
	assert.Equal(t, []any{9.0, 47.0}, after[0].Geometry["coordinates"], "after the second message the feature moved")
	assert.Equal(
		t,
		map[string]any{"label": "A"},
		map[string]any(after[0].Properties),
		"unchanged properties carry over",
	)

	messages, err := s.resolver.Query().FeatureMessages(ctx, feat.ID)
	require.NoError(t, err)
	require.Len(t, messages, 2)
	assert.Equal(t, []string{first.ID, second.ID}, []string{messages[0].ID, messages[1].ID}, "ordered by message time")

	none, err := s.resolver.Query().FeatureMessages(ctx, uuid.NewString())
	require.Error(t, err, "unknown feature")
	assert.Empty(t, none)
}

func TestFeatureChangeTimes_ListsEachInstantOnce(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Ticks", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	var standardLayerID string

	for _, l := range layers {
		if l.Kind == model.LayerKindStandard {
			standardLayerID = l.ID
		}
	}

	if standardLayerID == "" {
		layer, err := s.resolver.Mutation().CreateLayer(ctx, inc.Incident.ID, "Lage")
		require.NoError(t, err)

		standardLayerID = layer.ID
	}

	at := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	point := map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}}

	for _, key := range []string{"a", "b"} {
		_, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, standardLayerID, key, point,
			map[string]any{"label": key}, &model.FeatureChangeInput{EffectiveAt: &at})
		require.NoError(t, err)
	}

	require.NoError(t, s.proj.CatchUp(ctx))

	times, err := s.resolver.Query().FeatureChangeTimes(ctx, inc.Incident.ID)
	require.NoError(t, err)
	require.Len(t, times, 1, "two changes at the same time are one tick")
	assert.WithinDuration(t, at, *times[0], time.Second)

	_, err = s.resolver.Query().FeatureChangeTimes(ctx, "not-a-uuid")
	require.Error(t, err)
}

func TestRestoreFeature_BringsBackARemovedFeatureOnTheTimeline(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Restore", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, nil)
	require.NoError(t, err)

	var mapLayerID, mapDivisionID string

	for _, l := range layers {
		if l.Kind == model.LayerKindMessageMap {
			mapLayerID = l.ID
		}
	}

	for _, d := range inc.Incident.Divisions {
		if d.Kind == model.DivisionKindMessageMap {
			mapDivisionID = d.ID
		}
	}

	triaged := func(at time.Time) *model.Message {
		msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
			IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B", Content: "m",
			Medium: model.MediumRadio, Time: &at,
		})
		require.NoError(t, err)

		_, err = s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
			Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: []string{mapDivisionID},
		})
		require.NoError(t, err)

		return msg
	}

	now := time.Now().UTC()
	placed, removed, restored := triaged(
		now.Add(-3*time.Hour),
	), triaged(
		now.Add(-2*time.Hour),
	), triaged(
		now.Add(-time.Hour),
	)

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.Incident.ID, mapLayerID, "draw-1",
		map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}}, map[string]any{"label": "A"},
		&model.FeatureChangeInput{MessageID: &placed.ID})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().DeleteFeature(ctx, feat.ID, &model.FeatureChangeInput{MessageID: &removed.ID})
	require.NoError(t, err)

	_, err = s.resolver.Mutation().RestoreFeature(ctx, feat.ID, &model.FeatureChangeInput{MessageID: &placed.ID})
	require.Error(t, err, "restoring before the removal is rejected")

	got, err := s.resolver.Mutation().RestoreFeature(ctx, feat.ID, &model.FeatureChangeInput{MessageID: &restored.ID})
	require.NoError(t, err)
	assert.Equal(t, []any{8.0, 47.0}, got.Geometry["coordinates"], "the state comes from the aggregate")
	assert.Equal(t, map[string]any{"label": "A"}, map[string]any(got.Properties))
	require.NoError(t, s.proj.CatchUp(ctx))

	onMapAt := func(asOf *time.Time) int {
		t.Helper()

		all, err := s.resolver.Query().LayersForIncident(ctx, inc.Incident.ID, asOf)
		require.NoError(t, err)

		for _, l := range all {
			if l.ID == mapLayerID {
				return len(l.Features)
			}
		}

		return -1
	}

	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }

	assert.Equal(t, 1, onMapAt(nil), "live: the feature is back")
	assert.Equal(t, 1, onMapAt(at(-150*time.Minute)), "before the removal")
	assert.Equal(t, 0, onMapAt(at(-90*time.Minute)), "gone between removal and restore")
	assert.Equal(t, 1, onMapAt(at(-30*time.Minute)), "after the restore")

	changes, err := s.resolver.Query().FeatureChanges(ctx, inc.Incident.ID)
	require.NoError(t, err)
	require.Len(t, changes, 3)
	assert.Equal(t, model.FeatureChangeKindRestored, changes[2].Change)
}

func TestMessageAcknowledgement_Resolvers(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Ack", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	var mapDivisionID string

	for _, d := range inc.Incident.Divisions {
		if d.Kind == model.DivisionKindMessageMap {
			mapDivisionID = d.ID
		}
	}

	record := func(divisions ...string) *model.Message {
		msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
			IncidentID: inc.Incident.ID, Sender: "A", Receiver: "B", Content: "m", Medium: model.MediumRadio,
		})
		require.NoError(t, err)

		_, err = s.resolver.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
			Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: divisions,
		})
		require.NoError(t, err)

		return msg
	}

	msg := record(mapDivisionID)

	t.Run("a division acknowledges a message triaged to it, and takes it back", func(t *testing.T) {
		got, err := s.resolver.Mutation().AcknowledgeMessage(ctx, msg.ID, mapDivisionID)
		require.NoError(t, err)
		require.Len(t, got.Acknowledgements, 1)
		assert.Equal(t, mapDivisionID, got.Acknowledgements[0].Division.ID)
		assert.Equal(t, "test-sub", got.Acknowledgements[0].AcknowledgedBy)

		again, err := s.resolver.Mutation().AcknowledgeMessage(ctx, msg.ID, mapDivisionID)
		require.NoError(t, err)
		assert.Len(t, again.Acknowledgements, 1, "acknowledging twice changes nothing")

		revoked, err := s.resolver.Mutation().RevokeMessageAcknowledgement(ctx, msg.ID, mapDivisionID)
		require.NoError(t, err)
		assert.Empty(t, revoked.Acknowledgements)
	})

	t.Run("a message not triaged to the division cannot be acknowledged for it", func(t *testing.T) {
		untriaged := record() // triaged to no division

		_, err := s.resolver.Mutation().AcknowledgeMessage(ctx, untriaged.ID, mapDivisionID)
		require.ErrorIs(t, err, shared.ErrNotTriagedToDivision)
	})

	t.Run("unknown ids and unauthenticated calls fail", func(t *testing.T) {
		_, err := s.resolver.Mutation().AcknowledgeMessage(ctx, "not-a-uuid", mapDivisionID)
		require.Error(t, err)

		_, err = s.resolver.Mutation().AcknowledgeMessage(ctx, msg.ID, "not-a-uuid")
		require.Error(t, err)
	})
}

func TestMessageAcknowledgement_RequiresAnActor(t *testing.T) {
	s := newTestStack(t)

	_, err := s.resolver.Mutation().AcknowledgeMessage(t.Context(), uuid.NewString(), uuid.NewString())
	require.Error(t, err)

	_, err = s.resolver.Mutation().RevokeMessageAcknowledgement(t.Context(), uuid.NewString(), uuid.NewString())
	require.Error(t, err)
}

func TestIncident_ResourcesAndSchadenplaetzeAsOf(t *testing.T) {
	s := newTestStack(t)
	ctx := actorCtx()

	inc, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Past", Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
	})
	require.NoError(t, err)

	alertedAt := time.Now().UTC().Add(-time.Hour)
	_, err = s.resolver.Mutation().AlertResource(ctx, model.AlertResourceInput{
		IncidentID: inc.Incident.ID, Formation: model.ResourceFormationFw, Name: "TLF 1",
		Size: model.ResourceUnitSizeGruppe, PersonnelCount: 6, Hauptaufgabe: "Löschen", OccurredAt: &alertedAt,
	})
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	resources := func(asOf *time.Time) []*model.Resource {
		t.Helper()

		got, err := s.resolver.Incident().Resources(ctx, inc.Incident, asOf)
		require.NoError(t, err)

		return got
	}
	places := func(asOf *time.Time) []*model.Schadenplatz {
		t.Helper()

		got, err := s.resolver.Incident().Schadenplaetze(ctx, inc.Incident, asOf)
		require.NoError(t, err)

		return got
	}

	before, after := alertedAt.Add(-time.Minute), alertedAt.Add(time.Minute)

	assert.Len(t, resources(nil), 1, "live")
	assert.Empty(t, resources(&before), "not alerted yet")
	require.Len(t, resources(&after), 1)
	assert.Equal(t, "TLF 1", resources(&after)[0].Name)
	assert.Equal(t, 6, resources(&after)[0].PersonnelCount)

	opened := time.Now().UTC().Add(time.Minute)

	assert.NotEmpty(t, places(nil), "live: the default Schadenplatz")
	assert.NotEmpty(t, places(&opened), "as of a time after the incident was opened")
	assert.Empty(t, places(&before), "it did not exist before the incident was opened")
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessGroups resolver
// ─────────────────────────────────────────────────────────────────────────────

func TestAccessGroups_Unauthenticated_ReturnsError(t *testing.T) {
	accessHandler := projection.NewAccessHandler()
	accessQueries := inmemqueries.NewAccessQueries(accessHandler)

	r := &gqlresolver.Resolver{AccessQueries: accessQueries}

	_, err := r.Query().AccessGroups(context.Background())
	require.Error(t, err)
}

func TestAccessGroups_NilAccessQueries_ReturnsForbidden(t *testing.T) {
	// Resolver with no AccessQueries wired — must return ErrForbidden for
	// authenticated callers rather than panic.
	r := &gqlresolver.Resolver{}

	_, err := r.Query().AccessGroups(actorCtx())
	require.ErrorIs(t, err, shared.ErrForbidden)
}

func TestAccessGroups_AuthenticatedUser_ReturnsGroups(t *testing.T) {
	// Any authenticated user (not just admins) may list groups.
	accessHandler := projection.NewAccessHandler()
	accessQueries := inmemqueries.NewAccessQueries(accessHandler)

	r := &gqlresolver.Resolver{AccessQueries: accessQueries}

	groups, err := r.Query().AccessGroups(actorCtx())
	require.NoError(t, err)
	assert.NotNil(t, groups)
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateIncident — access payload
// ─────────────────────────────────────────────────────────────────────────────

// newAccessTestStack extends the base test stack with the full access wiring:
// incident-access repository, access projector, Casbin checkers, and the
// AccessService. Use it in tests that need the mutation to return accurate
// can* fields or to exercise default-template inheritance.
func newAccessTestStack(t *testing.T) *testStack {
	t.Helper()

	store := inmemstore.NewEventStore()
	tx := inmemstore.NewTransactor()
	notifier := inmemstore.NewNotifier()
	counter := inmemstore.NewMessageCounter()

	incRepo := eventstore.NewIncidentRepository(store)
	msgRepo := eventstore.NewMessageRepository(store)
	layerRepo := eventstore.NewLayerRepository(store)
	featureRepo := eventstore.NewFeatureRepository(store)
	accessRepo := eventstore.NewIncidentAccessRepository(store)
	groupRepo := eventstore.NewAccessGroupRepository(store)
	globalRepo := eventstore.NewGlobalAccessRepository(store)

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

	factory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(inmemstore.WallClock{}),
		service.WithIDs(inmemstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(counter),
		service.WithIncidentHierarchyGuard(inmemstore.NewIncidentHierarchyGuard(store)),
		service.WithIncidentAccessRepository(accessRepo),
		service.WithIncidentAccessChecker(accessChecker),
		service.WithAccessGuard(inmemstore.NewAccessGuard()),
		service.WithAccessGroupRepository(groupRepo),
		service.WithGlobalAccessRepository(globalRepo),
		service.WithGlobalAccessChecker(globalChecker),
		service.WithAccessQueries(accessQueries),
	)

	incidentSvc := factory.IncidentService(incRepo, layerRepo)
	messageSvc := factory.MessageService(msgRepo, incRepo)
	layerSvc := factory.LayerService(layerRepo, incRepo)
	featureSvc := factory.FeatureService(featureRepo, incRepo, layerRepo, msgRepo)
	accessSvc := factory.AccessService()

	proj := projection.NewProjector(store, []projection.Handler{
		incHandler, divHandler, msgHandler, layerHandler, spHandler, resourceHandler, accessHandler,
	})

	queries := inmemqueries.NewQueries(
		incHandler,
		divHandler,
		msgHandler,
		layerHandler,
		spHandler,
		resourceHandler,
		accessChecker,
	)

	r := &gqlresolver.Resolver{
		Incidents:             incidentSvc,
		Messages:              messageSvc,
		Layers:                layerSvc,
		Features:              featureSvc,
		Access:                accessSvc,
		Queries:               queries,
		AccessQueries:         accessQueries,
		IncidentAccessChecker: accessChecker,
		GlobalAccessChecker:   globalChecker,
	}

	return &testStack{resolver: r, proj: proj}
}

func TestCreateIncident_ReturnsAccessPayload(t *testing.T) {
	s := newAccessTestStack(t)
	ctx := actorCtx()
	actor, _ := identity.ActorFrom(ctx)

	result, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Access Test",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})

	require.NoError(t, err)
	require.NotNil(t, result)
	require.NotNil(t, result.Incident)

	// The mutation response must include an access mode.
	assert.NotEmpty(t, result.AccessMode)

	// The creator must appear in the returned grants with a management-level role.
	require.NotEmpty(t, result.AccessGrants, "creator should receive an access grant")

	var found bool

	for _, g := range result.AccessGrants {
		if g.PrincipalID == actor.Sub && (g.Role == model.IncidentRoleOwner || g.Role == model.IncidentRoleManager) {
			found = true
			break
		}
	}

	assert.True(t, found, "creator %s should hold Owner or Manager role in AccessGrants", actor.Sub)
}

func TestCreateIncident_InheritsDefaultTemplateGrants(t *testing.T) {
	s := newAccessTestStack(t)
	ctx := actorCtx()
	actor, _ := identity.ActorFrom(ctx)

	// Bootstrap the test actor as SystemAdmin so GrantDefaultRole is permitted.
	require.NoError(t, s.resolver.Access.BootstrapFirstSystemAdmin(ctx, actor.Sub, actor))
	require.NoError(t, s.proj.CatchUp(ctx))

	// Grant a default Viewer role to a second user via the access service.
	viewer := access.Principal{Kind: access.UserPrincipal, ID: "viewer-user"}
	_, err := s.resolver.Access.GrantDefaultRole(ctx, viewer, access.Viewer, actor)
	require.NoError(t, err)
	require.NoError(t, s.proj.CatchUp(ctx))

	// Create a new incident — it should inherit the default template grant.
	result, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Inherits Template",
		Divisions: []*model.DivisionInput{},
		Layers:    []*model.LayerInput{},
	})

	require.NoError(t, err)
	require.NotNil(t, result)

	grantedIDs := make(map[string]bool, len(result.AccessGrants))
	for _, g := range result.AccessGrants {
		grantedIDs[g.PrincipalID] = true
	}

	assert.True(t, grantedIDs[actor.Sub], "creator should be in grants")
	assert.True(t, grantedIDs[viewer.ID], "default template viewer grant should be inherited")
}

// userLayers drops the system-managed message map layer that every incident gets.
func userLayers(layers []*model.Layer) []*model.Layer {
	out := make([]*model.Layer, 0, len(layers))

	for _, l := range layers {
		if l.Kind == model.LayerKindStandard {
			out = append(out, l)
		}
	}

	return out
}
