package graphql_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestSchadenplatz_CreateRenameGeometryQuery(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "owner", "Sites", model.IncidentAccessModeOpenOperational)
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	created, err := m.CreateSchadenplatz(ctx, inc.ID, "Nord", nil)
	require.NoError(t, err)
	assert.Equal(t, inc.ID, created.IncidentID)
	assert.Equal(t, "Nord", created.Name)
	assert.False(t, created.IsDefault)
	assert.False(t, created.IsMerged)
	assert.Nil(t, created.GeoJSON)
	assert.Equal(t, &model.Casualties{}, created.Casualties)

	_, err = uuid.Parse(created.ID)
	require.NoError(t, err)

	renamed, err := m.RenameSchadenplatz(ctx, created.ID, "Nordhang")
	require.NoError(t, err)
	assert.Equal(t, created.ID, renamed.ID)
	assert.Equal(t, "Nordhang", renamed.Name)

	_, err = m.RenameSchadenplatz(ctx, created.ID, "")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	geo := `{"type":"Point","coordinates":[8.64,46.88]}`

	withGeo, err := m.SetSchadenplatzGeometry(ctx, created.ID, &geo)
	require.NoError(t, err)
	require.NotNil(t, withGeo.GeoJSON)
	assert.JSONEq(t, geo, *withGeo.GeoJSON)

	s.catchUp(t)

	got, err := s.resolver.Query().Schadenplatz(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "Nordhang", got.Name)
	require.NotNil(t, got.GeoJSON)
	assert.JSONEq(t, geo, *got.GeoJSON)

	cleared, err := m.SetSchadenplatzGeometry(ctx, created.ID, nil)
	require.NoError(t, err)
	assert.Nil(t, cleared.GeoJSON, "a nil geometry clears it")

	_, err = s.resolver.Query().Schadenplatz(ctx, uuid.NewString())
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = s.resolver.Query().Schadenplatz(ctx, "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestSchadenplatz_CreateHonoursOccurredAt(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "owner", "Past", model.IncidentAccessModeOpenOperational)

	created, err := s.resolver.Mutation().CreateSchadenplatz(
		ctxFor("owner"), inc.ID, "Früher", new(time.Now().UTC().Add(-time.Hour)),
	)
	require.NoError(t, err)

	// Replaying the incident as of before the Schadenplatz was created does not show it.
	before := time.Now().UTC().Add(-2 * time.Hour)

	places, err := s.resolver.Incident().Schadenplaetze(ctxFor("owner"), inc, &before)
	require.NoError(t, err)

	for _, p := range places {
		assert.NotEqual(t, created.ID, p.ID)
	}
}

func TestSchadenplatz_MergeIntoDefault(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "owner", "Merge", model.IncidentAccessModeOpenOperational)
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	site, err := m.CreateSchadenplatz(ctx, inc.ID, "Nebenschauplatz", nil)
	require.NoError(t, err)

	msg, err := m.CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	recorded, err := m.RecordCasualties(ctx, site.ID, msg.ID, nil, model.CasualtyDeltasInput{Verletzte: 4, Tote: 1})
	require.NoError(t, err)
	assert.Equal(t, 4, recorded.Casualties.Verletzte)
	s.catchUp(t)

	places, err := s.resolver.Incident().Schadenplaetze(ctx, inc, nil)
	require.NoError(t, err)

	var defaultID string

	for _, p := range places {
		if p.IsDefault {
			defaultID = p.ID
		}
	}

	require.NotEmpty(t, defaultID)

	// The default site cannot be merged into itself.
	_, err = m.MergeSchadenplatz(ctx, defaultID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	merged, err := m.MergeSchadenplatz(ctx, site.ID, nil)
	require.NoError(t, err)
	assert.Equal(t, site.ID, merged)
	s.catchUp(t)

	got, err := s.resolver.Query().Schadenplatz(ctx, site.ID)
	require.NoError(t, err)
	assert.True(t, got.IsMerged)
	require.NotNil(t, got.MergedInto)
	assert.Equal(t, defaultID, *got.MergedInto)

	// The casualty totals moved to the default site rather than being lost.
	def, err := s.resolver.Query().Schadenplatz(ctx, defaultID)
	require.NoError(t, err)
	assert.Equal(t, 4, def.Casualties.Verletzte)
	assert.Equal(t, 1, def.Casualties.Tote)

	// A merged site is closed for changes.
	_, err = m.RenameSchadenplatz(ctx, site.ID, "x")
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)

	_, err = m.MergeSchadenplatz(ctx, site.ID, nil)
	require.ErrorIs(t, err, shared.ErrSchadenplatzMerged)
}

