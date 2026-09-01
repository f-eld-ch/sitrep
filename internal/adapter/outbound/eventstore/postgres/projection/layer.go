package projection

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion: LayerFeaturesHandler implements Handler.
var _ Handler = (*LayerFeaturesHandler)(nil)

// LayerFeaturesHandler maintains rm_layer_features.
// One row per layer holding a complete GeoJSON FeatureCollection as jsonb,
// plus a revision counter. Polled every 2s by the UI map view.
type LayerFeaturesHandler struct {
	pool *pgxpool.Pool
}

func NewLayerFeaturesHandler(pool *pgxpool.Pool) *LayerFeaturesHandler {
	return &LayerFeaturesHandler{pool: pool}
}

func (h *LayerFeaturesHandler) Name() string { return "rm_layer_features" }
func (h *LayerFeaturesHandler) Version() int { return 1 }
func (h *LayerFeaturesHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE rm_layer_features`)
	return err
}

func (h *LayerFeaturesHandler) Handles(st, t string) bool {
	switch st {
	case "Layer":
		switch t {
		case "Created", "Renamed", "Removed", "Imported":
			return true
		}
	case "Feature":
		switch t {
		case "Placed", "Moved", "Restyled", "Imported", "Removed":
			return true
		}
	}
	return false
}

func (h *LayerFeaturesHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("rm_layer_features: no transaction in context")
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
		}
		var d created
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		err := exec(tx, ctx, `
			INSERT INTO rm_layer_features (id, incident_id, name, geojson, revision, removed)
			VALUES ($1, $2, $3, '{"type":"FeatureCollection","features":[]}'::jsonb, 0, false)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
			id, d.IncidentID, d.Name)
		return err

	case "Renamed":
		type renamed struct {
			Name string `json:"name"`
		}
		var d renamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		err := exec(tx, ctx, `UPDATE rm_layer_features SET name = $1 WHERE id = $2`, d.Name, id)
		return err

	case "Removed":
		err := exec(tx, ctx, `UPDATE rm_layer_features SET removed = true WHERE id = $1`, id)
		return err
	}
	return nil
}

func (h *LayerFeaturesHandler) applyFeatureEvent(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	id := e.StreamID
	switch e.EventType {
	case "Placed", "Imported":
		type placed struct {
			LayerID    string          `json:"layerId"`
			Geometry   json.RawMessage `json:"geometry"`
			Properties json.RawMessage `json:"properties"`
		}
		var d placed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		featureJSON := fmt.Sprintf(`{"type":"Feature","id":%q,"geometry":%s,"properties":%s}`,
			id, d.Geometry, d.Properties)
		// Remove any existing entry with this feature ID first (idempotent replay).
		err := exec(tx, ctx, `
			UPDATE rm_layer_features
			SET geojson = jsonb_set(
			      geojson, '{features}',
			      (SELECT jsonb_agg(f) FROM jsonb_array_elements(geojson->'features') AS f
			       WHERE f->>'id' != $1::text) || $2::jsonb
			    ),
			    revision = revision + 1
			WHERE id = $3`,
			id.String(), featureJSON, d.LayerID)
		return err

	case "Moved":
		type moved struct {
			Geometry json.RawMessage `json:"geometry"`
		}
		var d moved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		err := exec(tx, ctx, `
			UPDATE rm_layer_features
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
			WHERE geojson @> jsonb_build_object('features', jsonb_build_array(jsonb_build_object('id', $1::text)))`,
			id.String(), d.Geometry)
		return err

	case "Restyled":
		type restyled struct {
			Properties json.RawMessage `json:"properties"`
		}
		var d restyled
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		err := exec(tx, ctx, `
			UPDATE rm_layer_features
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
			WHERE geojson @> jsonb_build_object('features', jsonb_build_array(jsonb_build_object('id', $1::text)))`,
			id.String(), d.Properties)
		return err

	case "Removed":
		err := exec(tx, ctx, `
			UPDATE rm_layer_features
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
