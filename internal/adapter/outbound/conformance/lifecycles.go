package conformance

import (
	"context"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// RunLifecycles runs scenarios that take one aggregate through many of its commands and check
// the read model after every step. The other sub-suites check single events and listings; these
// catch a projection that handles each event alone but gets a sequence wrong.
func RunLifecycles(t *testing.T, f Factory) {
	t.Helper()

	b0 := f(t)
	if b0.Queries == nil || b0.Project == nil {
		t.Skip("backend does not provide Queries or Project func")
	}

	at := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)

	write := func(t *testing.T, b *Backend, aggregates ...eventsourcing.Aggregate) {
		t.Helper()

		require.NoError(t, b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			for _, a := range aggregates {
				if _, err := b.Store.Append(ctx, a); err != nil {
					return err
				}
			}

			return nil
		}))
		require.NoError(t, b.Project(t.Context()))
	}

	openIncident := func(t *testing.T, b *Backend) shared.IncidentID {
		t.Helper()

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("Ereignis", nil, nil, at, "sys"))
		write(t, b, inc)

		return id
	}

	t.Run("Resource", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		siteA, siteB := shared.SchadenplatzID(uuid.New()), shared.SchadenplatzID(uuid.New())
		id, successorID := shared.ResourceID(uuid.New()), shared.ResourceID(uuid.New())

		get := func(t *testing.T, id shared.ResourceID) *outbound.ResourceRM {
			t.Helper()

			rm, err := b.Queries.GetResource(ctx, uuid.UUID(id))
			require.NoError(t, err)

			return rm
		}

		r := resource.New(id)
		require.NoError(t, r.Alert(incID, siteA, resource.FormationFW, "Zug 1", resource.UnitSizeZug, 12,
			"Löschen", nil, nil, nil, "sys", at))
		write(t, b, r)
		assert.Equal(t, "AUFGEBOTEN", get(t, id).Status)

		// Ready, deployed, stood down and deployed again: two deployment periods, the first ended.
		require.NoError(t, r.MarkReady("sys", at.Add(1*time.Minute)))
		require.NoError(t, r.Deploy("sys", at.Add(2*time.Minute)))
		require.NoError(t, r.StandDown("sys", at.Add(10*time.Minute)))
		write(t, b, r)

		got := get(t, id)
		assert.Equal(t, "EINSATZBEREIT", got.Status, "standing down returns the resource to ready")
		require.NotNil(t, got.StoodDownAt)
		assert.True(t, got.StoodDownAt.Equal(at.Add(10*time.Minute)))
		require.Len(t, got.DeploymentHistory, 1)
		require.NotNil(t, got.DeploymentHistory[0].EndedAt, "the stood-down period is closed")
		assert.True(t, got.DeploymentHistory[0].EndedAt.Equal(at.Add(10*time.Minute)))

		require.NoError(t, r.Deploy("sys", at.Add(20*time.Minute)))
		write(t, b, r)

		got = get(t, id)
		assert.Equal(t, "EINGESETZT", got.Status)
		require.Len(t, got.DeploymentHistory, 2, "a second deployment starts a second period")
		assert.Nil(t, got.DeploymentHistory[1].EndedAt)

		// Details can change while the resource is active.
		lat, lng := 46.95, 7.45
		require.NoError(
			t,
			r.UpdateDeploymentLocation(
				&resource.DeploymentLocation{Lat: &lat, Lng: &lng, Label: "Brücke"},
				"sys",
				at.Add(21*time.Minute),
			),
		)
		require.NoError(t, r.ChangeHauptaufgabe("Rettung", "sys", at.Add(22*time.Minute)))
		require.NoError(
			t,
			r.UpdateContact(
				resource.Contact{Medium: resource.ContactMediumRadio, Detail: "Kanal 7"},
				"sys",
				at.Add(23*time.Minute),
			),
		)
		require.NoError(t, r.UpdatePersonnelCount(15, "sys", at.Add(24*time.Minute)))
		require.NoError(t, r.Rename("Zug 1a", "sys", at.Add(25*time.Minute)))
		write(t, b, r)

		got = get(t, id)
		require.NotNil(t, got.DeploymentLocation)
		assert.Equal(t, "Brücke", got.DeploymentLocation.Label)
		require.NotNil(t, got.DeploymentLocation.Lat)
		assert.InDelta(t, lat, *got.DeploymentLocation.Lat, 1e-9)
		assert.InDelta(t, lng, *got.DeploymentLocation.Lng, 1e-9)
		assert.Equal(t, "Rettung", got.Hauptaufgabe)
		require.NotNil(t, got.ContactMedium)
		assert.Equal(t, "RADIO", *got.ContactMedium)
		assert.Equal(t, "Kanal 7", *got.ContactDetail)
		assert.Equal(t, 15, got.PersonnelCount)
		assert.Equal(t, "Zug 1a", got.Name)

		// Moving to another site keeps the history; the resource is listed on the new site.
		require.NoError(t, r.Reassign(siteB, "sys", at.Add(30*time.Minute)))
		write(t, b, r)
		assert.Equal(t, uuid.UUID(siteB), get(t, id).SchadenplatzID)

		onA, err := b.Queries.ListResourcesForSchadenplatz(ctx, uuid.UUID(siteA))
		require.NoError(t, err)
		assert.Empty(t, onA)

		onB, err := b.Queries.ListResourcesForSchadenplatz(ctx, uuid.UUID(siteB))
		require.NoError(t, err)
		require.Len(t, onB, 1)

		// A successor takes over: both ends of the succession are linked and the first is relieved.
		successor := resource.New(successorID)
		require.NoError(t, successor.Alert(incID, siteB, resource.FormationFW, "Zug 2", resource.UnitSizeZug, 10,
			"", nil, nil, nil, "sys", at.Add(40*time.Minute)))
		require.NoError(t, successor.LinkSuccession(id, "sys", at.Add(41*time.Minute)))
		require.NoError(t, r.Relieve(&successorID, "sys", at.Add(42*time.Minute)))
		write(t, b, r, successor)

		got = get(t, id)
		assert.Equal(t, "ABGELOEST", got.Status)
		require.NotNil(t, got.RelievedAt)
		assert.True(t, got.RelievedAt.Equal(at.Add(42*time.Minute)))
		require.NotNil(t, got.SuccessorID)
		assert.Equal(t, uuid.UUID(successorID), *got.SuccessorID)

		next := get(t, successorID)
		require.NotNil(t, next.PredecessorID)
		assert.Equal(t, uuid.UUID(id), *next.PredecessorID)

		onB, err = b.Queries.ListResourcesForSchadenplatz(ctx, uuid.UUID(siteB))
		require.NoError(t, err)
		require.Len(t, onB, 1, "the relieved resource drops out of the site list, its successor stays")
		assert.Equal(t, uuid.UUID(successorID), onB[0].ID)

		// A relieved resource can be called up again on a site.
		require.NoError(t, r.Reactivate(siteA, "sys", at.Add(60*time.Minute)))
		write(t, b, r)

		got = get(t, id)
		assert.Equal(t, "AUFGEBOTEN", got.Status)
		assert.Equal(t, uuid.UUID(siteA), got.SchadenplatzID)
		assert.Nil(t, got.RelievedAt, "a reactivated resource is no longer relieved")

		onA, err = b.Queries.ListResourcesForSchadenplatz(ctx, uuid.UUID(siteA))
		require.NoError(t, err)
		assert.Len(t, onA, 1)
	})

	runIncidentLifecycle(t, f, at, write, openIncident)
	runLayerAndMessageLifecycle(t, f, at, write, openIncident)
}

