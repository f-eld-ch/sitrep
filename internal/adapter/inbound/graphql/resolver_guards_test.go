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
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// guardCase calls one resolver with the given id in the position under test; every other id it
// needs is a fresh valid UUID.
type guardCase struct {
	name string
	call func(ctx context.Context, r *gqlresolver.Resolver, id string) error
	// needsActor is set for resolvers that read the actor before anything else.
	needsActor bool
	// unknownErr is the error a well-formed id that names nothing yields; nil when the resolver
	// answers with an empty result instead.
	unknownErr error
}

func newID() string { return uuid.NewString() }

func guardCases() []guardCase {
	incidentWith := func(id string) *model.Incident { return &model.Incident{ID: id} }
	someMessageID := newID()

	return []guardCase{
		// Mutations on incidents.
		{
			name: "UpdateIncident", needsActor: true, unknownErr: shared.ErrForbidden,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().UpdateIncident(ctx, id, model.UpdateIncidentInput{Name: new("x")})

				return err
			},
		},
		{
			name: "UpdateIncident/division id", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().UpdateIncident(ctx, newID(), model.UpdateIncidentInput{
					Divisions: []*model.DivisionInput{{ID: &id, Name: "D"}},
				})

				return err
			},
		},
		{
			name: "CloseIncident", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().CloseIncident(ctx, id)

				return err
			},
		},
		{
			name: "ReopenIncident", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().ReopenIncident(ctx, id)

				return err
			},
		},
		{
			name: "DeleteIncident", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().DeleteIncident(ctx, id)

				return err
			},
		},
		{
			name: "LinkIncidentParent/child", needsActor: true, unknownErr: shared.ErrForbidden,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().LinkIncidentParent(ctx, id, newID())

				return err
			},
		},
		{
			name: "LinkIncidentParent/parent", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().LinkIncidentParent(ctx, newID(), id)

				return err
			},
		},
		{
			name: "UnlinkIncidentParent", needsActor: true, unknownErr: shared.ErrForbidden,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().UnlinkIncidentParent(ctx, id)

				return err
			},
		},
		// Mutations on messages.
		{
			name: "CreateMessage", needsActor: true, unknownErr: shared.ErrForbidden,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().CreateMessage(ctx, model.CreateMessageInput{
					IncidentID: id, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
				})

				return err
			},
		},
		{
			name: "UpdateMessage", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().UpdateMessage(ctx, id, model.UpdateMessageInput{Content: new("c")})

				return err
			},
		},
		{
			name: "TriageMessage", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().TriageMessage(ctx, id, model.TriageMessageInput{
					Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal,
				})

				return err
			},
		},
		{
			name: "TriageMessage/division id", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().TriageMessage(ctx, someMessageID, model.TriageMessageInput{
					Triage: model.TriageStatusDone, Priority: model.PriorityStatusNormal, DivisionIds: []string{id},
				})

				return err
			},
		},
		{
			name: "TriageMessage/resource id", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().TriageMessage(ctx, someMessageID, model.TriageMessageInput{
					Triage:            model.TriageStatusDone,
					Priority:          model.PriorityStatusNormal,
					LinkedResourceIds: []string{id},
				})

				return err
			},
		},
		{
			name: "RevokeMessageAcknowledgement/message", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().RevokeMessageAcknowledgement(ctx, id, newID())

				return err
			},
		},
		{
			name: "RevokeMessageAcknowledgement/division", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().RevokeMessageAcknowledgement(ctx, newID(), id)

				return err
			},
		},
		{
			name: "DeleteMessage", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().DeleteMessage(ctx, id)

				return err
			},
		},
		// Mutations on layers and features.
		{
			name: "CreateLayer", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().CreateLayer(ctx, id, "Layer")

				return err
			},
		},
		{
			name: "AddFeature/incident", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().AddFeature(ctx, id, newID(), "key", nil, nil, nil)

				return err
			},
		},
		{
			name: "AddFeature/change message", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().AddFeature(ctx, newID(), newID(), "key", nil, nil,
					&model.FeatureChangeInput{MessageID: &id})

				return err
			},
		},
		{
			name: "ModifyFeature", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().ModifyFeature(ctx, id, nil, nil, nil)

				return err
			},
		},
		{
			name: "ModifyFeature/change message", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().ModifyFeature(ctx, newID(), nil, nil, &model.FeatureChangeInput{MessageID: &id})

				return err
			},
		},
		{
			name: "DeleteFeature", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().DeleteFeature(ctx, id, nil)

				return err
			},
		},
		{
			name: "DeleteFeature/change message", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().DeleteFeature(ctx, newID(), &model.FeatureChangeInput{MessageID: &id})

				return err
			},
		},
		{
			name: "RestoreFeature", needsActor: true, unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().RestoreFeature(ctx, id, nil)

				return err
			},
		},
		{
			name: "RestoreFeature/change message", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().RestoreFeature(ctx, newID(), &model.FeatureChangeInput{MessageID: &id})

				return err
			},
		},
		{
			name: "RemoveGroupMember", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Mutation().RemoveGroupMember(ctx, id, "someone")

				return err
			},
		},
		// Queries.
		{
			name: "Incident", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().Incident(ctx, id)

				return err
			},
		},
		{
			name: "Message", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().Message(ctx, id)

				return err
			},
		},
		{
			name: "LayersForIncident",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().LayersForIncident(ctx, id, nil)

				return err
			},
		},
		{
			name: "FeatureChanges",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().FeatureChanges(ctx, id)

				return err
			},
		},
		{
			name: "FeatureChangeTimes",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().FeatureChangeTimes(ctx, id)

				return err
			},
		},
		{
			name: "FeatureMessages",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().FeatureMessages(ctx, id)

				return err
			},
		},
		{
			name: "IncidentAccess", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().IncidentAccess(ctx, id)

				return err
			},
		},
		{
			name: "IncidentAccessMode", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().IncidentAccessMode(ctx, id)

				return err
			},
		},
		{
			name: "GroupMembers", needsActor: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().GroupMembers(ctx, id)

				return err
			},
		},
		{
			name: "Schadenplatz", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().Schadenplatz(ctx, id)

				return err
			},
		},
		{
			name: "Resource", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Query().Resource(ctx, id)

				return err
			},
		},
		// Field resolvers: the parent object carries the id.
		{
			name: "Incident.childIncidents",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().ChildIncidents(ctx, incidentWith(id))

				return err
			},
		},
		{
			name: "Incident.hasCasualtyRecords",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().HasCasualtyRecords(ctx, incidentWith(id))

				return err
			},
		},
		{
			name: "Incident.review", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Review(ctx, incidentWith(id))

				return err
			},
		},
		{
			name: "Incident.messages", unknownErr: shared.ErrNotFound,
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Messages(ctx, incidentWith(id))

				return err
			},
		},
		{
			name: "Incident.schadenplaetze",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Schadenplaetze(ctx, incidentWith(id), nil)

				return err
			},
		},
		{
			name: "Incident.schadenplaetze/as of",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Schadenplaetze(ctx, incidentWith(id), new(time.Now()))

				return err
			},
		},
		{
			name: "Incident.resources",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Resources(ctx, incidentWith(id), nil)

				return err
			},
		},
		{
			name: "Incident.resources/as of",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().Resources(ctx, incidentWith(id), new(time.Now()))

				return err
			},
		},
		{
			name: "Incident.accessMode",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Incident().AccessMode(ctx, incidentWith(id))

				return err
			},
		},
		{
			name: "IncidentReview.comparison",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.IncidentReview().Comparison(ctx, &model.IncidentReview{IncidentID: id})

				return err
			},
		},
		{
			name: "Message.attachments",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Message().Attachments(ctx, &model.Message{ID: id})

				return err
			},
		},
		{
			name: "Message.schadenplatzCasualties",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Message().SchadenplatzCasualties(ctx, &model.Message{ID: id})

				return err
			},
		},
		{
			name: "Schadenplatz.resources",
			call: func(ctx context.Context, r *gqlresolver.Resolver, id string) error {
				_, err := r.Schadenplatz().Resources(ctx, &model.Schadenplatz{ID: id})

				return err
			},
		},
	}
}

