package projection

import (
	"context"
	"encoding/json/jsontext"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/featurechange"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion: LayerFeaturesHandler implements Handler.
var _ Handler = (*LayerFeaturesHandler)(nil)

// LayerFeaturesHandler maintains readmodel.layer_features.
// One row per layer holding a complete GeoJSON FeatureCollection as jsonb,
// plus a revision counter. Polled every 2s by the UI map view.
type LayerFeaturesHandler struct {
	pool *pgxpool.Pool
}

func NewLayerFeaturesHandler(pool *pgxpool.Pool) *LayerFeaturesHandler {
	return &LayerFeaturesHandler{pool: pool}
}

func (h *LayerFeaturesHandler) Name() string { return "readmodel.layer_features" }
func (h *LayerFeaturesHandler) Version() int { return 4 }
func (h *LayerFeaturesHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE readmodel.layer_features, readmodel.feature_change`)
	return err
}

func (h *LayerFeaturesHandler) Handles(st, t string) bool {
	switch st {
	case "Layer":
		switch t {
		case "Created", "KindAssigned", "Renamed", "Removed", "Imported":
			return true
		}
	case "Feature":
		switch t {
		case "Placed", "Moved", "Restyled", "Imported", "Removed", "Restored":
			return true
		}
	}

	return false
}

func (h *LayerFeaturesHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.layer_features: no transaction in context")
	}

	switch e.StreamType {
	case "Layer":
		return h.applyLayerEvent(ctx, tx, e)
	case "Feature":
		return h.applyFeatureEvent(ctx, tx, e)
	}

	return nil
}

func (h *LayerFeaturesHandler) applyLayerEvent(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	id := e.StreamID
	switch e.EventType {
	case "Created", "Imported":
		type created struct {
			IncidentID string `json:"incidentId"`
			Name       string `json:"name"`
			Kind       string `json:"kind"`
		}

		var d created
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		err := exec(tx, ctx, `
			INSERT INTO readmodel.layer_features (id, incident_id, name, kind, geojson, revision, removed)
			VALUES ($1, $2, $3, $4, '{"type":"FeatureCollection","features":[]}'::jsonb, 0, false)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
			id, d.IncidentID, d.Name, d.Kind)

		return err

	case "KindAssigned":
		var d struct {
			Kind string `json:"kind"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel.layer_features SET kind = $1 WHERE id = $2`, d.Kind, id)

	case "Renamed":
		type renamed struct {
			Name string `json:"name"`
		}

		var d renamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		err := exec(tx, ctx, `UPDATE readmodel.layer_features SET name = $1 WHERE id = $2`, d.Name, id)

		return err

	case "Removed":
		err := exec(tx, ctx, `UPDATE readmodel.layer_features SET removed = true WHERE id = $1`, id)
		return err
	}

	return nil
}

