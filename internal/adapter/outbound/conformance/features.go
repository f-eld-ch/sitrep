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
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// RunFeatureChanges runs the feature change history sub-suite.
func RunFeatureChanges(t *testing.T, f Factory) {
	t.Helper()

	if f(t).Project == nil {
		t.Skip("backend does not provide Project func")
	}

	point := func(lon float64) map[string]any {
		return map[string]any{"type": "Point", "coordinates": []any{lon, 47.0}}
	}

	// setup creates an incident with one layer and returns their IDs.
	setup := func(t *testing.T, b *Backend, now time.Time) (shared.IncidentID, shared.LayerID) {
		t.Helper()

		incID := shared.IncidentID(uuid.New())
		layerID := shared.LayerID(uuid.New())

		inc := incident.New(incID)
		require.NoError(t, inc.Open("Lagebild", nil, nil, now, "sys"))

		l := layer.New(layerID)
		require.NoError(t, l.Create(incID, "Lage", "sys", now))

		require.NoError(t, b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			if _, err := b.Store.Append(ctx, inc); err != nil {
				return err
			}

			_, err := b.Store.Append(ctx, l)

			return err
		}))

		return incID, layerID
	}

	currentGeometry := func(t *testing.T, b *Backend, incID shared.IncidentID, featureID shared.FeatureID) map[string]any {
		t.Helper()

		layers, err := b.Queries.ListVisibleLayers(t.Context(), uuid.UUID(incID))
		require.NoError(t, err)

		for _, l := range layers {
			var fc struct {
				Features []struct {
					ID       string         `json:"id"`
					Geometry map[string]any `json:"geometry"`
				} `json:"features"`
			}
			require.NoError(t, json.Unmarshal(l.GeoJSON, &fc))

			for _, ft := range fc.Features {
				if ft.ID == featureID.String() {
					return ft.Geometry
				}
			}
		}

		return nil
	}

	t.Run("OutOfOrderEffectiveTimes", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		drawn := time.Date(2026, 1, 15, 18, 0, 0, 0, time.UTC) // every change is drawn after the fact
		t1400 := time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)
		msg := shared.MessageID(uuid.New())

		incID, layerID := setup(t, b, drawn)
		featureID := feature.DeriveID(incID, "draw-1")

		ft := feature.New(featureID)
		require.NoError(t, ft.Place(incID, layerID, point(8.0), map[string]any{"label": "A"},
			feature.ChangeContext{EffectiveAt: t1400}, "sys", drawn))
		// The 14:10 change is drawn before the 14:05 one.
		require.NoError(t, ft.Move(point(10.0),
			feature.ChangeContext{EffectiveAt: t1400.Add(10 * time.Minute), MessageID: &msg}, "sys", drawn))
		require.NoError(t, ft.Move(point(9.0),
			feature.ChangeContext{EffectiveAt: t1400.Add(5 * time.Minute)}, "sys", drawn))

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, ft)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		changes, err := b.Queries.ListFeatureChanges(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		require.Len(t, changes, 3)

		// History is ordered by effective time, not by drawing order.
		assert.Equal(t, []string{"placed", "moved", "moved"},
			[]string{changes[0].Change, changes[1].Change, changes[2].Change})
		assert.Equal(t, []time.Time{t1400, t1400.Add(5 * time.Minute), t1400.Add(10 * time.Minute)},
			[]time.Time{
				changes[0].EffectiveAt.UTC(), changes[1].EffectiveAt.UTC(), changes[2].EffectiveAt.UTC(),
			})
		assert.Nil(t, changes[1].MessageID)
		require.NotNil(t, changes[2].MessageID)
		assert.Equal(t, uuid.UUID(msg), *changes[2].MessageID)

		// The current state is the latest change by effective time.
		assert.Equal(t, point(10.0), currentGeometry(t, b, incID, featureID))
	})

	t.Run("ProjectionIsIdempotentOnReplay", func(t *testing.T) {
		b := f(t)
		if b.ResetProjections == nil {
			t.Skip("backend does not provide ResetProjections func")
		}

		ctx := t.Context()
		drawn := time.Date(2026, 1, 15, 18, 0, 0, 0, time.UTC)
		t1400 := time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)

		incID, layerID := setup(t, b, drawn)
		featureID := feature.DeriveID(incID, "draw-1")

		ft := feature.New(featureID)
		require.NoError(
			t,
			ft.Place(
				incID,
				layerID,
				point(8.0),
				map[string]any{},
				feature.ChangeContext{EffectiveAt: t1400},
				"sys",
				drawn,
			),
		)
		require.NoError(
			t,
			ft.Move(point(10.0), feature.ChangeContext{EffectiveAt: t1400.Add(10 * time.Minute)}, "sys", drawn),
		)
		require.NoError(
			t,
			ft.Move(point(9.0), feature.ChangeContext{EffectiveAt: t1400.Add(5 * time.Minute)}, "sys", drawn),
		)

		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, ft)
			return err
		}))
		require.NoError(t, b.Project(ctx))
		require.NoError(t, b.ResetProjections(ctx))
		require.NoError(t, b.Project(ctx))

		changes, err := b.Queries.ListFeatureChanges(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		assert.Len(t, changes, 3, "a rebuild must not duplicate history")
		assert.Equal(t, point(10.0), currentGeometry(t, b, incID, featureID))
	})

	t.Run("HistoryAndUnknownFeature", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		now := time.Date(2026, 1, 15, 18, 0, 0, 0, time.UTC)

		incID, layerID := setup(t, b, now)

		ft := feature.New(feature.DeriveID(incID, "draw-1"))
		require.NoError(t, ft.Place(incID, layerID, point(8.0), map[string]any{}, feature.ChangeContext{}, "sys", now))
		require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, ft)
			return err
		}))
		require.NoError(t, b.Project(ctx))

		changes, err := b.Queries.ListFeatureChanges(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		require.Len(t, changes, 1)

		// Unknown incidents are not an information leak.
		_, err = b.Queries.ListFeatureMessages(ctx, uuid.New())
		require.ErrorIs(t, err, shared.ErrNotFound)
	})
	t.Run("RemoveAndRestore", func(t *testing.T) {
		b := f(t)
		ctx := t.Context()
		drawn := time.Date(2026, 1, 15, 18, 0, 0, 0, time.UTC)
		t1400 := time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC)
		t1410 := t1400.Add(10 * time.Minute)
		msg := shared.MessageID(uuid.New())

		incID, layerID := setup(t, b, drawn)
		featureID := feature.DeriveID(incID, "draw-1")

		ft := feature.New(featureID)
		require.NoError(t, ft.Place(incID, layerID, point(8.0), map[string]any{"label": "A"},
			feature.ChangeContext{EffectiveAt: t1400}, "sys", drawn))
		require.NoError(t, ft.Remove(shared.DeleteReasonManual,
			feature.ChangeContext{EffectiveAt: t1410, MessageID: &msg}, "sys", drawn))

		save := func() {
			require.NoError(t, b.Transactor.WithinTx(ctx, func(ctx context.Context) error {
				_, err := b.Store.Append(ctx, ft)
				return err
			}))
			require.NoError(t, b.Project(ctx))
		}

		save()
		assert.Nil(t, currentGeometry(t, b, incID, featureID), "removed features leave the layer")

		// Restoring at the removal's own time cancels it: the feature is back as it last was.
		require.NoError(t, ft.Restore(feature.ChangeContext{EffectiveAt: t1410, MessageID: &msg}, "sys", drawn))
		save()
		assert.Equal(t, point(8.0), currentGeometry(t, b, incID, featureID))

		changes, err := b.Queries.ListFeatureChanges(ctx, uuid.UUID(incID))
		require.NoError(t, err)
		require.Len(t, changes, 3)
		assert.Equal(t, []string{"placed", "removed", "restored"},
			[]string{changes[0].Change, changes[1].Change, changes[2].Change})

		// It is a feature like any other again.
		require.NoError(
			t,
			ft.Move(point(9.0), feature.ChangeContext{EffectiveAt: t1410.Add(time.Minute)}, "sys", drawn),
		)
		save()
		assert.Equal(t, point(9.0), currentGeometry(t, b, incID, featureID))
	})
}
