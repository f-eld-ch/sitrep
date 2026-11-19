package graphql_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gqlresolver "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var errBoom = errors.New("boom")

// faultyQueries delegates to the real read model but fails the one method named in fail, which
// is how the error branches behind the read-model calls are reached.
type faultyQueries struct {
	outbound.Queries

	fail string
}

func (q faultyQueries) boom(method string) error {
	if q.fail == method {
		return errBoom
	}

	return nil
}

func (q faultyQueries) ListIncidents(ctx context.Context) ([]*outbound.IncidentRM, error) {
	if err := q.boom("ListIncidents"); err != nil {
		return nil, err
	}

	return q.Queries.ListIncidents(ctx)
}

func (q faultyQueries) GetIncident(ctx context.Context, id uuid.UUID) (*outbound.IncidentRM, error) {
	if err := q.boom("GetIncident"); err != nil {
		return nil, err
	}

	return q.Queries.GetIncident(ctx, id)
}

func (q faultyQueries) ListMessages(ctx context.Context, id uuid.UUID) ([]*outbound.MessageRM, error) {
	if err := q.boom("ListMessages"); err != nil {
		return nil, err
	}

	return q.Queries.ListMessages(ctx, id)
}

func (q faultyQueries) ListChildIncidents(ctx context.Context, id uuid.UUID) ([]*outbound.IncidentRM, error) {
	if err := q.boom("ListChildIncidents"); err != nil {
		return nil, err
	}

	return q.Queries.ListChildIncidents(ctx, id)
}

func (q faultyQueries) ListAttachments(ctx context.Context, id uuid.UUID) ([]*outbound.AttachmentRM, error) {
	if err := q.boom("ListAttachments"); err != nil {
		return nil, err
	}

	return q.Queries.ListAttachments(ctx, id)
}

func (q faultyQueries) HasCasualtyRecords(ctx context.Context, id uuid.UUID) (bool, error) {
	if err := q.boom("HasCasualtyRecords"); err != nil {
		return false, err
	}

	return q.Queries.HasCasualtyRecords(ctx, id)
}

func (q faultyQueries) ListMessageCasualties(
	ctx context.Context,
	id uuid.UUID,
) ([]*outbound.MessageCasualtyRM, error) {
	if err := q.boom("ListMessageCasualties"); err != nil {
		return nil, err
	}

	return q.Queries.ListMessageCasualties(ctx, id)
}

func (q faultyQueries) ListSchadenplaetze(ctx context.Context, id uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	if err := q.boom("ListSchadenplaetze"); err != nil {
		return nil, err
	}

	return q.Queries.ListSchadenplaetze(ctx, id)
}

func (q faultyQueries) ListResourcesForIncident(ctx context.Context, id uuid.UUID) ([]*outbound.ResourceRM, error) {
	if err := q.boom("ListResourcesForIncident"); err != nil {
		return nil, err
	}

	return q.Queries.ListResourcesForIncident(ctx, id)
}

func (q faultyQueries) ListResourcesForSchadenplatz(
	ctx context.Context,
	id uuid.UUID,
) ([]*outbound.ResourceRM, error) {
	if err := q.boom("ListResourcesForSchadenplatz"); err != nil {
		return nil, err
	}

	return q.Queries.ListResourcesForSchadenplatz(ctx, id)
}

func (q faultyQueries) ListVisibleLayers(ctx context.Context, id uuid.UUID) ([]*outbound.LayerRM, error) {
	if err := q.boom("ListVisibleLayers"); err != nil {
		return nil, err
	}

	if q.fail == "CorruptLayer" {
		return []*outbound.LayerRM{{ID: uuid.New(), GeoJSON: []byte("{not json")}}, nil
	}

	return q.Queries.ListVisibleLayers(ctx, id)
}

func (q faultyQueries) ListFeaturePlacements(ctx context.Context, id uuid.UUID) (map[uuid.UUID]time.Time, error) {
	if err := q.boom("ListFeaturePlacements"); err != nil {
		return nil, err
	}

	return q.Queries.ListFeaturePlacements(ctx, id)
}

