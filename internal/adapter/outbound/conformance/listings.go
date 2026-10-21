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
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// RunListings runs the resource and casualty listing sub-suite: which incidents a resource list
// covers, and when an incident counts as having casualty records.
func RunListings(t *testing.T, f Factory) {
	t.Helper()

	if f(t).Project == nil {
		t.Skip("backend does not provide Project func")
	}

	at := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor := "sys"

	// store appends the aggregates in one transaction and projects them.
	store := func(t *testing.T, b *Backend, ctx context.Context, aggs ...eventsourcing.Aggregate) {
		t.Helper()

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			for _, a := range aggs {
				if _, err := b.Store.Append(ctx, a); err != nil {
					return err
				}
			}

			return nil
		}))
		require.NoError(t, b.Project(ctx))
	}

	// open opens an incident, optionally as a child of parent, optionally closed and deleted.
	open := func(t *testing.T, name string, parent *shared.IncidentID, deleted bool) *incident.Incident {
		t.Helper()

		inc := incident.New(shared.IncidentID(uuid.New()))
		require.NoError(t, inc.Open(name, nil, nil, at, actor))

		if parent != nil {
			require.NoError(t, inc.LinkParent(*parent, actor, at))
		}

		if deleted {
			require.NoError(t, inc.Close(shared.ReasonManual, actor, at))
			require.NoError(t, inc.Delete(shared.DeleteReasonManual, actor, at))
		}

		return inc
	}

	// place creates a Schadenplatz and one resource in it for the incident.
	place := func(t *testing.T, incID shared.IncidentID, name string) (*schadenplatz.Schadenplatz, *resource.Resource) {
		t.Helper()

		sp := schadenplatz.New(shared.SchadenplatzID(uuid.New()))
		require.NoError(t, sp.Create(incID, "Allgemein", true, actor, at))

		r := resource.New(shared.ResourceID(uuid.New()))
		require.NoError(t, r.Alert(incID, sp.ID(), resource.FormationFW, name, resource.UnitSizeTrupp,
			4, "Löschen", nil, nil, nil, actor, at))

		return sp, r
	}

	t.Run("ListResourcesForIncident_CoversTheIncidentAndItsLiveChildren", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		parent := open(t, "Parent", nil, false)
		parentID := shared.IncidentID(parent.Root().ID())
		child := open(t, "Child", &parentID, false)
		deletedChild := open(t, "Deleted child", &parentID, true)
		other := open(t, "Other", nil, false)

		parentSP, parentRes := place(t, parentID, "parent")
		childSP, childRes := place(t, shared.IncidentID(child.Root().ID()), "child")
		deletedSP, deletedRes := place(t, shared.IncidentID(deletedChild.Root().ID()), "deleted child")
		otherSP, otherRes := place(t, shared.IncidentID(other.Root().ID()), "other")

		store(t, b, ctx, parent, child, deletedChild, other,
			parentSP, childSP, deletedSP, otherSP, parentRes, childRes, deletedRes, otherRes)

		names := func(incID shared.IncidentID) []string {
			t.Helper()

			rows, err := b.Queries.ListResourcesForIncident(ctx, uuid.UUID(incID))
			require.NoError(t, err)

			out := make([]string, 0, len(rows))
			for _, r := range rows {
				out = append(out, r.Name)
			}

			return out
		}

		assert.ElementsMatch(
			t,
			[]string{"parent", "child"},
			names(parentID),
			"own and live children's, not a deleted child's",
		)
		assert.Equal(
			t,
			[]string{"child"},
			names(shared.IncidentID(child.Root().ID())),
			"a child has no children of its own",
		)
		assert.Equal(t, []string{"other"}, names(shared.IncidentID(other.Root().ID())))
	})

	t.Run("HasCasualtyRecords_StaysTrueWhenDeltasCancelOut", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()

		inc := open(t, "Lage", nil, false)
		incID := shared.IncidentID(inc.Root().ID())
		sp := schadenplatz.New(shared.SchadenplatzID(uuid.New()))
		require.NoError(t, sp.Create(incID, "Allgemein", true, actor, at))

		store(t, b, ctx, inc, sp)

		has := func() bool {
			t.Helper()

			got, err := b.Queries.HasCasualtyRecords(ctx, uuid.UUID(incID))
			require.NoError(t, err)

			return got
		}

		record := func(msg shared.MessageID, injured int, when time.Duration) {
			t.Helper()

			require.NoError(
				t,
				sp.RecordCasualties(msg, schadenplatz.CasualtyDeltas{Verletzte: injured}, actor, at.Add(when)),
			)
			store(t, b, ctx, sp)
		}

		first, second := shared.MessageID(uuid.New()), shared.MessageID(uuid.New())

		assert.False(t, has(), "nothing recorded yet")

		record(first, 3, time.Minute)
		assert.True(t, has())

		// A later message cancels the first: the totals are zero again, casualties were recorded.
		record(second, -3, 2*time.Minute)
		assert.True(t, has(), "cancelled out, but still recorded")

		// Correcting both back to zero leaves nothing recorded.
		record(second, 0, 3*time.Minute)
		record(first, 0, 4*time.Minute)
		assert.False(t, has(), "every delta corrected back to zero")

		other := open(t, "Other", nil, false)
		store(t, b, ctx, other)

		got, err := b.Queries.HasCasualtyRecords(ctx, other.Root().ID())
		require.NoError(t, err)
		assert.False(t, got, "another incident is unaffected")
	})
}
