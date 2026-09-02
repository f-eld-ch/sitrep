package projection

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"sync"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*LayerFeaturesHandler)(nil)

// featureItem holds the raw geometry and properties for one GeoJSON Feature.
type featureItem struct {
	Geometry   json.RawMessage
	Properties json.RawMessage
}

// LayerRow mirrors rm_layer_features.
// Features are kept as a map so individual add/move/restyle/remove operations
// are O(1). GeoJSON is built on demand by Queries.
type LayerRow struct {
	ID         uuid.UUID
	IncidentID uuid.UUID
	Name       string
	Features   map[uuid.UUID]featureItem
	Revision   int
	Removed    bool
}

// GeoJSON builds a GeoJSON FeatureCollection from the current feature map.
func (r *LayerRow) GeoJSON() json.RawMessage {
	type feature struct {
		Type       string          `json:"type"`
		ID         string          `json:"id"`
		Geometry   json.RawMessage `json:"geometry"`
		Properties json.RawMessage `json:"properties"`
	}

	features := make([]feature, 0, len(r.Features))
	for id, f := range r.Features {
		features = append(features, feature{
			Type:       "Feature",
			ID:         id.String(),
			Geometry:   f.Geometry,
			Properties: f.Properties,
		})
	}

	type collection struct {
		Type     string    `json:"type"`
		Features []feature `json:"features"`
	}

	b, err := json.Marshal(collection{Type: "FeatureCollection", Features: features})
	if err != nil {
		panic(fmt.Sprintf("marshal layer GeoJSON: %v", err))
	}

	return b
}

// LayerFeaturesHandler maintains an in-memory projection of rm_layer_features.
type LayerFeaturesHandler struct {
	mu   sync.RWMutex
	rows map[uuid.UUID]*LayerRow
}

func NewLayerFeaturesHandler() *LayerFeaturesHandler {
	return &LayerFeaturesHandler{rows: make(map[uuid.UUID]*LayerRow)}
}

func (h *LayerFeaturesHandler) Name() string { return "rm_layer_features" }
func (h *LayerFeaturesHandler) Version() int { return 1 }

func (h *LayerFeaturesHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.rows = make(map[uuid.UUID]*LayerRow)

	return nil
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

func (h *LayerFeaturesHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	switch e.StreamType {
	case "Layer":
		return h.applyLayerEvent(e)
	case "Feature":
		return h.applyFeatureEvent(e)
	}

	return nil
}

func (h *LayerFeaturesHandler) applyLayerEvent(e eventsourcing.Event) error {
	id := e.StreamID
	switch e.EventType {
	case "Created", "Imported":
		var d struct {
			IncidentID string `json:"incidentId"`
			Name       string `json:"name"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		incidentID, err := uuid.Parse(d.IncidentID)
		if err != nil {
			return err
		}

		h.rows[id] = &LayerRow{
			ID:         id,
			IncidentID: incidentID,
			Name:       d.Name,
			Features:   make(map[uuid.UUID]featureItem),
		}

	case "Renamed":
		var d struct {
			Name string `json:"name"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.Name = d.Name
		}

	case "Removed":
		if row := h.rows[id]; row != nil {
			row.Removed = true
		}
	}

	return nil
}

func (h *LayerFeaturesHandler) applyFeatureEvent(e eventsourcing.Event) error {
	featureID := e.StreamID
	switch e.EventType {
	case "Placed", "Imported":
		var d struct {
			LayerID    string          `json:"layerId"`
			Geometry   json.RawMessage `json:"geometry"`
			Properties json.RawMessage `json:"properties"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		layerID, err := uuid.Parse(d.LayerID)
		if err != nil {
			return err
		}

		row := h.rows[layerID]
		if row == nil {
			return fmt.Errorf("inmem LayerFeaturesHandler: layer %s not found for feature %s", layerID, featureID)
		}

		row.Features[featureID] = featureItem{Geometry: d.Geometry, Properties: d.Properties}
		row.Revision++

	case "Moved":
		var d struct {
			Geometry json.RawMessage `json:"geometry"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		row, f, ok := h.findFeature(featureID)
		if !ok {
			return nil
		}

		f.Geometry = d.Geometry
		row.Features[featureID] = f
		row.Revision++

	case "Restyled":
		var d struct {
			Properties json.RawMessage `json:"properties"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		row, f, ok := h.findFeature(featureID)
		if !ok {
			return nil
		}

		f.Properties = d.Properties
		row.Features[featureID] = f
		row.Revision++

	case "Removed":
		row, _, ok := h.findFeature(featureID)
		if !ok {
			return nil
		}

		delete(row.Features, featureID)
		row.Revision++
	}

	return nil
}

// findFeature scans all layers for a feature with the given ID.
func (h *LayerFeaturesHandler) findFeature(featureID uuid.UUID) (*LayerRow, featureItem, bool) {
	for _, row := range h.rows {
		if f, ok := row.Features[featureID]; ok {
			return row, f, true
		}
	}

	return nil, featureItem{}, false
}

// ForIncident returns all non-removed layers for the given incident.
func (h *LayerFeaturesHandler) ForIncident(incidentID uuid.UUID) []*LayerRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*LayerRow

	for _, row := range h.rows {
		if row.IncidentID == incidentID && !row.Removed {
			cp := *row
			features := make(map[uuid.UUID]featureItem, len(row.Features))
			maps.Copy(features, row.Features)
			cp.Features = features
			out = append(out, &cp)
		}
	}

	return out
}
