package graphql_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gqlresolver "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

func TestUpdateIncident_SetsAndClearsLocationAndKeepsDivisionIDs(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")

	created, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name:      "Lifecycle",
		Location:  new("Altdorf"),
		Divisions: []*model.DivisionInput{{Name: "A", Description: "first"}},
		Layers:    []*model.LayerInput{},
	})
	require.NoError(t, err)
	s.catchUp(t)
	require.NotNil(t, created.Incident.Location)
	assert.Equal(t, "Altdorf", created.Incident.Location.Name)

	var keep *model.Division

	for _, d := range created.Incident.Divisions {
		if d.Name == "A" {
			keep = d
		}
	}

	require.NotNil(t, keep)

	updated, err := s.resolver.Mutation().UpdateIncident(ctx, created.Incident.ID, model.UpdateIncidentInput{
		Location: new("Erstfeld"),
		Divisions: []*model.DivisionInput{
			{ID: &keep.ID, Name: "A2", Description: "renamed"},
			{Name: "B", Description: "added"},
		},
	})
	require.NoError(t, err)

	require.NotNil(t, updated.Location)
	assert.Equal(t, "Erstfeld", updated.Location.Name)
	assert.Equal(t, "Lifecycle", updated.Name, "an omitted name is left alone")

	names := map[string]string{}
	for _, d := range updated.Divisions {
		names[d.Name] = d.ID
	}

	assert.Equal(t, keep.ID, names["A2"], "the division keeps its id when the client sends it")
	assert.Contains(t, names, "B")

	// An empty string clears the location.
	cleared, err := s.resolver.Mutation().UpdateIncident(ctx, created.Incident.ID, model.UpdateIncidentInput{
		Location: new(""),
	})
	require.NoError(t, err)
	assert.Nil(t, cleared.Location)
}

func TestIncidentLifecycle_CloseReopenLinkUnlinkDelete(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")
	m := s.resolver.Mutation()

	parent := s.createIncident(t, "Parent", model.IncidentAccessModeOpenOperational)
	child := s.createIncident(t, "Child", model.IncidentAccessModeOpenOperational)

	linked, err := m.LinkIncidentParent(ctx, child.ID, parent.ID)
	require.NoError(t, err)
	require.NotNil(t, linked.ParentID)
	assert.Equal(t, parent.ID, *linked.ParentID)

	s.catchUp(t)

	children, err := s.resolver.Incident().ChildIncidents(ctx, parent)
	require.NoError(t, err)
	require.Len(t, children, 1)
	assert.Equal(t, child.ID, children[0].ID)

	unlinked, err := m.UnlinkIncidentParent(ctx, child.ID)
	require.NoError(t, err)
	assert.Nil(t, unlinked.ParentID)

	closed, err := m.CloseIncident(ctx, child.ID)
	require.NoError(t, err)
	assert.True(t, closed.IsClosed)
	require.NotNil(t, closed.ClosedAt)

	reopened, err := m.ReopenIncident(ctx, child.ID)
	require.NoError(t, err)
	assert.False(t, reopened.IsClosed)
	assert.Nil(t, reopened.ClosedAt)

	// Only a closed incident can be deleted.
	_, err = m.DeleteIncident(ctx, child.ID)
	require.Error(t, err)

	_, err = m.CloseIncident(ctx, child.ID)
	require.NoError(t, err)

	deleted, err := m.DeleteIncident(ctx, child.ID)
	require.NoError(t, err)
	assert.Equal(t, child.ID, deleted)
}

func TestCreateIncident_ParentErrors(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")

	_, err := s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Orphan", ParentID: new("not-a-uuid"),
	})
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = s.resolver.Mutation().CreateIncident(ctx, model.CreateIncidentInput{
		Name: "Orphan", ParentID: new(newID()),
	})
	require.Error(t, err, "the parent must exist")
}

