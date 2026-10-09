package projection

import (
	"context"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
	"maps"
	"slices"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/featurechange"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*LayerFeaturesHandler)(nil)

// featureItem holds the raw geometry and properties for one GeoJSON Feature.
type featureItem struct {
	Geometry   jsontext.Value
	Properties jsontext.Value
}

// LayerRow mirrors readmodel.layer_features.
// Features are kept as a map so individual add/move/restyle/remove operations
// are O(1). GeoJSON is built on demand by Queries.
type LayerRow struct {
	ID         uuid.UUID
	IncidentID uuid.UUID
	Name       string
	Kind       string
	Features   map[uuid.UUID]featureItem
	Revision   int
	Removed    bool
}

// GeoJSON builds a GeoJSON FeatureCollection from the current feature map.
func (r *LayerRow) GeoJSON() jsontext.Value {
	type feature struct {
		Type       string         `json:"type"`
		ID         string         `json:"id"`
		Geometry   jsontext.Value `json:"geometry"`
		Properties jsontext.Value `json:"properties"`
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

// LayerFeaturesHandler maintains an in-memory projection of readmodel.layer_features.
type LayerFeaturesHandler struct {
	mu      sync.RWMutex
	rows    map[uuid.UUID]*LayerRow
	changes []*FeatureChangeRow
}

// FeatureChangeRow mirrors readmodel.feature_change.
type FeatureChangeRow struct {
	FeatureID   uuid.UUID
	Version     int
	IncidentID  uuid.UUID
	LayerID     uuid.UUID
	Kind        string
	EffectiveAt time.Time
	RecordedAt  time.Time
	MessageID   *uuid.UUID
	Geometry    jsontext.Value
	Properties  jsontext.Value
	Actor       string
}

func NewLayerFeaturesHandler() *LayerFeaturesHandler {
	return &LayerFeaturesHandler{rows: make(map[uuid.UUID]*LayerRow)}
}

func (h *LayerFeaturesHandler) Name() string { return "readmodel.layer_features" }
func (h *LayerFeaturesHandler) Version() int { return 4 }

func (h *LayerFeaturesHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.rows = make(map[uuid.UUID]*LayerRow)
	h.changes = nil

	return nil
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
			Kind       string `json:"kind"`
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
			Kind:       d.Kind,
			Features:   make(map[uuid.UUID]featureItem),
		}

	case "KindAssigned":
		var d struct {
			Kind string `json:"kind"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.Kind = d.Kind
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
	apply, err := h.recordFeatureChange(e)
	if err != nil || !apply {
		return err
	}

	featureID := e.StreamID
	switch e.EventType {
	case "Placed", "Imported", "Restored":
		var d struct {
			LayerID    string         `json:"layerId"`
			Geometry   jsontext.Value `json:"geometry"`
			Properties jsontext.Value `json:"properties"`
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
			Geometry jsontext.Value `json:"geometry"`
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
			Properties jsontext.Value `json:"properties"`
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

// FindFeatureIncidentID returns the incident ID for the layer that contains
// the given feature, or uuid.Nil if the feature does not exist or was removed.
func (h *LayerFeaturesHandler) FindFeatureIncidentID(featureID uuid.UUID) (uuid.UUID, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	row, _, ok := h.findFeature(featureID)
	if !ok {
		return uuid.UUID{}, false
	}

	return row.IncidentID, true
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

// recordFeatureChange stores the event as a FeatureChangeRow and reports whether it should
// update the layer's current state. See the Postgres handler for the rules. The caller
// holds h.mu.
func (h *LayerFeaturesHandler) recordFeatureChange(e eventsourcing.Event) (bool, error) {
	c, ok, err := featurechange.Decode(e)
	if err != nil || !ok {
		return false, err
	}

	var latest *time.Time

	incidentID, layerID := uuid.Nil, uuid.Nil

	if c.Kind == featurechange.Placed {
		if incidentID, err = uuid.Parse(c.IncidentID); err != nil {
			return false, err
		}

		if layerID, err = uuid.Parse(c.LayerID); err != nil {
			return false, err
		}
	}

	guard := c.GuardKinds()
	found := c.Kind == featurechange.Placed

	for _, r := range h.changes {
		if r.FeatureID != e.StreamID {
			continue
		}

		if r.Version == c.Version {
			return false, nil // already applied
		}

		if r.Kind == string(featurechange.Placed) {
			incidentID, layerID, found = r.IncidentID, r.LayerID, true
		}

		if r.Version < c.Version && slices.Contains(guard, featurechange.Kind(r.Kind)) &&
			(latest == nil || r.EffectiveAt.After(*latest)) {
			t := r.EffectiveAt
			latest = &t
		}
	}

	if !found {
		return false, nil
	}

	row := &FeatureChangeRow{
		FeatureID: e.StreamID, Version: c.Version, IncidentID: incidentID, LayerID: layerID,
		Kind: string(c.Kind), EffectiveAt: c.EffectiveAt, RecordedAt: c.RecordedAt,
		Geometry: c.Geometry, Properties: c.Properties, Actor: c.Actor,
	}

	if c.MessageID != "" {
		id, err := uuid.Parse(c.MessageID)
		if err != nil {
			return false, err
		}

		row.MessageID = &id
	}

	h.changes = append(h.changes, row)

	return c.UpdatesCurrentState(latest), nil
}

// ChangesForIncidents returns the feature changes of all non-removed layers of the
// incidents, ordered by effective time, then by recording order.
func (h *LayerFeaturesHandler) ChangesForIncidents(incidentIDs ...uuid.UUID) []*FeatureChangeRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*FeatureChangeRow

	for _, c := range h.changes {
		if !slices.Contains(incidentIDs, c.IncidentID) {
			continue
		}

		if layer := h.rows[c.LayerID]; layer == nil || layer.Removed {
			continue
		}

		cp := *c
		out = append(out, &cp)
	}

	sort.SliceStable(out, func(i, j int) bool {
		if !out[i].EffectiveAt.Equal(out[j].EffectiveAt) {
			return out[i].EffectiveAt.Before(out[j].EffectiveAt)
		}

		if !out[i].RecordedAt.Equal(out[j].RecordedAt) {
			return out[i].RecordedAt.Before(out[j].RecordedAt)
		}

		return out[i].Version < out[j].Version
	})

	return out
}

// MessageIDsForFeature returns the distinct messages linked to the feature's changes,
// in the order they took effect.
func (h *LayerFeaturesHandler) MessageIDsForFeature(featureID uuid.UUID) []uuid.UUID {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var rows []*FeatureChangeRow

	for _, c := range h.changes {
		if c.FeatureID == featureID && c.MessageID != nil {
			rows = append(rows, c)
		}
	}

	sort.SliceStable(rows, func(i, j int) bool { return rows[i].EffectiveAt.Before(rows[j].EffectiveAt) })

	var out []uuid.UUID

	for _, r := range rows {
		if !slices.Contains(out, *r.MessageID) {
			out = append(out, *r.MessageID)
		}
	}

	return out
}

// IncidentIDForFeature returns the incident the feature was placed in, including removed features.
func (h *LayerFeaturesHandler) IncidentIDForFeature(featureID uuid.UUID) (uuid.UUID, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, c := range h.changes {
		if c.FeatureID == featureID && c.Kind == string(featurechange.Placed) {
			return c.IncidentID, true
		}
	}

	return uuid.UUID{}, false
}
