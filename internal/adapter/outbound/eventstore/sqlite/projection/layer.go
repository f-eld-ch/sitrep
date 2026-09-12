package projection

import (
	"context"
	"database/sql"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"errors"
	"fmt"

	"github.com/google/uuid"

	sqlitehelpers "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var _ Handler = (*LayerFeaturesHandler)(nil)

// LayerFeaturesHandler maintains readmodel_layer_features.
// GeoJSON FeatureCollection surgery is done in Go (not SQL) because SQLite
// does not have jsonb_set / jsonb_agg. The GeoJSON document is stored as TEXT
// and round-tripped as a Go struct.
type LayerFeaturesHandler struct{ db *sql.DB }

func NewLayerFeaturesHandler(db *sql.DB) *LayerFeaturesHandler {
	return &LayerFeaturesHandler{db: db}
}

func (h *LayerFeaturesHandler) Name() string { return "readmodel.layer_features" }
func (h *LayerFeaturesHandler) Version() int { return 1 }
func (h *LayerFeaturesHandler) Reset(ctx context.Context) error {
	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_layer_features`)
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
	tx, ok := txFromCtx(ctx)
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

// featureCollection is the in-memory representation of a GeoJSON FeatureCollection.
// Features are an ordered slice — insertion order is z-order in the map view.
type featureCollection struct {
	Type     string    `json:"type"`
	Features []feature `json:"features"`
}

type feature struct {
	Type       string         `json:"type"`
	ID         string         `json:"id"`
	Geometry   jsontext.Value `json:"geometry"`
	Properties jsontext.Value `json:"properties"`
}

const emptyCollection = `{"type":"FeatureCollection","features":[]}`

func (h *LayerFeaturesHandler) applyLayerEvent(ctx context.Context, tx *sql.Tx, e eventsourcing.Event) error {
	id := e.StreamID.String()

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

		return exec(tx, ctx, `
			INSERT INTO readmodel_layer_features (id, incident_id, name, geojson, revision, removed)
			VALUES (?, ?, ?, ?, 0, 0)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
			id, d.IncidentID, d.Name, emptyCollection)

	case "Renamed":
		type renamed struct {
			Name string `json:"name"`
		}

		var d renamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_layer_features SET name = ? WHERE id = ?`, d.Name, id)

	case "Removed":
		return exec(tx, ctx, `UPDATE readmodel_layer_features SET removed = 1 WHERE id = ?`, id)
	}

	return nil
}

func (h *LayerFeaturesHandler) applyFeatureEvent(ctx context.Context, tx *sql.Tx, e eventsourcing.Event) error {
	featureID := e.StreamID

	switch e.EventType {
	case "Placed", "Imported":
		type placed struct {
			LayerID    string         `json:"layerId"`
			Geometry   jsontext.Value `json:"geometry"`
			Properties jsontext.Value `json:"properties"`
		}

		var d placed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		layerID, fc, err := loadLayerByID(ctx, tx, d.LayerID)
		if err != nil {
			return err
		}

		if layerID == "" {
			// Missing layer: no-op, mirroring Postgres behaviour (HaltOnError is false).
			return nil
		}

		// Remove stale entry for this feature then append the new one.
		fc.Features = removeFeature(fc.Features, featureID)
		fc.Features = append(fc.Features, feature{
			Type:       "Feature",
			ID:         featureID.String(),
			Geometry:   d.Geometry,
			Properties: d.Properties,
		})

		return writeLayer(ctx, tx, layerID, fc)

	case "Moved":
		type moved struct {
			Geometry jsontext.Value `json:"geometry"`
		}

		var d moved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		// Mutation: update geometry in place when it differs (idempotency guard).
		return mutateSingleFeature(ctx, tx, featureID, func(f *feature) (bool, error) {
			equal, err := sqlitehelpers.Equal(f.Geometry, d.Geometry)
			if err != nil {
				return false, err
			}

			if equal {
				return false, nil
			}

			f.Geometry = d.Geometry

			return true, nil
		})

	case "Restyled":
		type restyled struct {
			Properties jsontext.Value `json:"properties"`
		}

		var d restyled
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		// Mutation: update properties in place when they differ (idempotency guard).
		return mutateSingleFeature(ctx, tx, featureID, func(f *feature) (bool, error) {
			equal, err := sqlitehelpers.Equal(f.Properties, d.Properties)
			if err != nil {
				return false, err
			}

			if equal {
				return false, nil
			}

			f.Properties = d.Properties

			return true, nil
		})

	case "Removed":
		// Removal: strip the feature from whichever layer contains it.
		return removeFromLayer(ctx, tx, featureID)
	}

	return nil
}

// mutateSingleFeature finds the layer owning featureID, calls fn on the matching
// feature in place, and writes the collection back when fn returns changed=true.
// Returns nil when the feature is not found (no-op, mirrors Postgres @> guard).
// fn may return an error (e.g. malformed JSON in idempotency comparison), which
// is propagated to the caller so the event goes to dead-letter rather than
// silently corrupting the read model.
func mutateSingleFeature(
	ctx context.Context,
	tx *sql.Tx,
	featureID uuid.UUID,
	fn func(*feature) (changed bool, err error),
) error {
	layerID, fc, err := loadLayerByFeature(ctx, tx, featureID)
	if err != nil {
		return err
	}

	if layerID == "" {
		return nil
	}

	idx := findFeature(fc.Features, featureID)
	if idx < 0 {
		return nil
	}

	changed, err := fn(&fc.Features[idx])
	if err != nil {
		return err
	}

	if !changed {
		return nil
	}

	return writeLayer(ctx, tx, layerID, fc)
}

// removeFromLayer strips featureID from whichever layer contains it.
// Returns nil when the feature is not found in any layer.
func removeFromLayer(ctx context.Context, tx *sql.Tx, featureID uuid.UUID) error {
	layerID, fc, err := loadLayerByFeature(ctx, tx, featureID)
	if err != nil {
		return err
	}

	if layerID == "" {
		return nil
	}

	before := len(fc.Features)
	fc.Features = removeFeature(fc.Features, featureID)

	if len(fc.Features) == before {
		return nil
	}

	return writeLayer(ctx, tx, layerID, fc)
}

// loadLayerByFeature locates the layer owning featureID using JSON1.
// Returns empty layerID when the feature is not found (not an error).
func loadLayerByFeature(ctx context.Context, tx *sql.Tx, featureID uuid.UUID) (string, featureCollection, error) {
	var layerID, geojsonStr string
	// json_each on '$.features' iterates the features array; json_extract picks
	// the 'id' field from each element. This is the direct Go analogue of the
	// Postgres @> containment guard.
	err := tx.QueryRowContext(ctx, `
		SELECT l.id, l.geojson
		  FROM readmodel_layer_features l
		 WHERE EXISTS (
		       SELECT 1 FROM json_each(l.geojson, '$.features') je
		       WHERE json_extract(je.value, '$.id') = ?
		 )
		 LIMIT 1`,
		featureID.String(),
	).Scan(&layerID, &geojsonStr)
	if errors.Is(err, sql.ErrNoRows) {
		return "", featureCollection{}, nil
	}

	if err != nil {
		return "", featureCollection{}, err
	}

	var fc featureCollection
	if err := json.Unmarshal([]byte(geojsonStr), &fc); err != nil {
		return "", featureCollection{}, fmt.Errorf("layer %s: unmarshal geojson: %w", layerID, err)
	}

	return layerID, fc, nil
}

// loadLayerByID loads the layer with the given ID directly.
// Returns ("", empty, nil) when the layer does not exist, matching the
// convention of loadLayerByFeature so callers check layerID == "" uniformly.
func loadLayerByID(ctx context.Context, tx *sql.Tx, layerID string) (string, featureCollection, error) {
	var geojsonStr string

	err := tx.QueryRowContext(ctx,
		`SELECT geojson FROM readmodel_layer_features WHERE id = ?`, layerID,
	).Scan(&geojsonStr)
	if errors.Is(err, sql.ErrNoRows) {
		return "", featureCollection{}, nil
	}

	if err != nil {
		return "", featureCollection{}, err
	}

	var fc featureCollection
	if err := json.Unmarshal([]byte(geojsonStr), &fc); err != nil {
		return "", featureCollection{}, fmt.Errorf("layer %s: unmarshal geojson: %w", layerID, err)
	}

	return layerID, fc, nil
}

func writeLayer(ctx context.Context, tx *sql.Tx, layerID string, fc featureCollection) error {
	b, err := json.Marshal(fc)
	if err != nil {
		return fmt.Errorf("layer %s: marshal geojson: %w", layerID, err)
	}

	return exec(tx, ctx, `
		UPDATE readmodel_layer_features SET geojson = ?, revision = revision + 1 WHERE id = ?`,
		string(b), layerID)
}

func findFeature(features []feature, id uuid.UUID) int {
	s := id.String()
	for i := range features {
		if features[i].ID == s {
			return i
		}
	}

	return -1
}

func removeFeature(features []feature, id uuid.UUID) []feature {
	s := id.String()

	out := features[:0]
	for _, f := range features {
		if f.ID != s {
			out = append(out, f)
		}
	}

	return out
}