type (
	writeFunc        func(t *testing.T, b *Backend, aggregates ...eventsourcing.Aggregate)
	openIncidentFunc func(t *testing.T, b *Backend) shared.IncidentID
)

func runIncidentLifecycle(t *testing.T, f Factory, at time.Time, write writeFunc, openIncident openIncidentFunc) {
	t.Helper()

	t.Run("Incident", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		id := shared.IncidentID(uuid.New())
		inc := incident.New(id)
		require.NoError(t, inc.Open("Hochwasser", nil, nil, at, "sys"))
		write(t, b, inc)

		get := func(t *testing.T) *outbound.IncidentRM {
			t.Helper()

			rm, err := b.Queries.GetIncident(ctx, uuid.UUID(id))
			require.NoError(t, err)

			return rm
		}

		got := get(t)
		assert.Equal(t, "Hochwasser", got.Name)
		assert.NotEmpty(t, got.Divisions, "a new incident starts with its default divisions")

		// Make sure there are several divisions to change below, whatever the default set is.
		seed := make([]incident.DivisionData, 0, len(got.Divisions)+2)
		// System divisions (such as the message map) are managed by the aggregate and cannot be passed in.
		for _, d := range got.Divisions {
			if d.Kind == "" {
				seed = append(
					seed,
					incident.DivisionData{ID: shared.DivisionID(d.ID), Name: d.Name, Description: d.Description},
				)
			}
		}

		seed = append(seed,
			incident.DivisionData{ID: shared.DivisionID(uuid.New()), Name: "Eins", Description: "e"},
			incident.DivisionData{ID: shared.DivisionID(uuid.New()), Name: "Zwei", Description: "z"})
		require.NoError(t, inc.UpdateDivisions(seed, "sys", at.Add(30*time.Second)))
		write(t, b, inc)

		// Renaming and moving.
		require.NoError(t, inc.Rename("Hochwasser Aare", "sys", at.Add(time.Minute)))
		require.NoError(
			t,
			inc.ChangeLocation(
				&incident.LocationData{Name: "Thun", Coordinates: &[2]float64{7.63, 46.75}},
				"sys",
				at.Add(2*time.Minute),
			),
		)
		write(t, b, inc)

		got = get(t)
		assert.Equal(t, "Hochwasser Aare", got.Name)
		require.NotNil(t, got.Location)
		assert.Equal(t, "Thun", got.Location.Name)
		require.NotNil(t, got.Location.Coordinates)
		assert.InDelta(t, 7.63, got.Location.Coordinates[0], 1e-9)
		assert.InDelta(t, 46.75, got.Location.Coordinates[1], 1e-9)
		assert.True(t, got.UpdatedAt.Equal(at.Add(2*time.Minute)), "the last change sets updated-at")

		// Divisions: one is added, one renamed, one removed.
		active := func(rm *outbound.IncidentRM) map[string]string {
			out := map[string]string{}

			for _, d := range rm.Divisions {
				if d.RemovedAt == nil {
					out[d.ID.String()] = d.Name
				}
			}

			return out
		}

		before := active(got)
		require.GreaterOrEqual(t, len(before), 2)

		var standard []*outbound.DivisionRM

		for _, d := range got.Divisions {
			if d.Kind == "" && d.RemovedAt == nil {
				standard = append(standard, d)
			}
		}

		require.GreaterOrEqual(t, len(standard), 2)

		renamed, dropped := standard[0], standard[1]
		desired := make([]incident.DivisionData, 0, len(standard))

		for _, d := range standard {
			switch d.ID {
			case renamed.ID:
				desired = append(
					desired,
					incident.DivisionData{ID: shared.DivisionID(d.ID), Name: "Umbenannt", Description: d.Description},
				)
			case dropped.ID:
				// left out: removed
			default:
				desired = append(
					desired,
					incident.DivisionData{ID: shared.DivisionID(d.ID), Name: d.Name, Description: d.Description},
				)
			}
		}

		added := shared.DivisionID(uuid.New())
		desired = append(desired, incident.DivisionData{ID: added, Name: "Neu", Description: "neu"})

		require.NoError(t, inc.UpdateDivisions(desired, "sys", at.Add(3*time.Minute)))
		write(t, b, inc)

		after := active(get(t))
		assert.Equal(t, "Umbenannt", after[renamed.ID.String()])
		assert.NotContains(t, after, dropped.ID.String(), "a dropped division is no longer active")
		assert.Equal(t, "Neu", after[added.String()])

		// Parent link and unlink.
		parent := openIncident(t, b)
		require.NoError(t, inc.LinkParent(parent, "sys", at.Add(4*time.Minute)))
		write(t, b, inc)

		require.NotNil(t, get(t).ParentID)
		assert.Equal(t, uuid.UUID(parent), *get(t).ParentID)

		children, err := b.Queries.ListChildIncidents(ctx, uuid.UUID(parent))
		require.NoError(t, err)
		require.Len(t, children, 1)
		assert.Equal(t, uuid.UUID(id), children[0].ID)

		require.NoError(t, inc.UnlinkParent("sys", at.Add(5*time.Minute)))
		write(t, b, inc)
		assert.Nil(t, get(t).ParentID)

		children, err = b.Queries.ListChildIncidents(ctx, uuid.UUID(parent))
		require.NoError(t, err)
		assert.Empty(t, children)

		// Closing, keeping a review headline, reopening (which drops it) and closing again.
		require.NoError(t, inc.Close(shared.ReasonManual, "sys", at.Add(10*time.Minute)))
		write(t, b, inc)

		got = get(t)
		assert.True(t, got.IsClosed)
		require.NotNil(t, got.ClosedAt)
		assert.True(t, got.ClosedAt.Equal(at.Add(10*time.Minute)))
		assert.False(t, got.HasReview)

		due, err := b.Queries.ListClosedIncidentsForReview(ctx, 1)
		require.NoError(t, err)
		assert.Contains(t, due, uuid.UUID(id), "a closed incident without a headline is due for one")

		require.NoError(t, inc.RecordReviewSummary(kpi.Summary{Version: 1, Messages: 3}, "sys", at.Add(11*time.Minute)))
		write(t, b, inc)
		assert.True(t, get(t).HasReview)

		summaries, err := b.Queries.ListReviewSummaries(ctx)
		require.NoError(t, err)
		require.Len(t, summaries, 1)
		assert.Equal(t, uuid.UUID(id), summaries[0].IncidentID)
		assert.Equal(t, 3, summaries[0].Summary.Messages)

		due, err = b.Queries.ListClosedIncidentsForReview(ctx, 1)
		require.NoError(t, err)
		assert.NotContains(t, due, uuid.UUID(id), "an up-to-date headline is not due again")

		due, err = b.Queries.ListClosedIncidentsForReview(ctx, 2)
		require.NoError(t, err)
		assert.Contains(t, due, uuid.UUID(id), "a headline of an older version is due again")

		require.NoError(t, inc.Reopen("sys", at.Add(12*time.Minute)))
		write(t, b, inc)

		got = get(t)
		assert.False(t, got.IsClosed)
		assert.Nil(t, got.ClosedAt)
		assert.False(t, got.HasReview, "reopening drops the headline")

		summaries, err = b.Queries.ListReviewSummaries(ctx)
		require.NoError(t, err)
		assert.Empty(t, summaries)

		// Deleting hides it everywhere.
		require.NoError(t, inc.Close(shared.ReasonManual, "sys", at.Add(20*time.Minute)))
		require.NoError(t, inc.Delete(shared.DeleteReasonManual, "sys", at.Add(21*time.Minute)))
		write(t, b, inc)

		_, err = b.Queries.GetIncident(ctx, uuid.UUID(id))
		require.ErrorIs(t, err, shared.ErrNotFound)

		listed, err := b.Queries.ListIncidents(ctx)
		require.NoError(t, err)

		for _, i := range listed {
			assert.NotEqual(t, uuid.UUID(id), i.ID, "a deleted incident is not listed")
		}
	})
}