// TestIncidentMutations_AreForbiddenToStrangers checks that the services' access checks reach
// the client unchanged: a user with no grant on a restricted incident may change nothing in it.
func TestIncidentMutations_AreForbiddenToStrangers(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Restricted", model.IncidentAccessModeRestricted)
	msg, err := s.resolver.Mutation().CreateMessage(ctxFor("owner"), model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	stranger := ctxFor("stranger")
	m := s.resolver.Mutation()

	tests := map[string]func() error{
		"update incident": func() error {
			_, err := m.UpdateIncident(stranger, inc.ID, model.UpdateIncidentInput{Name: new("x")})

			return err
		},
		"close incident": func() error {
			_, err := m.CloseIncident(stranger, inc.ID)

			return err
		},
		"create message": func() error {
			_, err := m.CreateMessage(stranger, model.CreateMessageInput{
				IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
			})

			return err
		},
		"update message": func() error {
			_, err := m.UpdateMessage(stranger, msg.ID, model.UpdateMessageInput{Content: new("x")})

			return err
		},
		"triage message": func() error {
			_, err := m.TriageMessage(stranger, msg.ID, model.TriageMessageInput{
				Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal,
			})

			return err
		},
		"delete message": func() error {
			_, err := m.DeleteMessage(stranger, msg.ID)

			return err
		},
		"create layer": func() error {
			_, err := m.CreateLayer(stranger, inc.ID, "Layer")

			return err
		},
	}

	for name, call := range tests {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, call(), shared.ErrForbidden)
		})
	}
}

func TestMessageLifecycle_UpdateTriageAndDelete(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")
	m := s.resolver.Mutation()

	inc := s.createIncident(t, "Messages", model.IncidentAccessModeOpenOperational)
	res := s.alertResource(t, inc.ID, "TLF 1")

	msg, err := m.CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "first", Medium: model.MediumRadio,
	})
	require.NoError(t, err)
	assert.Equal(t, "first", msg.Content)
	assert.Equal(t, model.MediumRadio, msg.Medium)
	require.NotNil(t, msg.Author)
	assert.Equal(t, "owner", *msg.Author)

	at := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)

	updated, err := m.UpdateMessage(ctx, msg.ID, model.UpdateMessageInput{
		Content: new("second"), Medium: new(model.MediumEmail), Time: &at,
		SenderDetail: new("a@example.com"), ReceiverDetail: new("b@example.com"),
	})
	require.NoError(t, err)
	assert.Equal(t, "second", updated.Content)
	assert.Equal(t, model.MediumEmail, updated.Medium)
	assert.Equal(t, at, updated.Time)
	assert.Equal(t, "A", updated.Sender, "omitted fields are left alone")

	div := inc.Divisions[0]
	triaged, err := m.TriageMessage(ctx, msg.ID, model.TriageMessageInput{
		Triage:            model.TriageStatusDone,
		Priority:          model.PriorityStatusHigh,
		DivisionIds:       []string{div.ID},
		LinkedResourceIds: []string{res.ID},
	})
	require.NoError(t, err)
	assert.Equal(t, model.TriageStatusDone, triaged.Triage)
	assert.Equal(t, model.PriorityStatusHigh, triaged.Priority)
	assert.Equal(t, []string{res.ID}, triaged.LinkedResourceIds)
	require.Len(t, triaged.Divisions, 1)
	assert.Equal(t, div.ID, triaged.Divisions[0].ID)

	// The time of a triaged message is locked.
	_, err = m.UpdateMessage(ctx, msg.ID, model.UpdateMessageInput{Time: new(at.Add(time.Minute))})
	require.ErrorIs(t, err, shared.ErrMessageTimeLocked)

	// The division acknowledges, then the acknowledgement is revoked again.
	acked, err := m.AcknowledgeMessage(ctx, msg.ID, div.ID)
	require.NoError(t, err)
	require.Len(t, acked.Acknowledgements, 1)

	revoked, err := m.RevokeMessageAcknowledgement(ctx, msg.ID, div.ID)
	require.NoError(t, err)
	assert.Empty(t, revoked.Acknowledgements)

	deleted, err := m.DeleteMessage(ctx, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, msg.ID, deleted)

	s.catchUp(t)

	_, err = s.resolver.Query().Message(ctx, msg.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)
}

func TestCreateLayer_ReturnsAnEmptyStandardLayerNamedAfterTheIncident(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Layers", model.IncidentAccessModeOpenOperational)

	layer, err := s.resolver.Mutation().CreateLayer(ctxFor("owner"), inc.ID, "Lagekarte")
	require.NoError(t, err)

	assert.NotEmpty(t, layer.ID)
	assert.Equal(t, "Lagekarte", layer.Name)
	assert.Equal(t, inc.ID, layer.SourceIncidentID)
	assert.Equal(t, "Layers", layer.SourceIncidentName)
	assert.Equal(t, model.LayerKindStandard, layer.Kind)
	assert.Zero(t, layer.Revision)
	assert.NotNil(t, layer.Features)
	assert.Empty(t, layer.Features)
}

