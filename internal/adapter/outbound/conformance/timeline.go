package conformance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// RunTimeline runs the "as of a past time" sub-suite: resources and casualties replayed from
// events, which the read models (current state only) cannot answer.
func RunTimeline(t *testing.T, f Factory) {
	t.Helper()

	if f(t).Project == nil {
		t.Skip("backend does not provide Project func")
	}

	day := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	at := func(hour, minute int) time.Time {
		return day.Add(time.Duration(hour)*time.Hour + time.Duration(minute)*time.Minute)
	}

	t.Run("ResourcesAndCasualtiesAsOf", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		actor := "sys"

		incID := shared.IncidentID(uuid.New())
		inc := incident.New(incID)
		require.NoError(t, inc.Open("Lage", nil, nil, at(9, 0), actor))

		defaultSP := schadenplatz.New(shared.SchadenplatzID(uuid.New()))
		// The default Schadenplatz record is made late, after casualties with earlier message times.
		require.NoError(t, defaultSP.Create(incID, "Allgemein", true, actor, at(13, 30)))

		nord := schadenplatz.New(shared.SchadenplatzID(uuid.New()))
		require.NoError(t, nord.Create(incID, "Nord", false, actor, at(10, 0)))

		msgA, msgB, msgC := shared.MessageID(uuid.New()), shared.MessageID(uuid.New()), shared.MessageID(uuid.New())
		require.NoError(t, nord.RecordCasualties(msgA, schadenplatz.CasualtyDeltas{Verletzte: 3}, actor, at(10, 30)))
		require.NoError(
			t,
			defaultSP.RecordCasualties(msgC, schadenplatz.CasualtyDeltas{Verletzte: 1}, actor, at(10, 45)),
		)
		require.NoError(t, nord.RecordCasualties(msgB, schadenplatz.CasualtyDeltas{Tote: 1}, actor, at(11, 30)))

		// Nord is merged into the default one at 12:30; the totals move at that one instant.
		require.NoError(t, defaultSP.RecordCasualties(
			shared.MessageID(nord.ID()),
			schadenplatz.CasualtyDeltas(nord.Casualties()), actor, at(12, 30)))
		require.NoError(t, nord.MergeIntoDefault(defaultSP.ID(), actor, at(12, 30)))

		r1 := resource.New(shared.ResourceID(uuid.New()))
		require.NoError(t, r1.Alert(incID, defaultSP.ID(), resource.FormationFW, "TLF 1", resource.UnitSizeTrupp,
			10, "Löschen", nil, nil, nil, actor, at(10, 0)))
		require.NoError(t, r1.MarkReady(actor, at(10, 30)))
		require.NoError(t, r1.Deploy(actor, at(11, 0)))
		require.NoError(t, r1.UpdatePersonnelCount(14, actor, at(12, 0)))
		require.NoError(t, r1.Relieve(nil, actor, at(13, 0)))

		r2 := resource.New(shared.ResourceID(uuid.New()))
		require.NoError(t, r2.Alert(incID, defaultSP.ID(), resource.FormationPOL, "Streife", resource.UnitSizeTrupp,
			2, "Absperren", nil, nil, nil, actor, at(12, 0)))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			if _, err := b.Store.Append(ctx, inc); err != nil {
				return err
			}

			if _, err := b.Store.Append(ctx, defaultSP); err != nil {
				return err
			}

			if _, err := b.Store.Append(ctx, nord); err != nil {
				return err
			}

			if _, err := b.Store.Append(ctx, r1); err != nil {
				return err
			}

			_, err := b.Store.Append(ctx, r2)

			return err
		}))
		require.NoError(t, b.Project(ctx))

		svc := service.NewTimelineService(b.Store, b.Queries)

		resourcesAt := func(when time.Time) map[string]inbound.ResourceState {
			t.Helper()

			states, err := svc.ResourcesAsOf(ctx, incID, when)
			require.NoError(t, err)

			out := map[string]inbound.ResourceState{}
			for _, s := range states {
				out[s.Name] = s
			}

			return out
		}

		// casualties sums the Schadenplätze that count at that time, the way the dashboard does.
		casualtiesAt := func(when time.Time) schadenplatz.CasualtyTotals {
			t.Helper()

			states, err := svc.SchadenplaetzeAsOf(ctx, incID, when)
			require.NoError(t, err)

			var total schadenplatz.CasualtyTotals

			for _, s := range states {
				if s.IsMerged {
					continue
				}

				total.Verletzte += s.Casualties.Verletzte
				total.Tote += s.Casualties.Tote
			}

			return total
		}

		t.Run("before anything happened", func(t *testing.T) {
			assert.Empty(t, resourcesAt(at(9, 30)))

			states, err := svc.SchadenplaetzeAsOf(ctx, incID, at(9, 30))
			require.NoError(t, err)
			assert.Empty(t, states)
		})

		t.Run("alerted but not yet ready", func(t *testing.T) {
			got := resourcesAt(at(10, 15))
			require.Len(t, got, 1)
			assert.Equal(t, resource.StatusAufgeboten, got["TLF 1"].Status)
			assert.Equal(t, 10, got["TLF 1"].PersonnelCount)
		})

		t.Run("deployed", func(t *testing.T) {
			got := resourcesAt(at(11, 15))
			assert.Equal(t, resource.StatusEingesetzt, got["TLF 1"].Status)
			assert.Equal(t, schadenplatz.CasualtyTotals{Verletzte: 4}, casualtiesAt(at(11, 15)), "Nord 3 + Allgemein 1")

			states, err := svc.SchadenplaetzeAsOf(ctx, incID, at(11, 15))
			require.NoError(t, err)

			names := make([]string, len(states))
			for i, s := range states {
				names[i] = s.Name
			}

			assert.Equal(
				t,
				[]string{"Allgemein", "Nord"},
				names,
				"a late-created record keeps its identity in the past",
			)
		})

		t.Run("later personnel change and a second resource only show afterwards", func(t *testing.T) {
			assert.Equal(t, 10, resourcesAt(at(11, 45))["TLF 1"].PersonnelCount)

			got := resourcesAt(at(12, 15))
			assert.Equal(t, 14, got["TLF 1"].PersonnelCount)
			assert.Equal(t, resource.StatusAufgeboten, got["Streife"].Status)
			assert.Equal(t, schadenplatz.CasualtyTotals{Verletzte: 4, Tote: 1}, casualtiesAt(at(12, 15)))
		})

		t.Run("a merge moves the casualties without counting them twice", func(t *testing.T) {
			before, after := casualtiesAt(at(12, 29)), casualtiesAt(at(12, 31))
			assert.Equal(t, schadenplatz.CasualtyTotals{Verletzte: 4, Tote: 1}, before)
			assert.Equal(t, before, after)

			states, err := svc.SchadenplaetzeAsOf(ctx, incID, at(12, 31))
			require.NoError(t, err)

			merged := 0

			for _, s := range states {
				if s.IsMerged {
					merged++
				}
			}

			assert.Equal(t, 1, merged, "Nord counts as merged from 12:30 on")
		})

		t.Run("relieved", func(t *testing.T) {
			assert.Equal(t, resource.StatusAbgeloest, resourcesAt(at(13, 15))["TLF 1"].Status)
		})

		t.Run("now equals the current state", func(t *testing.T) {
			current, err := b.Queries.ListResourcesForIncident(ctx, uuid.UUID(incID))
			require.NoError(t, err)

			byName := map[string]string{}
			for _, r := range current {
				byName[r.Name] = r.Status
			}

			got := resourcesAt(at(23, 0))
			require.Len(t, got, len(current))

			for name, s := range got {
				assert.Equal(t, byName[name], string(s.Status), name)
			}
		})
	})
}