// TestResolvers_RejectMalformedIDs checks that every resolver answers a malformed id with
// INVALID_INPUT before it touches a service or the read model.
func TestResolvers_RejectMalformedIDs(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	for _, tc := range guardCases() {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call(ctxFor("admin"), s.resolver, "not-a-uuid")

			require.ErrorIs(t, err, shared.ErrInvalidInput)
		})
	}
}

// TestResolvers_RequireAnActor checks that the resolvers that act for a user refuse an
// unauthenticated context.
func TestResolvers_RequireAnActor(t *testing.T) {
	s := newFullStack(t)

	for _, tc := range guardCases() {
		if !tc.needsActor {
			continue
		}

		t.Run(tc.name, func(t *testing.T) {
			err := tc.call(context.Background(), s.resolver, newID())

			require.ErrorIs(t, err, identity.ErrUnauthenticated)
		})
	}
}

// TestResolvers_UnknownIDIsNotFound checks that a well-formed id that names nothing surfaces
// the service or read-model error unchanged, so the server can classify it as NOT_FOUND.
func TestResolvers_UnknownIDIsNotFound(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	for _, tc := range guardCases() {
		if tc.unknownErr == nil {
			continue
		}

		t.Run(tc.name, func(t *testing.T) {
			err := tc.call(ctxFor("admin"), s.resolver, newID())

			require.ErrorIs(t, err, tc.unknownErr)
		})
	}
}