func (q faultyQueries) ListFeatureChanges(ctx context.Context, id uuid.UUID) ([]*outbound.FeatureChangeRM, error) {
	if err := q.boom("ListFeatureChanges"); err != nil {
		return nil, err
	}

	return q.Queries.ListFeatureChanges(ctx, id)
}

func (q faultyQueries) ListFeatureChangeTimes(ctx context.Context, id uuid.UUID) ([]time.Time, error) {
	if err := q.boom("ListFeatureChangeTimes"); err != nil {
		return nil, err
	}

	return q.Queries.ListFeatureChangeTimes(ctx, id)
}

func (q faultyQueries) ListFeatureMessages(ctx context.Context, id uuid.UUID) ([]*outbound.MessageRM, error) {
	if err := q.boom("ListFeatureMessages"); err != nil {
		return nil, err
	}

	if q.fail == "FeatureMessagesWithoutIncident" {
		return []*outbound.MessageRM{{ID: uuid.New(), IncidentID: uuid.New()}}, nil
	}

	return q.Queries.ListFeatureMessages(ctx, id)
}

func (q faultyQueries) GetMessage(ctx context.Context, id uuid.UUID) (*outbound.MessageRM, error) {
	if err := q.boom("GetMessage"); err != nil {
		return nil, err
	}

	return q.Queries.GetMessage(ctx, id)
}

func (q faultyQueries) GetSchadenplatz(ctx context.Context, id uuid.UUID) (*outbound.SchadenplatzRM, error) {
	if err := q.boom("GetSchadenplatz"); err != nil {
		return nil, err
	}

	return q.Queries.GetSchadenplatz(ctx, id)
}

func (q faultyQueries) GetResource(ctx context.Context, id uuid.UUID) (*outbound.ResourceRM, error) {
	if err := q.boom("GetResource"); err != nil {
		return nil, err
	}

	return q.Queries.GetResource(ctx, id)
}

// TestResolvers_ReadModelErrorsAreReturned checks that a failing read model is passed on to the
// caller as it is, not swallowed or turned into an empty result.
func TestResolvers_ReadModelErrorsAreReturned(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Faults", model.IncidentAccessModeOpenOperational)
	parent := &model.Incident{ID: inc.ID}
	asOf := time.Now()

	msg, err := s.resolver.Mutation().CreateMessage(ctxFor("owner"), model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
	})
	require.NoError(t, err)
	s.catchUp(t)

	tests := []struct {
		name string
		fail string
		call func(ctx context.Context, r *gqlresolver.Resolver) error
	}{
		{"incidents", "ListIncidents", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Incidents(ctx)

			return err
		}},
		{"incident", "GetIncident", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Incident(ctx, inc.ID)

			return err
		}},
		{"message", "GetMessage", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Message(ctx, newID())

			return err
		}},
		{"message: incident", "GetIncident", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Message(ctx, msg.ID)

			return err
		}},
		{"child incidents", "ListChildIncidents", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().ChildIncidents(ctx, parent)

			return err
		}},
		{"has casualty records", "HasCasualtyRecords", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().HasCasualtyRecords(ctx, parent)

			return err
		}},
		{"messages: incident", "GetIncident", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().Messages(ctx, parent)

			return err
		}},
		{"messages: list", "ListMessages", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().Messages(ctx, parent)

			return err
		}},
		{"schadenplaetze", "ListSchadenplaetze", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().Schadenplaetze(ctx, parent, nil)

			return err
		}},
		{"resources", "ListResourcesForIncident", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Incident().Resources(ctx, parent, nil)

			return err
		}},
		{"message attachments", "ListAttachments", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Message().Attachments(ctx, &model.Message{ID: newID()})

			return err
		}},
		{"message casualties", "ListMessageCasualties", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Message().SchadenplatzCasualties(ctx, &model.Message{ID: newID()})

			return err
		}},
		{
			"schadenplatz resources",
			"ListResourcesForSchadenplatz",
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Schadenplatz().Resources(ctx, &model.Schadenplatz{ID: newID()})

				return err
			},
		},
		{"schadenplatz", "GetSchadenplatz", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Schadenplatz(ctx, newID())

			return err
		}},
		{"resource", "GetResource", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().Resource(ctx, newID())

			return err
		}},
		{"layers: list", "ListVisibleLayers", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().LayersForIncident(ctx, inc.ID, nil)

			return err
		}},
		{"layers: corrupt geojson", "CorruptLayer", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().LayersForIncident(ctx, inc.ID, nil)

			return err
		}},
		{"layers: placements", "ListFeaturePlacements", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().LayersForIncident(ctx, inc.ID, nil)

			return err
		}},
		{"layers: changes as of", "ListFeatureChanges", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().LayersForIncident(ctx, inc.ID, &asOf)

			return err
		}},
		{"feature changes", "ListFeatureChanges", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().FeatureChanges(ctx, inc.ID)

			return err
		}},
		{"feature change times", "ListFeatureChangeTimes", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().FeatureChangeTimes(ctx, inc.ID)

			return err
		}},
		{"feature messages: list", "ListFeatureMessages", func(ctx context.Context, r *gqlresolver.Resolver) error {
			_, err := r.Query().FeatureMessages(ctx, newID())

			return err
		}},
		{
			"feature messages: incident",
			"FeatureMessagesWithoutIncident",
			func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().FeatureMessages(ctx, newID())

				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := *s.resolver
			r.Queries = faultyQueries{Queries: s.resolver.Queries, fail: tc.fail}

			err := tc.call(ctxFor("owner"), &r)

			require.Error(t, err)

			if tc.fail != "CorruptLayer" && tc.fail != "FeatureMessagesWithoutIncident" {
				require.ErrorIs(t, err, errBoom)
			}
		})
	}
}