func TestSchadenplatz_MessageCasualtiesField(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "owner", "Casualties", model.IncidentAccessModeOpenOperational)
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	site, err := m.CreateSchadenplatz(ctx, inc.ID, "Ost", nil)
	require.NoError(t, err)

	newMessage := func(content string) *model.Message {
		t.Helper()

		msg, err := m.CreateMessage(ctx, model.CreateMessageInput{
			IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: content, Medium: model.MediumRadio,
		})
		require.NoError(t, err)

		return msg
	}

	msg, other := newMessage("c"), newMessage("d")

	_, err = m.RecordCasualties(ctx, site.ID, msg.ID, nil, model.CasualtyDeltasInput{
		Vermisste: 1, Tote: 2, Verletzte: 3, Obdachlose: 4, Eingeschlossene: 5,
	})
	require.NoError(t, err)

	// Totals cannot drop below zero.
	_, err = m.RecordCasualties(ctx, site.ID, other.ID, nil, model.CasualtyDeltasInput{Tote: -5})
	require.ErrorIs(t, err, shared.ErrCasualtyBelowZero)

	s.catchUp(t)

	entries, err := s.resolver.Message().SchadenplatzCasualties(ctx, msg)
	require.NoError(t, err)
	assert.Equal(t, []*model.SchadenplatzCasualtyEntry{{
		SchadenplatzID: site.ID, Vermisste: 1, Tote: 2, Verletzte: 3, Obdachlose: 4, Eingeschlossene: 5,
	}}, entries)

	none, err := s.resolver.Message().SchadenplatzCasualties(ctx, other)
	require.NoError(t, err)
	assert.Empty(t, none)

	_, err = s.resolver.Message().SchadenplatzCasualties(ctx, &model.Message{ID: "nope"})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestSchadenplatzMutations_GuardClauses(t *testing.T) {
	s := newFullStack(t)
	m := s.resolver.Mutation()
	id := uuid.NewString()

	calls := map[string]func(ctx context.Context, id string) error{
		"create": func(ctx context.Context, id string) error { _, e := m.CreateSchadenplatz(ctx, id, "x", nil); return e },
		"rename": func(ctx context.Context, id string) error { _, e := m.RenameSchadenplatz(ctx, id, "x"); return e },
		"geometry": func(ctx context.Context, id string) error {
			_, e := m.SetSchadenplatzGeometry(ctx, id, nil)
			return e
		},
		"merge": func(ctx context.Context, id string) error { _, e := m.MergeSchadenplatz(ctx, id, nil); return e },
		"casualties": func(ctx context.Context, id string) error {
			_, e := m.RecordCasualties(ctx, id, uuid.NewString(), nil, model.CasualtyDeltasInput{})
			return e
		},
		"casualties (bad message)": func(ctx context.Context, id string) error {
			_, e := m.RecordCasualties(ctx, uuid.NewString(), id, nil, model.CasualtyDeltasInput{})
			return e
		},
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			require.Error(t, call(context.Background(), id), "no actor")
			require.ErrorIs(t, call(ctxFor("x"), "nope"), shared.ErrInvalidInput, "malformed id")
		})
	}

	for _, name := range []string{"rename", "geometry", "merge", "casualties"} {
		require.ErrorIs(t, calls[name](ctxFor("x"), id), shared.ErrNotFound, name+" on an unknown site")
	}
}

func TestSchadenplatzMutations_RequireWriteAccess(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "owner", "Locked", model.IncidentAccessModeRestricted)

	site, err := s.resolver.Mutation().CreateSchadenplatz(ctxFor("owner"), inc.ID, "Site", nil)
	require.NoError(t, err)

	_, err = s.resolver.Mutation().GrantIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "viewer", model.IncidentRoleViewer,
	)
	require.NoError(t, err)
	s.catchUp(t)

	m := s.resolver.Mutation()

	for _, sub := range []string{"viewer", "stranger"} {
		ctx := ctxFor(sub)

		_, err := m.CreateSchadenplatz(ctx, inc.ID, "x", nil)
		require.ErrorIs(t, err, shared.ErrForbidden, "create as "+sub)

		_, err = m.RenameSchadenplatz(ctx, site.ID, "x")
		require.ErrorIs(t, err, shared.ErrForbidden, "rename as "+sub)

		_, err = m.SetSchadenplatzGeometry(ctx, site.ID, new(`{"type":"Point","coordinates":[1,2]}`))
		require.ErrorIs(t, err, shared.ErrForbidden, "geometry as "+sub)

		_, err = m.MergeSchadenplatz(ctx, site.ID, nil)
		require.ErrorIs(t, err, shared.ErrForbidden, "merge as "+sub)
	}

	s.catchUp(t)

	got, err := s.resolver.Query().Schadenplatz(ctxFor("owner"), site.ID)
	require.NoError(t, err)
	assert.Equal(t, "Site", got.Name)
	assert.False(t, got.IsMerged)
}