func TestFeatureMessages_FeatureWithoutMessagesHasNone(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")
	inc := s.createIncident(t, "Features", model.IncidentAccessModeOpenOperational)

	layer, err := s.resolver.Mutation().CreateLayer(ctx, inc.ID, "Map")
	require.NoError(t, err)

	feat, err := s.resolver.Mutation().AddFeature(ctx, inc.ID, layer.ID, "draw-1",
		map[string]any{"type": "Point", "coordinates": []any{8.5, 47.3}}, nil, nil)
	require.NoError(t, err)
	s.catchUp(t)

	got, err := s.resolver.Query().FeatureMessages(ctx, feat.ID)

	require.NoError(t, err)
	assert.NotNil(t, got, "a client that selects the list must get [], not null")
	assert.Empty(t, got)
}

func TestRemoveGroupMember_UnknownGroupFails(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	_, err := s.resolver.Mutation().RemoveGroupMember(ctxFor("admin"), newID(), "someone")

	require.Error(t, err)
}

// failingIncidents fails the incident service calls the resolvers make on their own.
type failingIncidents struct {
	inbound.IncidentService

	failLoad    bool
	failCompare bool
}

func (f failingIncidents) LoadIncident(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	if f.failLoad {
		return nil, errBoom
	}

	return f.IncidentService.LoadIncident(ctx, id)
}

func (f failingIncidents) CompareIncident(
	ctx context.Context,
	id shared.IncidentID,
	current kpi.Summary,
) (kpi.Comparison, error) {
	if f.failCompare {
		return kpi.Comparison{}, errBoom
	}

	return f.IncidentService.CompareIncident(ctx, id, current)
}

// failingTimeline fails both as-of queries.
type failingTimeline struct {
	inbound.TimelineService
}

func (failingTimeline) ResourcesAsOf(context.Context, shared.IncidentID, time.Time) ([]inbound.ResourceState, error) {
	return nil, errBoom
}

func (failingTimeline) SchadenplaetzeAsOf(
	context.Context,
	shared.IncidentID,
	time.Time,
) ([]inbound.SchadenplatzState, error) {
	return nil, errBoom
}

func TestResolvers_ServiceErrorsAreReturned(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Service faults", model.IncidentAccessModeOpenOperational)
	msg, err := s.resolver.Mutation().CreateMessage(ctxFor("owner"), model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	asOf := time.Now()

	tests := []struct {
		name  string
		setup func(r *gqlresolver.Resolver)
		call  func(ctx context.Context, r *gqlresolver.Resolver) error
	}{
		{
			"comparison",
			func(r *gqlresolver.Resolver) {
				r.Incidents = failingIncidents{IncidentService: r.Incidents, failCompare: true}
			},
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.IncidentReview().
					Comparison(ctx, &model.IncidentReview{IncidentID: inc.ID, Triage: &model.KpiMetric{}, Draw: &model.KpiMetric{}})

				return err
			},
		},
		{
			"triage response needs the incident",
			func(r *gqlresolver.Resolver) {
				r.Incidents = failingIncidents{IncidentService: r.Incidents, failLoad: true}
			},
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Mutation().TriageMessage(ctx, msg.ID, model.TriageMessageInput{
					Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal,
				})

				return err
			},
		},
		{
			"layer creation needs the incident",
			func(r *gqlresolver.Resolver) {
				r.Incidents = failingIncidents{IncidentService: r.Incidents, failLoad: true}
			},
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Mutation().CreateLayer(ctx, inc.ID, "x")

				return err
			},
		},
		{
			"schadenplaetze as of",
			func(r *gqlresolver.Resolver) { r.Timeline = failingTimeline{TimelineService: r.Timeline} },
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Incident().Schadenplaetze(ctx, &model.Incident{ID: inc.ID}, &asOf)

				return err
			},
		},
		{
			"resources as of",
			func(r *gqlresolver.Resolver) { r.Timeline = failingTimeline{TimelineService: r.Timeline} },
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Incident().Resources(ctx, &model.Incident{ID: inc.ID}, &asOf)

				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := *s.resolver
			tc.setup(&r)

			require.ErrorIs(t, tc.call(ctxFor("owner"), &r), errBoom)
		})
	}
}