func (h *LayerFeaturesHandler) applyFeatureEvent(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	apply, err := recordFeatureChange(ctx, tx, e)
	if err != nil || !apply {
		return err
	}

	id := e.StreamID
	switch e.EventType {
	case "Placed", "Imported", "Restored":
		type placed struct {
			LayerID    string         `json:"layerId"`
			Geometry   jsontext.Value `json:"geometry"`
			Properties jsontext.Value `json:"properties"`
		}

		var d placed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		featureJSON := fmt.Sprintf(`{"type":"Feature","id":%q,"geometry":%s,"properties":%s}`,
			id, d.Geometry, d.Properties)
		// Remove any existing entry for this feature ID then append the new one.
		// COALESCE guards against NULL from jsonb_agg on an empty array (first feature).
		err := exec(tx, ctx, `
			UPDATE readmodel.layer_features
			SET geojson = jsonb_set(
			      geojson, '{features}',
			      COALESCE(
			        (SELECT jsonb_agg(f) FROM jsonb_array_elements(geojson->'features') AS f
			         WHERE f->>'id' != $1::text),
			        '[]'::jsonb
			      ) || $2::jsonb
			    ),
			    revision = revision + 1
			WHERE id = $3`,
			id.String(), featureJSON, d.LayerID)

		return err

	case "Moved":
		type moved struct {
			Geometry jsontext.Value `json:"geometry"`
		}

		var d moved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		// Only update when the stored geometry differs — makes replay idempotent.
		err := exec(tx, ctx, `
			UPDATE readmodel.layer_features
			SET geojson = jsonb_set(
			      geojson,
			      ARRAY['features',
			            ((SELECT ordinality FROM jsonb_array_elements(geojson->'features')
			              WITH ORDINALITY AS f(v, ordinality)
			              WHERE v->>'id' = $1::text LIMIT 1) - 1)::text,
			            'geometry'],
			      $2::jsonb
			    ),
			    revision = revision + 1
			WHERE geojson @> jsonb_build_object('features', jsonb_build_array(jsonb_build_object('id', $1::text)))
			  AND (SELECT (f->>'id' = $1::text AND f->'geometry' != $2::jsonb)
			       FROM jsonb_array_elements(geojson->'features') AS f
			       WHERE f->>'id' = $1::text LIMIT 1)`,
			id.String(), d.Geometry)

		return err

	case "Restyled":
		type restyled struct {
			Properties jsontext.Value `json:"properties"`
		}

		var d restyled
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		// Only update when the stored properties differ — makes replay idempotent.
		err := exec(tx, ctx, `
			UPDATE readmodel.layer_features
			SET geojson = jsonb_set(
			      geojson,
			      ARRAY['features',
			            ((SELECT ordinality FROM jsonb_array_elements(geojson->'features')
			              WITH ORDINALITY AS f(v, ordinality)
			              WHERE v->>'id' = $1::text LIMIT 1) - 1)::text,
			            'properties'],
			      $2::jsonb
			    ),
			    revision = revision + 1
			WHERE geojson @> jsonb_build_object('features', jsonb_build_array(jsonb_build_object('id', $1::text)))
			  AND (SELECT (f->>'id' = $1::text AND f->'properties' != $2::jsonb)
			       FROM jsonb_array_elements(geojson->'features') AS f
			       WHERE f->>'id' = $1::text LIMIT 1)`,
			id.String(), d.Properties)

		return err

	case "Removed":
		err := exec(tx, ctx, `
			UPDATE readmodel.layer_features
			SET geojson = jsonb_set(
			      geojson, '{features}',
			      (SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
			       FROM jsonb_array_elements(geojson->'features') AS f
			       WHERE f->>'id' != $1::text)
			    ),
			    revision = revision + 1
			WHERE geojson @> jsonb_build_object('features', jsonb_build_array(jsonb_build_object('id', $1::text)))`,
			id.String())

		return err
	}

	return nil
}

// recordFeatureChange persists the event in readmodel.feature_change and reports whether
// it should update the layer's current GeoJSON.
//
// It is idempotent: a redelivered event finds its row already present and applies nothing.
// Changes are ordered by effective time, so an older change recorded later (a message
// drawn out of order) is kept as history but does not override a newer geometry or
// properties.
func recordFeatureChange(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) (bool, error) {
	c, ok, err := featurechange.Decode(e)
	if err != nil || !ok {
		return false, err
	}

	incidentID, layerID := c.IncidentID, c.LayerID

	if c.Kind != featurechange.Placed {
		// Moved/Restyled/Removed do not repeat where the feature lives; take it from its placed row.
		err := tx.QueryRow(ctx, `
			SELECT incident_id::text, layer_id::text
			FROM readmodel.feature_change
			WHERE feature_id = $1 AND change = 'placed'`, e.StreamID).Scan(&incidentID, &layerID)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}

		if err != nil {
			return false, err
		}
	}

	var latest *time.Time

	if kinds := c.GuardKinds(); len(kinds) > 0 {
		names := make([]string, len(kinds))
		for i, k := range kinds {
			names[i] = string(k)
		}

		if err := tx.QueryRow(ctx, `
			SELECT max(effective_at)
			FROM readmodel.feature_change
			WHERE feature_id = $1 AND change = ANY($2) AND version < $3`,
			e.StreamID, names, c.Version).Scan(&latest); err != nil {
			return false, err
		}
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO readmodel.feature_change
		  (feature_id, version, incident_id, layer_id, change, effective_at, recorded_at,
		   message_id, geometry, properties, actor)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::uuid, $9, $10, $11)
		ON CONFLICT (feature_id, version) DO NOTHING`,
		e.StreamID, c.Version, incidentID, layerID, string(c.Kind), c.EffectiveAt, c.RecordedAt,
		c.MessageID, nullableJSON(c.Geometry), nullableJSON(c.Properties), c.Actor)
	if err != nil {
		return false, err
	}

	if tag.RowsAffected() == 0 {
		return false, nil // already applied
	}

	return c.UpdatesCurrentState(latest), nil
}
