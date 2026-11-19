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

// alertResource, as the user "owner", alerts a Feuerwehr Gruppe on the incident's default Schadenplatz.
func (s *fullStack) alertResource(t *testing.T, incidentID, name string) *model.Resource {
	t.Helper()

	res, err := s.resolver.Mutation().AlertResource(ctxFor("owner"), model.AlertResourceInput{
		IncidentID:     incidentID,
		Formation:      model.ResourceFormationFw,
		Name:           name,
		Size:           model.ResourceUnitSizeGruppe,
		PersonnelCount: 6,
		Hauptaufgabe:   "Löschen",
	})
	require.NoError(t, err)

	return res
}

func TestAlertResource_MapsEveryOptionalField(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Resources", model.IncidentAccessModeOpenOperational)

	sp, err := s.resolver.Mutation().CreateSchadenplatz(ctxFor("owner"), inc.ID, "Nord", nil)
	require.NoError(t, err)

	msg, err := s.resolver.Mutation().CreateMessage(ctxFor("owner"), model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "c", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	at := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)

	res, err := s.resolver.Mutation().AlertResource(ctxFor("owner"), model.AlertResourceInput{
		IncidentID:      inc.ID,
		SchadenplatzID:  &sp.ID,
		Formation:       model.ResourceFormationPol,
		Name:            "Patrouille 7",
		Size:            model.ResourceUnitSizeZug,
		PersonnelCount:  12,
		Hauptaufgabe:    "Absperren",
		Contact:         &model.ResourceContactInput{Medium: model.ContactMediumPhone, Detail: "079 000 00 00"},
		HomeLocation:    &model.ResourceHomeLocationInput{Name: "Posten Altdorf", Lat: new(46.88), Lng: new(8.64)},
		SourceMessageID: &msg.ID,
		OccurredAt:      &at,
	})
	require.NoError(t, err)

	assert.NotEmpty(t, res.ID)
	assert.Equal(t, inc.ID, res.IncidentID)
	assert.Equal(t, sp.ID, res.SchadenplatzID)
	assert.Equal(t, model.ResourceFormationPol, res.Formation)
	assert.Equal(t, model.ResourceUnitSizeZug, res.Size)
	assert.Equal(t, 12, res.PersonnelCount)
	assert.Equal(t, "Absperren", res.Hauptaufgabe)
	assert.Equal(t, model.ResourceStatusAufgeboten, res.Status)
	assert.Equal(t, at, res.AlertedAt)
	assert.Equal(t, &model.ResourceContact{Medium: model.ContactMediumPhone, Detail: "079 000 00 00"}, res.Contact)
	assert.Equal(
		t,
		&model.ResourceHomeLocation{Name: "Posten Altdorf", Lat: new(46.88), Lng: new(8.64)},
		res.HomeLocation,
	)
	require.NotNil(t, res.SourceMessageID)
	assert.Equal(t, msg.ID, *res.SourceMessageID)

	// A home location without coordinates keeps only the name.
	plain, err := s.resolver.Mutation().AlertResource(ctxFor("owner"), model.AlertResourceInput{
		IncidentID: inc.ID, Formation: model.ResourceFormationSan, Name: "San 1", Size: model.ResourceUnitSizeTrupp,
		PersonnelCount: 2, Hauptaufgabe: "Erste Hilfe",
		HomeLocation: &model.ResourceHomeLocationInput{Name: "Spital"},
	})
	require.NoError(t, err)
	assert.Equal(t, &model.ResourceHomeLocation{Name: "Spital"}, plain.HomeLocation)
	assert.NotEqual(t, sp.ID, plain.SchadenplatzID, "defaults to the incident's default Schadenplatz")
}

func TestAlertResource_RejectsBadInput(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Bad", model.IncidentAccessModeOpenOperational)

	base := func() model.AlertResourceInput {
		return model.AlertResourceInput{
			IncidentID: inc.ID, Formation: model.ResourceFormationFw, Name: "TLF", Size: model.ResourceUnitSizeTrupp,
			PersonnelCount: 2, Hauptaufgabe: "x",
		}
	}

	tests := map[string]func(in *model.AlertResourceInput){
		"bad incident id":   func(in *model.AlertResourceInput) { in.IncidentID = "nope" },
		"bad schadenplatz":  func(in *model.AlertResourceInput) { in.SchadenplatzID = new("nope") },
		"bad source msg":    func(in *model.AlertResourceInput) { in.SourceMessageID = new("nope") },
		"empty name":        func(in *model.AlertResourceInput) { in.Name = "" },
		"no personnel":      func(in *model.AlertResourceInput) { in.PersonnelCount = 0 },
		"unknown incident":  func(in *model.AlertResourceInput) { in.IncidentID = uuid.NewString() },
		"closed (no actor)": nil,
	}

	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			if mutate == nil {
				_, err := s.resolver.Mutation().AlertResource(context.Background(), base())
				require.Error(t, err)

				return
			}

			in := base()
			mutate(&in)

			_, err := s.resolver.Mutation().AlertResource(ctxFor("owner"), in)
			require.Error(t, err)

			// Everything but a missing aggregate is a client error.
			if name != "unknown incident" {
				require.ErrorIs(t, err, shared.ErrInvalidInput)
			}
		})
	}
}