func runLayerAndMessageLifecycle(
	t *testing.T,
	f Factory,
	at time.Time,
	write writeFunc,
	openIncident openIncidentFunc,
) {
	t.Helper()

	t.Run("Messages", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		msgID := shared.MessageID(uuid.New())
		divisionID := shared.DivisionID(uuid.New())

		m := message.New(msgID)
		require.NoError(t, m.Record(incID, 1, "Brücke gesperrt", "Pol", "Wm Müller", "SC", "Stab", shared.MediumRadio,
			at, "author-sub", at.Add(time.Minute), "sys"))
		write(t, b, m)

		get := func(t *testing.T) *outbound.MessageRM {
			t.Helper()

			rm, err := b.Queries.GetMessage(ctx, uuid.UUID(msgID))
			require.NoError(t, err)

			return rm
		}

		got := get(t)
		assert.Equal(t, 1, got.Number)
		assert.Equal(t, "Brücke gesperrt", got.Content)
		assert.Equal(t, "RADIO", got.Medium)
		assert.Equal(t, "PENDING", got.Triage)
		assert.Equal(t, "author-sub", got.AuthorSub)

		// Correcting changes only what was passed.
		content, medium := "Brücke gesperrt, Umleitung", shared.MediumPhone
		require.NoError(
			t,
			m.Correct(&content, nil, nil, nil, nil, &medium, nil, "editor-sub", at.Add(2*time.Minute), "sys"),
		)
		write(t, b, m)

		got = get(t)
		assert.Equal(t, content, got.Content)
		assert.Equal(t, "PHONE", got.Medium)
		assert.Equal(t, "Pol", got.Sender, "a field that was not corrected stays")

		// Triage: done and high priority for a division.
		require.NoError(t, m.Triage(shared.TriageDone, shared.PriorityHigh, []shared.DivisionID{divisionID}, nil,
			"triage-sub", at.Add(3*time.Minute), "sys"))
		write(t, b, m)

		got = get(t)
		assert.Equal(t, "DONE", got.Triage)
		assert.Equal(t, "HIGH", got.Priority)
		assert.Equal(t, []uuid.UUID{uuid.UUID(divisionID)}, got.DivisionIDs)

		// Sent back for more information: the priority is reset.
		require.NoError(
			t,
			m.Triage(shared.TriageMoreInfo, shared.PriorityHigh, nil, nil, "triage-sub", at.Add(4*time.Minute), "sys"),
		)
		write(t, b, m)

		got = get(t)
		assert.Equal(t, "MOREINFO", got.Triage)
		assert.Equal(t, "NORMAL", got.Priority)
		assert.Empty(t, got.DivisionIDs)

		ids, err := b.Queries.ListIncidentMessageIDs(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{uuid.UUID(msgID)}, ids)

		// Deleting removes it from every listing.
		require.NoError(t, m.Delete(shared.DeleteReasonManual, "sys", at.Add(5*time.Minute)))
		write(t, b, m)

		_, err = b.Queries.GetMessage(ctx, uuid.UUID(msgID))
		require.ErrorIs(t, err, shared.ErrNotFound)

		listed, err := b.Queries.ListMessages(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Empty(t, listed)

		ids, err = b.Queries.ListIncidentMessageIDs(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Empty(t, ids)
	})

	t.Run("LayerAndFeatureHistory", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		layerID := shared.LayerID(uuid.New())
		msgID := shared.MessageID(uuid.New())

		m := message.New(msgID)
		require.NoError(t, m.Record(incID, 1, "Sperre eingezeichnet", "Pol", "Kdt", "SC", "Stab", shared.MediumRadio,
			at, "a", at, "sys"))

		l := layer.New(layerID)
		require.NoError(t, l.Create(incID, "Lage", "sys", at))

		// A second layer takes a system kind; such a layer cannot be removed, so it stays to the end.
		mapLayerID := shared.LayerID(uuid.New())
		mapLayer := layer.New(mapLayerID)
		require.NoError(t, mapLayer.Create(incID, "Nachrichtenkarte", "sys", at))
		require.NoError(t, mapLayer.AssignKind(shared.LayerKindMessageMap, "sys", at.Add(time.Minute)))
		write(t, b, m, l, mapLayer)

		layerByID := func(t *testing.T, id shared.LayerID) *outbound.LayerRM {
			t.Helper()

			layers, err := b.Queries.ListLayers(ctx, uuid.UUID(incID))
			require.NoError(t, err)

			for _, l := range layers {
				if l.ID == uuid.UUID(id) {
					return l
				}
			}

			return nil
		}

		require.NoError(t, l.Rename("Lage neu", "sys", at.Add(time.Minute)))
		write(t, b, l)
		renamed := layerByID(t, layerID)
		require.NotNil(t, renamed)
		assert.Equal(t, "Lage neu", renamed.Name)

		mapRM := layerByID(t, mapLayerID)
		require.NotNil(t, mapRM)
		assert.Equal(t, "Nachrichtenkarte", mapRM.Name)

		featuresOn := func(t *testing.T, id shared.LayerID) int {
			t.Helper()

			rm := layerByID(t, id)
			require.NotNil(t, rm)

			var fc struct {
				Features []jsontext.Value `json:"features"`
			}
			require.NoError(t, json.Unmarshal(rm.GeoJSON, &fc))

			return len(fc.Features)
		}

		featureID := feature.DeriveID(incID, "sperre")
		ft := feature.New(featureID)
		line := func(lon float64) map[string]any {
			return map[string]any{"type": "Point", "coordinates": []any{lon, 47.0}}
		}

		change := func(minutes int) feature.ChangeContext {
			return feature.ChangeContext{EffectiveAt: at.Add(time.Duration(minutes) * time.Minute), MessageID: &msgID}
		}

		require.NoError(
			t,
			ft.Place(
				incID,
				layerID,
				line(8.0),
				map[string]any{"label": "Sperre"},
				change(10),
				"sys",
				at.Add(10*time.Minute),
			),
		)
		require.NoError(t, ft.Move(line(8.5), change(20), "sys", at.Add(20*time.Minute)))
		require.NoError(t, ft.Restyle(map[string]any{"label": "Sperre rot"}, change(30), "sys", at.Add(30*time.Minute)))
		write(t, b, ft)

		changes, err := b.Queries.ListFeatureChanges(ctx, uuid.UUID(incID))
		require.NoError(t, err)

		kinds := make([]string, len(changes))
		for i, c := range changes {
			kinds[i] = c.Change
		}

		assert.Equal(t, []string{"placed", "moved", "restyled"}, kinds)

		times, err := b.Queries.ListFeatureChangeTimes(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Len(t, times, 3)

		linked, err := b.Queries.ListFeatureMessages(ctx, uuid.UUID(featureID))
		require.NoError(t, err)
		require.Len(t, linked, 1, "the message behind the changes is linked once")
		assert.Equal(t, uuid.UUID(msgID), linked[0].ID)

		// Removed and brought back.
		require.NoError(t, ft.Remove(shared.DeleteReasonManual, change(40), "sys", at.Add(40*time.Minute)))
		write(t, b, ft)

		assert.Zero(t, featuresOn(t, layerID), "a removed feature is not on the layer")

		require.NoError(t, ft.Restore(change(50), "sys", at.Add(50*time.Minute)))
		write(t, b, ft)

		assert.Equal(t, 1, featuresOn(t, layerID), "a restored feature is on the layer again")

		// Removing the layer hides it.
		require.NoError(t, l.Remove(shared.DeleteReasonManual, "sys", at.Add(60*time.Minute)))
		write(t, b, l)

		assert.Nil(t, layerByID(t, layerID), "a removed layer is not listed")
		assert.NotNil(t, layerByID(t, mapLayerID), "the system layer stays")
	})
}
