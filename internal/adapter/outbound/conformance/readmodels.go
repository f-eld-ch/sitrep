package conformance

import (
	"context"
	"encoding/json/v2"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// RunReadModels runs the sub-suite for the single-row and list read models that the other
// sub-suites leave out: attachments, layers and features, Schadenplätze and resources.
func RunReadModels(t *testing.T, f Factory) {
	t.Helper()

	b0 := f(t)
	if b0.Queries == nil || b0.Project == nil {
		t.Skip("backend does not provide Queries or Project func")
	}

	at := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)

	// write appends the aggregates in one transaction and projects them.
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

	t.Run("Attachments", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		msgID := shared.MessageID(uuid.New())
		otherID := shared.MessageID(uuid.New())

		record := func(id shared.MessageID) *message.Message {
			m := message.New(id)
			require.NoError(t, m.Record(incID, 1, "Brücke gesperrt", "Patrouille", "", "Führung", "",
				shared.MediumRadio, at, "sys", at, "sys"))

			return m
		}

		first, second := shared.AttachmentID(uuid.New()), shared.AttachmentID(uuid.New())

		m := record(msgID)
		require.NoError(t, m.AddAttachment(second, "later.png", "image/png", 20, "sum2", "k/later", "sub-b",
			at.Add(2*time.Minute), "sys"))
		require.NoError(t, m.AddAttachment(first, "first.png", "image/png", 10, "sum1", "k/first", "sub-a",
			at.Add(time.Minute), "sys"))
		write(t, b, m, record(otherID))

		list, err := b.Queries.ListAttachments(ctx, uuid.UUID(msgID))
		require.NoError(t, err)
		require.Len(t, list, 2)
		assert.Equal(t, uuid.UUID(first), list[0].ID, "oldest first")
		assert.Equal(t, uuid.UUID(second), list[1].ID)

		got, err := b.Queries.GetAttachment(ctx, uuid.UUID(first))
		require.NoError(t, err)
		assert.Equal(t, uuid.UUID(msgID), got.MessageID)
		assert.Equal(t, uuid.UUID(incID), got.IncidentID)
		assert.Equal(t, "first.png", got.Filename)
		assert.Equal(t, "image/png", got.ContentType)
		assert.EqualValues(t, 10, got.Size)
		assert.Equal(t, "sum1", got.Checksum)
		assert.Equal(t, "k/first", got.StorageKey)
		assert.Equal(t, "sub-a", got.UploaderSub)
		assert.True(t, got.CreatedAt.Equal(at.Add(time.Minute)), "created at the event time, got %s", got.CreatedAt)

		_, err = b.Queries.GetAttachment(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		none, err := b.Queries.ListAttachments(ctx, uuid.UUID(otherID))
		require.NoError(t, err)
		assert.Empty(t, none)

		t.Run("a removed attachment is gone", func(t *testing.T) {
			loaded := message.New(msgID)
			events, err := b.Store.Load(ctx, "Message", uuid.UUID(msgID))
			require.NoError(t, err)

			for _, e := range events {
				require.NoError(t, eventsourcing.Apply(loaded, e))
			}

			loaded.Root().ClearPending()
			require.NoError(t, loaded.RemoveAttachment(first, "sub-a", at.Add(5*time.Minute), "sys"))
			write(t, b, loaded)

			list, err := b.Queries.ListAttachments(ctx, uuid.UUID(msgID))
			require.NoError(t, err)
			require.Len(t, list, 1)
			assert.Equal(t, uuid.UUID(second), list[0].ID)

			_, err = b.Queries.GetAttachment(ctx, uuid.UUID(first))
			require.ErrorIs(t, err, shared.ErrNotFound)
		})
	})

	t.Run("LayersAndFeatures", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		otherInc := openIncident(t, b)
		keep, drop, foreign := shared.LayerID(uuid.New()), shared.LayerID(uuid.New()), shared.LayerID(uuid.New())

		newLayer := func(id shared.LayerID, inc shared.IncidentID, name string) *layer.Layer {
			l := layer.New(id)
			require.NoError(t, l.Create(inc, name, "sys", at))

			return l
		}

		dropLayer := newLayer(drop, incID, "Beta")
		require.NoError(t, dropLayer.Remove(shared.DeleteReasonManual, "sys", at))

		featureID := feature.DeriveID(incID, "draw-1")
		pt := feature.New(featureID)
		require.NoError(t, pt.Place(incID, keep, map[string]any{"type": "Point", "coordinates": []any{8.0, 47.0}},
			map[string]any{"label": "A"}, feature.ChangeContext{EffectiveAt: at.Add(time.Hour)}, "sys", at))

		write(t, b, newLayer(keep, incID, "Alpha"), dropLayer, newLayer(foreign, otherInc, "Gamma"), pt)

		layers, err := b.Queries.ListLayers(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		require.Len(t, layers, 1, "removed layers and layers of other incidents are left out")
		assert.Equal(t, uuid.UUID(keep), layers[0].ID)
		assert.Equal(t, "Alpha", layers[0].Name)
		assert.Equal(t, uuid.UUID(incID), layers[0].IncidentID)

		var collection struct {
			Type     string `json:"type"`
			Features []struct {
				ID         string         `json:"id"`
				Properties map[string]any `json:"properties"`
			} `json:"features"`
		}
		require.NoError(t, json.Unmarshal(layers[0].GeoJSON, &collection))
		assert.Equal(t, "FeatureCollection", collection.Type)
		require.Len(t, collection.Features, 1)
		assert.Equal(t, featureID.String(), collection.Features[0].ID)
		assert.Equal(t, "A", collection.Features[0].Properties["label"])

		none, err := b.Queries.ListLayers(ctx, uuid.New())
		require.NoError(t, err)
		assert.Empty(t, none)

		owner, err := b.Queries.GetFeatureIncidentID(ctx, uuid.UUID(featureID))
		require.NoError(t, err)
		assert.Equal(t, uuid.UUID(incID), owner)

		_, err = b.Queries.GetFeatureIncidentID(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		placements, err := b.Queries.ListFeaturePlacements(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		require.Len(t, placements, 1)
		require.Contains(t, placements, uuid.UUID(featureID))
		assert.True(t, placements[uuid.UUID(featureID)].Equal(at.Add(time.Hour)),
			"the placement appears when it took effect, got %s", placements[uuid.UUID(featureID)])

		elsewhere, err := b.Queries.ListFeaturePlacements(ctx, uuid.UUID(otherInc))
		require.NoError(t, err)
		assert.Empty(t, elsewhere)
	})

	t.Run("Schadenplaetze", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		defID, siteID, otherID := shared.SchadenplatzID(
			uuid.New(),
		), shared.SchadenplatzID(
			uuid.New(),
		), shared.SchadenplatzID(
			uuid.New(),
		)
		m1, m2 := shared.MessageID(uuid.New()), shared.MessageID(uuid.New())

		def := schadenplatz.New(defID)
		require.NoError(t, def.Create(incID, "Standard", true, "sys", at))

		site := schadenplatz.New(siteID)
		require.NoError(t, site.Create(incID, "Platz A", false, "sys", at))
		require.NoError(t, site.Rename("Platz Nord", "sys", at.Add(time.Minute)))
		require.NoError(
			t,
			site.SetGeometry([]byte(`{"type":"Point","coordinates":[8,47]}`), "sys", at.Add(time.Minute)),
		)
		require.NoError(
			t,
			site.RecordCasualties(m1, schadenplatz.CasualtyDeltas{Vermisste: 1, Tote: 2, Verletzte: 3}, "sys", at),
		)
		require.NoError(
			t,
			site.RecordCasualties(
				m2,
				schadenplatz.CasualtyDeltas{Tote: 1, Obdachlose: 4, Eingeschlossene: 5},
				"sys",
				at,
			),
		)

		other := schadenplatz.New(otherID)
		require.NoError(t, other.Create(shared.IncidentID(uuid.New()), "Fremd", true, "sys", at))

		write(t, b, def, site, other)

		got, err := b.Queries.GetSchadenplatz(ctx, uuid.UUID(siteID))
		require.NoError(t, err)
		assert.Equal(t, "Platz Nord", got.Name)
		assert.Equal(t, uuid.UUID(incID), got.IncidentID)
		assert.False(t, got.IsDefault)
		assert.False(t, got.IsMerged)
		assert.JSONEq(t, `{"type":"Point","coordinates":[8,47]}`, string(got.GeoJSON))
		assert.Equal(t, [5]int{1, 3, 3, 4, 5}, [5]int{
			got.Casualties.Vermisste, got.Casualties.Tote, got.Casualties.Verletzte,
			got.Casualties.Obdachlose, got.Casualties.Eingeschlossene,
		}, "the totals add up the messages")

		_, err = b.Queries.GetSchadenplatz(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		spIDs := func(rows []*outbound.SchadenplatzRM) []uuid.UUID {
			out := make([]uuid.UUID, len(rows))
			for i, r := range rows {
				out[i] = r.ID
			}

			return out
		}

		live, err := b.Queries.ListSchadenplaetze(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.ElementsMatch(t, []uuid.UUID{uuid.UUID(defID), uuid.UUID(siteID)}, spIDs(live))

		casualties, err := b.Queries.ListMessageCasualties(ctx, uuid.UUID(m1))
		require.NoError(t, err)
		require.Len(t, casualties, 1)
		assert.Equal(t, uuid.UUID(siteID), casualties[0].SchadenplatzID)
		assert.Equal(t, uuid.UUID(m1), casualties[0].MessageID)
		assert.Equal(t, [5]int{1, 2, 3, 0, 0}, [5]int{
			casualties[0].Vermisste, casualties[0].Tote, casualties[0].Verletzte,
			casualties[0].Obdachlose, casualties[0].Eingeschlossene,
		})

		noCasualties, err := b.Queries.ListMessageCasualties(ctx, uuid.New())
		require.NoError(t, err)
		assert.Empty(t, noCasualties)

		t.Run("a merged place is hidden from the live list only", func(t *testing.T) {
			loaded := schadenplatz.New(siteID)
			events, err := b.Store.Load(ctx, "Schadenplatz", uuid.UUID(siteID))
			require.NoError(t, err)

			for _, e := range events {
				require.NoError(t, eventsourcing.Apply(loaded, e))
			}

			loaded.Root().ClearPending()
			require.NoError(t, loaded.MergeIntoDefault(defID, "sys", at.Add(time.Hour)))
			write(t, b, loaded)

			live, err := b.Queries.ListSchadenplaetze(ctx, uuid.UUID(incID))
			require.NoError(t, err)
			assert.Equal(t, []uuid.UUID{uuid.UUID(defID)}, spIDs(live))

			all, err := b.Queries.ListAllSchadenplaetze(ctx, uuid.UUID(incID))
			require.NoError(t, err)
			assert.ElementsMatch(t, []uuid.UUID{uuid.UUID(defID), uuid.UUID(siteID)}, spIDs(all))

			merged, err := b.Queries.GetSchadenplatz(ctx, uuid.UUID(siteID))
			require.NoError(t, err)
			assert.True(t, merged.IsMerged)
			require.NotNil(t, merged.MergedInto)
			assert.Equal(t, uuid.UUID(defID), *merged.MergedInto)
		})
	})

	t.Run("Resources", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		incID := openIncident(t, b)
		siteA, siteB := shared.SchadenplatzID(uuid.New()), shared.SchadenplatzID(uuid.New())
		resA, resB, resC := shared.ResourceID(uuid.New()), shared.ResourceID(uuid.New()), shared.ResourceID(uuid.New())
		msg := shared.MessageID(uuid.New())

		alerted := resource.New(resA)
		require.NoError(t, alerted.Alert(incID, siteA, resource.FormationFW, "Zug 1", resource.UnitSizeZug, 12,
			"Löschen", &resource.Contact{Medium: resource.ContactMediumRadio, Detail: "Kanal 4"},
			&resource.Location{Name: "Depot", Coordinates: &[2]float64{46.9, 7.4}}, &msg, "sys", at))
		require.NoError(t, alerted.MarkReady("sys", at.Add(time.Minute)))
		require.NoError(t, alerted.Deploy("sys", at.Add(2*time.Minute)))

		second := resource.New(resB)
		require.NoError(t, second.Alert(incID, siteA, resource.FormationPOL, "Gruppe 2", resource.UnitSizeGruppe, 6,
			"", nil, nil, nil, "sys", at))

		relieved := resource.New(resC)
		require.NoError(t, relieved.Alert(incID, siteA, resource.FormationSAN, "Trupp 3", resource.UnitSizeTrupp, 2,
			"", nil, nil, nil, "sys", at))
		require.NoError(t, relieved.Relieve(nil, "sys", at.Add(time.Minute)))

		elsewhere := resource.New(shared.ResourceID(uuid.New()))
		require.NoError(t, elsewhere.Alert(incID, siteB, resource.FormationZS, "Zug 9", resource.UnitSizeZug, 9,
			"", nil, nil, nil, "sys", at))

		write(t, b, alerted, second, relieved, elsewhere)

		got, err := b.Queries.GetResource(ctx, uuid.UUID(resA))
		require.NoError(t, err)
		assert.Equal(t, "Zug 1", got.Name)
		assert.Equal(t, "FW", got.Formation)
		assert.Equal(t, "ZUG", got.Size)
		assert.Equal(t, 12, got.PersonnelCount)
		assert.Equal(t, "Löschen", got.Hauptaufgabe)
		assert.Equal(t, "EINGESETZT", got.Status)
		assert.Equal(t, uuid.UUID(incID), got.IncidentID)
		assert.Equal(t, uuid.UUID(siteA), got.SchadenplatzID)
		require.NotNil(t, got.ContactMedium)
		assert.Equal(t, "RADIO", *got.ContactMedium)
		assert.Equal(t, "Kanal 4", *got.ContactDetail)
		require.NotNil(t, got.HomeLocationName)
		assert.Equal(t, "Depot", *got.HomeLocationName)
		require.NotNil(t, got.HomeLocationLat)
		assert.InDelta(t, 46.9, *got.HomeLocationLat, 1e-9)
		assert.InDelta(t, 7.4, *got.HomeLocationLng, 1e-9)
		require.NotNil(t, got.SourceMessageID)
		assert.Equal(t, uuid.UUID(msg), *got.SourceMessageID)
		assert.True(t, got.AlertedAt.Equal(at))
		require.NotNil(t, got.ReadyAt)
		assert.True(t, got.ReadyAt.Equal(at.Add(time.Minute)))
		require.NotNil(t, got.DeployedAt)
		assert.True(t, got.DeployedAt.Equal(at.Add(2*time.Minute)))
		require.Len(t, got.DeploymentHistory, 1)
		assert.True(t, got.DeploymentHistory[0].StartedAt.Equal(at.Add(2*time.Minute)))
		assert.Nil(t, got.DeploymentHistory[0].EndedAt)

		_, err = b.Queries.GetResource(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)

		onSite, err := b.Queries.ListResourcesForSchadenplatz(ctx, uuid.UUID(siteA))
		require.NoError(t, err)

		names := make([]string, len(onSite))
		for i, r := range onSite {
			names[i] = r.Name
		}

		assert.ElementsMatch(t, []string{"Zug 1", "Gruppe 2"}, names, "relieved resources are left out")

		other, err := b.Queries.ListResourcesForSchadenplatz(ctx, uuid.New())
		require.NoError(t, err)
		assert.Empty(t, other)

		forIncident, err := b.Queries.ListResourcesForIncident(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Len(t, forIncident, 4, "the incident list keeps the relieved resource")
	})
}
