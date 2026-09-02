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

	factory := service.NewFactory(
		service.WithTransactor(tx),
		service.WithClock(inmemstore.WallClock{}),
		service.WithIDs(inmemstore.UUIDGen{}),
		service.WithNotifier(notifier),
		service.WithMessageCounter(counter),
	)

	incidentSvc := factory.IncidentService(incRepo, layerRepo)
	messageSvc := factory.MessageService(msgRepo, incRepo)
	layerSvc := factory.LayerService(layerRepo, incRepo)
	featureSvc := factory.FeatureService(featureRepo, incRepo, layerRepo)

	incHandler := projection.NewIncidentHandler()
	divHandler := projection.NewIncidentDivisionHandler()
	msgHandler := projection.NewMessageHandler()
	layerHandler := projection.NewLayerFeaturesHandler()

	proj := projection.NewProjector(store, []projection.Handler{
		incHandler, divHandler, msgHandler, layerHandler,
	})

	queries := inmemqueries.NewQueries(incHandler, divHandler, msgHandler, layerHandler)

	r := &gqlresolver.Resolver{
		Incidents: incidentSvc,
		Messages:  messageSvc,
		Layers:    layerSvc,
		Features:  featureSvc,
		Queries:   queries,
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
	assert.Equal(t, "Test Incident", result.Name)
	assert.False(t, result.IsClosed)
	assert.NotEmpty(t, result.ID)
	_, err = uuid.Parse(result.ID)
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
	assert.Equal(t, "Incident With Divisions", result.Name)
	assert.Len(t, result.Divisions, 2)
	assert.Equal(t, "Alpha", result.Divisions[0].Name)
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

	_, parseErr := uuid.Parse(result.ID)
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

	closed, err := s.resolver.Mutation().CloseIncident(ctx, created.ID)
	require.NoError(t, err)
	// Only the closed state changes; identity and name must be preserved.
	assert.Equal(t, created.ID, closed.ID)
	assert.Equal(t, created.Name, closed.Name)
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
	updated, err := s.resolver.Mutation().UpdateIncident(ctx, created.ID, model.UpdateIncidentInput{
		Name: &newName,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	// Fields not in the update input must be preserved unchanged.
	assert.Equal(t, created.ID, updated.ID)
	assert.Equal(t, created.IsClosed, updated.IsClosed)
	assert.Equal(t, created.ClosedAt, updated.ClosedAt)
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

	_, err = s.resolver.Mutation().CloseIncident(ctx, created.ID)
	require.NoError(t, err)

	deletedID, err := s.resolver.Mutation().DeleteIncident(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, deletedID)
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

	got, err := s.resolver.Query().Incident(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, created.ID, got.ID)
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
	_, err = s.resolver.Mutation().CloseIncident(ctx, created.ID)
	require.NoError(t, err)
	_, err = s.resolver.Mutation().DeleteIncident(ctx, created.ID)
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
		IncidentID:     inc.ID,
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
		IncidentID:     inc.ID,
		Sender:         "Alice",
		Receiver:       "Bob",
		SenderDetail:   "555-1111",
		ReceiverDetail: "555-2222",
		Content:        "Original",
		Medium:         model.MediumPhone,
	})
	require.NoError(t, err)

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
		IncidentID:     inc.ID,
		Sender:         "X",
		Receiver:       "Y",
		SenderDetail:   "sender@example.test",
		ReceiverDetail: "receiver@example.test",
		Content:        "To Remove",
		Medium:         model.MediumEmail,
	})
	require.NoError(t, err)

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
		IncidentID:     inc.ID,
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
		IncidentID:     inc.ID,
		Sender:         "A",
		Receiver:       "B",
		SenderDetail:   "",
		ReceiverDetail: "",
		Content:        "First",
		Medium:         model.MediumRadio,
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID:     inc.ID,
		Sender:         "A",
		Receiver:       "B",
		SenderDetail:   "",
		ReceiverDetail: "",
		Content:        "Second",
		Medium:         model.MediumRadio,
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	msgs, err := s.resolver.Incident().Messages(ctx, inc)
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
		IncidentID: incA.ID, Sender: "X", Receiver: "Y",
		SenderDetail: "", ReceiverDetail: "", Content: "For A", Medium: model.MediumRadio,
	})
	require.NoError(t, err)
	_, err = s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: incB.ID, Sender: "X", Receiver: "Y",
		SenderDetail: "", ReceiverDetail: "", Content: "For B", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	msgsA, err := s.resolver.Incident().Messages(ctx, incA)
	require.NoError(t, err)
	assert.Len(t, msgsA, 1)
	assert.Equal(t, "For A", msgsA[0].Content)

	msgsB, err := s.resolver.Incident().Messages(ctx, incB)
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

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.ID)
	require.NoError(t, err)
	require.Len(t, layers, 1)
	assert.Equal(t, "Sector Map", layers[0].Name)
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
		IncidentID: inc.ID, Sender: "A", Receiver: "B",
		SenderDetail: "", ReceiverDetail: "", Content: "Urgent", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

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
	require.Len(t, inc.Divisions, 1)
	divID := inc.Divisions[0].ID

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B",
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

	layer, err := s.resolver.Mutation().CreateLayer(ctx, inc.ID, "Ops Map")

	require.NoError(t, err)
	require.NotNil(t, layer)
	assert.Equal(t, "Ops Map", layer.Name)
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

	created, err := s.resolver.Mutation().CreateLayer(ctx, inc.ID, "New Layer")
	require.NoError(t, err)

	require.NoError(t, s.proj.CatchUp(ctx))

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.ID)
	require.NoError(t, err)

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

	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.ID)
	require.NoError(t, err)
	require.NotEmpty(t, layers)
	layerID := layers[0].ID

	featureID := uuid.NewString()
	geometry := map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}
	props := map[string]any{"label": "HQ"}

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.ID, layerID, featureID, geometry, props)

	require.NoError(t, err)
	require.NotNil(t, feat)
	assert.Equal(t, featureID, feat.ID)
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
	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.ID)
	require.NoError(t, err)

	layerID := layers[0].ID

	featureID := uuid.NewString()
	origGeom := map[string]any{"type": "Point", "coordinates": []any{0.0, 0.0}}
	origProps := map[string]any{"label": "Old"}
	_, err = s.resolver.Mutation().AddFeature(ctx, inc.ID, layerID, featureID, origGeom, origProps)
	require.NoError(t, err)

	newGeom := map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}
	newProps := map[string]any{"label": "New"}
	modified, err := s.resolver.Mutation().ModifyFeature(ctx, featureID, newGeom, newProps)

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
	layers, err := s.resolver.Query().LayersForIncident(ctx, inc.ID)
	require.NoError(t, err)

	layerID := layers[0].ID

	featureID := uuid.NewString()
	_, err = s.resolver.Mutation().AddFeature(ctx, inc.ID, layerID, featureID,
		map[string]any{"type": "Point", "coordinates": []any{0.0, 0.0}},
		map[string]any{},
	)
	require.NoError(t, err)

	deletedID, err := s.resolver.Mutation().DeleteFeature(ctx, featureID)

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

	_, err = s.resolver.Mutation().AddFeature(ctx, inc.ID, "not-a-uuid", uuid.NewString(),
		map[string]any{}, map[string]any{})
	require.Error(t, err)
}