// faultyAccessQueries fails the access read model, or its checkers, as configured.
type faultyAccessQueries struct {
	outbound.AccessQueries

	fail string
}

func (q faultyAccessQueries) boom(method string) error {
	if q.fail == method {
		return errBoom
	}

	return nil
}

func (q faultyAccessQueries) ListIncidentAccess(
	ctx context.Context,
	id shared.IncidentID,
) ([]outbound.IncidentAccessGrantRM, error) {
	if err := q.boom("ListIncidentAccess"); err != nil {
		return nil, err
	}

	return q.AccessQueries.ListIncidentAccess(ctx, id)
}

func (q faultyAccessQueries) GetIncidentAccessMode(
	ctx context.Context,
	id shared.IncidentID,
) (access.IncidentMode, error) {
	if err := q.boom("GetIncidentAccessMode"); err != nil {
		return "", err
	}

	return q.AccessQueries.GetIncidentAccessMode(ctx, id)
}

func (q faultyAccessQueries) ListAccessGroups(ctx context.Context) ([]outbound.AccessGroupRM, error) {
	if err := q.boom("ListAccessGroups"); err != nil {
		return nil, err
	}

	return q.AccessQueries.ListAccessGroups(ctx)
}

func (q faultyAccessQueries) ListGroupMembers(ctx context.Context, id uuid.UUID) ([]outbound.GroupMemberRM, error) {
	if err := q.boom("ListGroupMembers"); err != nil {
		return nil, err
	}

	return q.AccessQueries.ListGroupMembers(ctx, id)
}

func (q faultyAccessQueries) ListUsers(ctx context.Context) ([]outbound.UserRM, error) {
	if err := q.boom("ListUsers"); err != nil {
		return nil, err
	}

	return q.AccessQueries.ListUsers(ctx)
}

func (q faultyAccessQueries) ListGlobalRoles(ctx context.Context) ([]outbound.GlobalRoleGrantRM, error) {
	if err := q.boom("ListGlobalRoles"); err != nil {
		return nil, err
	}

	return q.AccessQueries.ListGlobalRoles(ctx)
}

func (q faultyAccessQueries) MyGlobalRoles(ctx context.Context, sub string) ([]outbound.GlobalRoleGrantRM, error) {
	if err := q.boom("MyGlobalRoles"); err != nil {
		return nil, err
	}

	return q.AccessQueries.MyGlobalRoles(ctx, sub)
}

func (q faultyAccessQueries) GetDefaultAccessTemplate(ctx context.Context) (outbound.DefaultAccessTemplateRM, error) {
	if err := q.boom("GetDefaultAccessTemplate"); err != nil {
		return outbound.DefaultAccessTemplateRM{}, err
	}

	return q.AccessQueries.GetDefaultAccessTemplate(ctx)
}