// TestResolvers_BadEnumsAreInvalidInput covers the value checks that run before the services.
func TestResolvers_BadEnumsAreInvalidInput(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")

	_, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: newID(), Medium: model.Medium("FAX"),
	})
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = s.resolver.Mutation().
		UpdateMessage(ctx, newID(), model.UpdateMessageInput{Medium: new(model.Medium("FAX"))})
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = s.resolver.Mutation().TriageMessage(ctx, newID(), model.TriageMessageInput{
		Triage: model.TriageStatus("NOPE"), Priority: model.PriorityStatusNormal,
	})
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = s.resolver.Mutation().TriageMessage(ctx, newID(), model.TriageMessageInput{
		Triage: model.TriageStatusDone, Priority: model.PriorityStatus("NOPE"),
	})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

// TestResolvers_WithoutAccessWiring checks the fallbacks of a resolver that has no access
// services: reads answer with the open defaults, everything that needs a check is forbidden.
func TestResolvers_WithoutAccessWiring(t *testing.T) {
	r := &gqlresolver.Resolver{}
	ctx := ctxFor("someone")

	mode, err := r.Incident().AccessMode(ctx, &model.Incident{ID: newID()})
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, mode)

	def, err := r.Query().DefaultAccess(ctx)
	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, def.Mode)
	assert.Empty(t, def.Grants)

	roles, err := r.Query().MyGlobalRoles(ctx)
	require.NoError(t, err)
	assert.Empty(t, roles)

	_, err = r.Query().IncidentAccess(ctx, newID())
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = r.Query().IncidentAccessMode(ctx, newID())
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = r.Query().GroupMembers(ctx, newID())
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = r.Query().Users(ctx)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = r.Query().GlobalRoles(ctx)
	require.ErrorIs(t, err, shared.ErrForbidden)

	_, err = r.Mutation().RemoveGroupMember(ctx, newID(), "someone")
	require.ErrorIs(t, err, shared.ErrForbidden)
}