func TestResource_StatusLifecycle(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Lifecycle", model.IncidentAccessModeOpenOperational)
	res := s.alertResource(t, inc.ID, "TLF 1")
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	at := func(minutes int) *time.Time {
		v := time.Now().UTC().Add(time.Duration(minutes) * time.Minute).Truncate(time.Second)
		return &v
	}

	// Skipping a step is refused: a resource must be ready before it is deployed.
	_, err := m.DeployResource(ctx, res.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	readyAt := at(1)
	ready, err := m.MarkResourceReady(ctx, res.ID, readyAt)
	require.NoError(t, err)
	assert.Equal(t, res.ID, ready.ID)
	assert.Equal(t, model.ResourceStatusEinsatzbereit, ready.Status)
	require.NotNil(t, ready.ReadyAt)
	assert.Equal(t, *readyAt, *ready.ReadyAt, "the supplied time is honoured")

	_, err = m.MarkResourceReady(ctx, res.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput, "already ready")

	deployedAt := at(2)
	deployed, err := m.DeployResource(ctx, res.ID, deployedAt)
	require.NoError(t, err)
	assert.Equal(t, model.ResourceStatusEingesetzt, deployed.Status)
	require.NotNil(t, deployed.DeployedAt)
	assert.Equal(t, *deployedAt, *deployed.DeployedAt)

	stood, err := m.StandDownResource(ctx, res.ID, at(3))
	require.NoError(t, err)
	assert.Equal(t, model.ResourceStatusEinsatzbereit, stood.Status)

	_, err = m.DeployResource(ctx, res.ID, at(4))
	require.NoError(t, err)

	relieved, err := m.RelieveResource(ctx, res.ID, nil, at(5))
	require.NoError(t, err)
	assert.Equal(t, model.ResourceStatusAbgeloest, relieved.Status)
	assert.NotNil(t, relieved.RelievedAt)
	assert.Nil(t, relieved.SuccessorID)
	assert.NotEmpty(t, relieved.DeploymentHistory, "the deployment period is kept")

	_, err = m.RelieveResource(ctx, res.ID, nil, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput, "already relieved")

	// A relieved resource can be called back for the next day.
	back, err := m.ReactivateResource(ctx, res.ID, at(6))
	require.NoError(t, err)
	assert.Equal(t, model.ResourceStatusAufgeboten, back.Status)

	_, err = m.ReactivateResource(ctx, res.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput, "only a relieved resource can be reactivated")
}

func TestResource_Edits(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Edits", model.IncidentAccessModeOpenOperational)
	res := s.alertResource(t, inc.ID, "TLF 1")
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	renamed, err := m.RenameResource(ctx, res.ID, "TLF 2", nil)
	require.NoError(t, err)
	assert.Equal(t, "TLF 2", renamed.Name)

	_, err = m.RenameResource(ctx, res.ID, "", nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	task, err := m.ChangeHauptaufgabe(ctx, res.ID, "Menschenrettung", nil)
	require.NoError(t, err)
	assert.Equal(t, "Menschenrettung", task.Hauptaufgabe)

	count, err := m.UpdatePersonnelCount(ctx, res.ID, 9, nil)
	require.NoError(t, err)
	assert.Equal(t, 9, count.PersonnelCount)

	_, err = m.UpdatePersonnelCount(ctx, res.ID, 0, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	contact, err := m.UpdateContact(
		ctx, res.ID, model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "Kanal 4"}, nil,
	)
	require.NoError(t, err)
	assert.Equal(t, &model.ResourceContact{Medium: model.ContactMediumRadio, Detail: "Kanal 4"}, contact.Contact)

	located, err := m.UpdateDeploymentLocation(
		ctx, res.ID, &model.DeploymentLocationInput{Lat: new(46.9), Lng: new(8.6), Label: "Bahnhof"}, nil,
	)
	require.NoError(t, err)
	assert.Equal(
		t,
		&model.DeploymentLocation{Lat: new(46.9), Lng: new(8.6), Label: "Bahnhof"},
		located.DeploymentLocation,
	)

	cleared, err := m.UpdateDeploymentLocation(ctx, res.ID, nil, nil)
	require.NoError(t, err)
	assert.Nil(t, cleared.DeploymentLocation, "a nil location clears the position")

	// Reassigning moves the resource to another Schadenplatz, but not to the one it is on.
	other, err := m.CreateSchadenplatz(ctx, inc.ID, "Süd", nil)
	require.NoError(t, err)

	moved, err := m.ReassignResource(ctx, res.ID, other.ID, nil)
	require.NoError(t, err)
	assert.Equal(t, other.ID, moved.SchadenplatzID)

	_, err = m.ReassignResource(ctx, res.ID, other.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	// Once relieved, a resource is read-only.
	_, err = m.RelieveResource(ctx, res.ID, nil, nil)
	require.NoError(t, err)

	readOnly := map[string]func() error{
		"rename":   func() error { _, e := m.RenameResource(ctx, res.ID, "x", nil); return e },
		"task":     func() error { _, e := m.ChangeHauptaufgabe(ctx, res.ID, "x", nil); return e },
		"count":    func() error { _, e := m.UpdatePersonnelCount(ctx, res.ID, 3, nil); return e },
		"location": func() error { _, e := m.UpdateDeploymentLocation(ctx, res.ID, nil, nil); return e },
		"reassign": func() error { _, e := m.ReassignResource(ctx, res.ID, inc.ID, nil); return e },
		"contact": func() error {
			_, e := m.UpdateContact(ctx, res.ID, model.ResourceContactInput{Medium: model.ContactMediumOther}, nil)
			return e
		},
	}
	for name, call := range readOnly {
		require.ErrorIs(t, call(), shared.ErrInvalidInput, name)
	}
}

func TestResource_RelieveWithSuccessorAndHandOver(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Succession", model.IncidentAccessModeOpenOperational)
	ctx := ctxFor("owner")
	m := s.resolver.Mutation()

	first := s.alertResource(t, inc.ID, "Gruppe A")
	second := s.alertResource(t, inc.ID, "Gruppe B")
	third := s.alertResource(t, inc.ID, "Gruppe C")

	_, err := m.MarkResourceReady(ctx, first.ID, nil)
	require.NoError(t, err)
	_, err = m.DeployResource(ctx, first.ID, nil)
	require.NoError(t, err)
	_, err = m.UpdateDeploymentLocation(ctx, first.ID, &model.DeploymentLocationInput{Label: "Brücke"}, nil)
	require.NoError(t, err)

	result, err := m.HandOver(ctx, first.ID, second.ID, nil)
	require.NoError(t, err)

	assert.Equal(t, first.ID, result.Relieved.ID)
	assert.Equal(t, model.ResourceStatusAbgeloest, result.Relieved.Status)
	require.NotNil(t, result.Relieved.SuccessorID)
	assert.Equal(t, second.ID, *result.Relieved.SuccessorID)

	assert.Equal(t, second.ID, result.Successor.ID)
	assert.Equal(t, model.ResourceStatusEingesetzt, result.Successor.Status, "the successor takes over straight away")
	require.NotNil(t, result.Successor.PredecessorID)
	assert.Equal(t, first.ID, *result.Successor.PredecessorID)
	require.NotNil(t, result.Successor.DeploymentLocation)
	assert.Equal(t, "Brücke", result.Successor.DeploymentLocation.Label, "the position is inherited")

	// Handing over from an already relieved resource is refused.
	_, err = m.HandOver(ctx, first.ID, third.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = m.HandOver(ctx, first.ID, "nope", nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = m.HandOver(ctx, "nope", third.ID, nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	// Relieving with a named successor records the link.
	relieved, err := m.RelieveResource(ctx, second.ID, &third.ID, nil)
	require.NoError(t, err)
	require.NotNil(t, relieved.SuccessorID)
	assert.Equal(t, third.ID, *relieved.SuccessorID)

	_, err = m.RelieveResource(ctx, third.ID, new("nope"), nil)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestResource_UnknownIDIsNotFound(t *testing.T) {
	s := newFullStack(t)
	ctx := ctxFor("owner")
	m := s.resolver.Mutation()
	id := uuid.NewString()

	calls := map[string]func() error{
		"ready":    func() error { _, e := m.MarkResourceReady(ctx, id, nil); return e },
		"deploy":   func() error { _, e := m.DeployResource(ctx, id, nil); return e },
		"standown": func() error { _, e := m.StandDownResource(ctx, id, nil); return e },
		"relieve":  func() error { _, e := m.RelieveResource(ctx, id, nil, nil); return e },
		"react":    func() error { _, e := m.ReactivateResource(ctx, id, nil); return e },
		"rename":   func() error { _, e := m.RenameResource(ctx, id, "x", nil); return e },
	}
	for name, call := range calls {
		require.ErrorIs(t, call(), shared.ErrNotFound, name)
	}
}

func TestResourceMutations_GuardClauses(t *testing.T) {
	s := newFullStack(t)
	m := s.resolver.Mutation()
	id := uuid.NewString()

	calls := map[string]func(ctx context.Context, id string) error{
		"ready":    func(ctx context.Context, id string) error { _, e := m.MarkResourceReady(ctx, id, nil); return e },
		"deploy":   func(ctx context.Context, id string) error { _, e := m.DeployResource(ctx, id, nil); return e },
		"react":    func(ctx context.Context, id string) error { _, e := m.ReactivateResource(ctx, id, nil); return e },
		"standown": func(ctx context.Context, id string) error { _, e := m.StandDownResource(ctx, id, nil); return e },
		"relieve":  func(ctx context.Context, id string) error { _, e := m.RelieveResource(ctx, id, nil, nil); return e },
		"reassign": func(ctx context.Context, id string) error {
			_, e := m.ReassignResource(ctx, id, uuid.NewString(), nil)
			return e
		},
		"reassign (bad schadenplatz)": func(ctx context.Context, id string) error {
			_, e := m.ReassignResource(ctx, id, "nope", nil)
			return e
		},
		"location": func(ctx context.Context, id string) error {
			_, e := m.UpdateDeploymentLocation(ctx, id, nil, nil)
			return e
		},
		"task": func(ctx context.Context, id string) error { _, e := m.ChangeHauptaufgabe(ctx, id, "x", nil); return e },
		"contact": func(ctx context.Context, id string) error {
			_, e := m.UpdateContact(ctx, id, model.ResourceContactInput{}, nil)
			return e
		},
		"count":  func(ctx context.Context, id string) error { _, e := m.UpdatePersonnelCount(ctx, id, 1, nil); return e },
		"rename": func(ctx context.Context, id string) error { _, e := m.RenameResource(ctx, id, "x", nil); return e },
		"handover": func(ctx context.Context, id string) error {
			_, e := m.HandOver(ctx, id, uuid.NewString(), nil)
			return e
		},
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			require.Error(t, call(context.Background(), id), "no actor")

			if name != "reassign (bad schadenplatz)" {
				require.ErrorIs(t, call(ctxFor("x"), "nope"), shared.ErrInvalidInput, "malformed id")
			} else {
				require.ErrorIs(t, call(ctxFor("x"), id), shared.ErrInvalidInput, "malformed schadenplatz id")
			}
		})
	}
}

func TestResourceMutations_RequireWriteAccess(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Locked", model.IncidentAccessModeRestricted)
	res := s.alertResource(t, inc.ID, "TLF 1")

	_, err := s.resolver.Mutation().GrantIncidentRole(
		ctxFor("owner"), inc.ID, model.AccessPrincipalKindUser, "viewer", model.IncidentRoleViewer,
	)
	require.NoError(t, err)
	s.catchUp(t)

	m := s.resolver.Mutation()

	for _, sub := range []string{"viewer", "stranger"} {
		ctx := ctxFor(sub)
		calls := map[string]func() error{
			"alert": func() error {
				_, e := m.AlertResource(ctx, model.AlertResourceInput{
					IncidentID: inc.ID, Formation: model.ResourceFormationFw, Name: "X",
					Size: model.ResourceUnitSizeTrupp, PersonnelCount: 1, Hauptaufgabe: "x",
				})

				return e
			},
			"ready":   func() error { _, e := m.MarkResourceReady(ctx, res.ID, nil); return e },
			"rename":  func() error { _, e := m.RenameResource(ctx, res.ID, "x", nil); return e },
			"relieve": func() error { _, e := m.RelieveResource(ctx, res.ID, nil, nil); return e },
			"handover": func() error {
				_, e := m.HandOver(ctx, res.ID, uuid.NewString(), nil)
				return e
			},
		}

		for name, call := range calls {
			require.ErrorIs(t, call(), shared.ErrForbidden, "%s as %s", name, sub)
		}
	}

	// The refused calls changed nothing.
	s.catchUp(t)

	got, err := s.resolver.Query().Resource(ctxFor("owner"), res.ID)
	require.NoError(t, err)
	assert.Equal(t, "TLF 1", got.Name)
	assert.Equal(t, model.ResourceStatusAufgeboten, got.Status)
}

func TestResourceQueries(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Queries", model.IncidentAccessModeOpenOperational)
	res := s.alertResource(t, inc.ID, "TLF 1")
	m := s.resolver.Mutation()
	ctx := ctxFor("owner")

	_, err := m.MarkResourceReady(ctx, res.ID, nil)
	require.NoError(t, err)
	_, err = m.UpdateContact(
		ctx,
		res.ID,
		model.ResourceContactInput{Medium: model.ContactMediumRadio, Detail: "K1"},
		nil,
	)
	require.NoError(t, err)
	_, err = m.UpdateDeploymentLocation(
		ctx,
		res.ID,
		&model.DeploymentLocationInput{Lat: new(1.5), Lng: new(2.5), Label: "L"},
		nil,
	)
	require.NoError(t, err)
	s.catchUp(t)

	got, err := s.resolver.Query().Resource(ctx, res.ID)
	require.NoError(t, err)
	assert.Equal(t, res.ID, got.ID)
	assert.Equal(t, inc.ID, got.IncidentID)
	assert.Equal(t, "TLF 1", got.Name)
	assert.Equal(t, model.ResourceFormationFw, got.Formation)
	assert.Equal(t, model.ResourceUnitSizeGruppe, got.Size)
	assert.Equal(t, model.ResourceStatusEinsatzbereit, got.Status)
	assert.Equal(t, &model.ResourceContact{Medium: model.ContactMediumRadio, Detail: "K1"}, got.Contact)
	assert.Equal(t, &model.DeploymentLocation{Lat: new(1.5), Lng: new(2.5), Label: "L"}, got.DeploymentLocation)

	_, err = s.resolver.Query().Resource(ctx, uuid.NewString())
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = s.resolver.Query().Resource(ctx, "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	// The Schadenplatz field resolver lists the active resources placed on it.
	sp, err := s.resolver.Query().Schadenplatz(ctx, res.SchadenplatzID)
	require.NoError(t, err)

	onSite, err := s.resolver.Schadenplatz().Resources(ctx, sp)
	require.NoError(t, err)
	require.Len(t, onSite, 1)
	assert.Equal(t, res.ID, onSite[0].ID)

	_, err = m.RelieveResource(ctx, res.ID, nil, nil)
	require.NoError(t, err)
	s.catchUp(t)

	onSite, err = s.resolver.Schadenplatz().Resources(ctx, sp)
	require.NoError(t, err)
	assert.Empty(t, onSite, "relieved resources leave the site")

	_, err = s.resolver.Schadenplatz().Resources(ctx, &model.Schadenplatz{ID: "nope"})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

// Every formation, unit size and contact medium survives the trip through the aggregate (the
// mutation response) and through the read model (the Resource query).
func TestAlertResource_EnumsRoundTrip(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Enums", model.IncidentAccessModeOpenOperational)

	formations := []model.ResourceFormation{
		model.ResourceFormationFw, model.ResourceFormationPol, model.ResourceFormationArmee,
		model.ResourceFormationZs, model.ResourceFormationTechnb, model.ResourceFormationSan,
		model.ResourceFormationOther,
	}
	sizes := []model.ResourceUnitSize{
		model.ResourceUnitSizeTrupp, model.ResourceUnitSizeGruppe, model.ResourceUnitSizeZug,
		model.ResourceUnitSizeKompanie, model.ResourceUnitSizeBataillon,
	}
	media := []model.ContactMedium{model.ContactMediumRadio, model.ContactMediumPhone, model.ContactMediumOther}

	for i, formation := range formations {
		in := model.AlertResourceInput{
			IncidentID: inc.ID, Formation: formation, Name: string(formation), Size: sizes[i%len(sizes)],
			PersonnelCount: 1, Hauptaufgabe: "x",
			Contact: &model.ResourceContactInput{Medium: media[i%len(media)], Detail: "d"},
		}

		res, err := s.resolver.Mutation().AlertResource(ctxFor("owner"), in)
		require.NoError(t, err)
		s.catchUp(t)

		read, err := s.resolver.Query().Resource(ctxFor("owner"), res.ID)
		require.NoError(t, err)

		for name, got := range map[string]*model.Resource{"mutation": res, "query": read} {
			assert.Equal(t, formation, got.Formation, name)
			assert.Equal(t, in.Size, got.Size, name)
			require.NotNil(t, got.Contact, name)
			assert.Equal(t, in.Contact.Medium, got.Contact.Medium, name)
		}
	}
}