type failingIncidentChecker struct{}

func (failingIncidentChecker) Can(context.Context, string, shared.IncidentID, access.Action) (bool, error) {
	return false, errBoom
}

type failingGlobalChecker struct{}

func (failingGlobalChecker) Can(context.Context, string, access.GlobalAction) (bool, error) {
	return false, errBoom
}

// TestResolvers_AccessErrorsAreReturned checks that failures of the access read model and of
// the permission checkers reach the caller instead of being read as "not allowed".
func TestResolvers_AccessErrorsAreReturned(t *testing.T) {
	s := newFullStack(t)
	s.bootstrapAdmin(t)

	inc := s.createIncident(t, "Access faults", model.IncidentAccessModeOpenOperational)

	tests := []struct {
		name string
		// fail is the access read-model method that fails; empty keeps it healthy.
		fail string
		// failIncidentChecker and failGlobalChecker swap in a permission checker that errors.
		failIncidentChecker bool
		failGlobalChecker   bool
		call                func(ctx context.Context, r *gqlresolver.Resolver) error
	}{
		{
			name: "incident access: checker", failIncidentChecker: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().IncidentAccess(ctx, inc.ID)

				return err
			},
		},
		{
			name: "incident access: list", fail: "ListIncidentAccess",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().IncidentAccess(ctx, inc.ID)

				return err
			},
		},
		{
			name: "incident access mode: checker", failIncidentChecker: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().IncidentAccessMode(ctx, inc.ID)

				return err
			},
		},
		{
			name: "incident access mode: read", fail: "GetIncidentAccessMode",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().IncidentAccessMode(ctx, inc.ID)

				return err
			},
		},
		{
			name: "incident.accessMode", fail: "GetIncidentAccessMode",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Incident().AccessMode(ctx, &model.Incident{ID: inc.ID})

				return err
			},
		},
		{
			name: "access groups", fail: "ListAccessGroups",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().AccessGroups(ctx)

				return err
			},
		},
		{
			name: "group members: checker", failGlobalChecker: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().GroupMembers(ctx, newID())

				return err
			},
		},
		{
			name: "group members: list", fail: "ListGroupMembers",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().GroupMembers(ctx, newID())

				return err
			},
		},
		{
			name: "users: checker", failGlobalChecker: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().Users(ctx)

				return err
			},
		},
		{
			name: "users: list", fail: "ListUsers",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().Users(ctx)

				return err
			},
		},
		{
			name: "global roles: checker", failGlobalChecker: true,
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().GlobalRoles(ctx)

				return err
			},
		},
		{
			name: "global roles: list", fail: "ListGlobalRoles",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().GlobalRoles(ctx)

				return err
			},
		},
		{
			name: "my global roles", fail: "MyGlobalRoles",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().MyGlobalRoles(ctx)

				return err
			},
		},
		{
			name: "default access", fail: "GetDefaultAccessTemplate",
			call: func(ctx context.Context, r *gqlresolver.Resolver) error {
				_, err := r.Query().DefaultAccess(ctx)

				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := *s.resolver
			r.AccessQueries = faultyAccessQueries{AccessQueries: s.resolver.AccessQueries, fail: tc.fail}

			if tc.failIncidentChecker {
				r.IncidentAccessChecker = failingIncidentChecker{}
			}

			if tc.failGlobalChecker {
				r.GlobalAccessChecker = failingGlobalChecker{}
			}

			err := tc.call(ctxFor("admin"), &r)

			require.ErrorIs(t, err, errBoom)
		})
	}
}

// TestIncidentAccessMode_FallsBackToOpenWhenNoModeIsRecorded checks the field resolver's
// fallback for incidents that predate the access model.
func TestIncidentAccessMode_FallsBackToOpenWhenNoModeIsRecorded(t *testing.T) {
	s := newFullStack(t)

	mode, err := s.resolver.Incident().AccessMode(ctxFor("owner"), &model.Incident{ID: newID()})

	require.NoError(t, err)
	assert.Equal(t, model.IncidentAccessModeOpenOperational, mode)
}
