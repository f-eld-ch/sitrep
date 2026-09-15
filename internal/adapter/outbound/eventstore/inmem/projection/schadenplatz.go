package projection

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*SchadenplatzHandler)(nil)

// SchadenplatzRow mirrors the schadenplatz read model.
type SchadenplatzRow struct {
	ID              uuid.UUID
	IncidentID      uuid.UUID
	Name            string
	IsDefault       bool
	GeoJSON         []byte
	Vermisste       int
	Tote            int
	Verletzte       int
	Obdachlose      int
	Eingeschlossene int
	IsMerged        bool
	MergedInto      *uuid.UUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// SchadenplatzHandler maintains an in-memory projection of the Schadenplatz
// read model. It is the source of truth for query adapters in the inmem stack.
type SchadenplatzHandler struct {
	mu   sync.RWMutex
	rows map[uuid.UUID]*SchadenplatzRow
}

func NewSchadenplatzHandler() *SchadenplatzHandler {
	return &SchadenplatzHandler{rows: make(map[uuid.UUID]*SchadenplatzRow)}
}

func (h *SchadenplatzHandler) Name() string { return "readmodel.schadenplatz" }
func (h *SchadenplatzHandler) Version() int { return 1 }

func (h *SchadenplatzHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.rows = make(map[uuid.UUID]*SchadenplatzRow)

	return nil
}

func (h *SchadenplatzHandler) Handles(st, t string) bool {
	if st != "Schadenplatz" {
		return false
	}

	switch t {
	case "Created", "Renamed", "GeometrySet", "CasualtiesRecorded", "MergedIntoDefault":
		return true
	}

	return false
}

func (h *SchadenplatzHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := e.StreamID

	switch e.EventType {
	case "Created":
		var d struct {
			IncidentID string `json:"incidentId"`
			Name       string `json:"name"`
			IsDefault  bool   `json:"isDefault"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		incidentID, err := uuid.Parse(d.IncidentID)
		if err != nil {
			return err
		}

		h.rows[id] = &SchadenplatzRow{
			ID:         id,
			IncidentID: incidentID,
			Name:       d.Name,
			IsDefault:  d.IsDefault,
			CreatedAt:  e.OccurredAt,
			UpdatedAt:  e.OccurredAt,
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
			row.UpdatedAt = e.OccurredAt
		}

	case "GeometrySet":
		var d struct {
			GeoJSON []byte `json:"geoJson"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.GeoJSON = d.GeoJSON
			row.UpdatedAt = e.OccurredAt
		}

	case "CasualtiesRecorded":
		var d struct {
			Deltas struct {
				Vermisste       int `json:"vermisste"`
				Tote            int `json:"tote"`
				Verletzte       int `json:"verletzte"`
				Obdachlose      int `json:"obdachlose"`
				Eingeschlossene int `json:"eingeschlossene"`
			} `json:"deltas"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.Vermisste += d.Deltas.Vermisste
			row.Tote += d.Deltas.Tote
			row.Verletzte += d.Deltas.Verletzte
			row.Obdachlose += d.Deltas.Obdachlose
			row.Eingeschlossene += d.Deltas.Eingeschlossene
			row.UpdatedAt = e.OccurredAt
		}

	case "MergedIntoDefault":
		var d struct {
			DefaultSchadenplatzID string `json:"defaultSchadenplatzId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		defaultID, err := uuid.Parse(d.DefaultSchadenplatzID)
		if err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.IsMerged = true
			row.MergedInto = &defaultID
			row.UpdatedAt = e.OccurredAt
		}
	}

	return nil
}

// Get returns the row for the given ID, or nil if not found.
func (h *SchadenplatzHandler) Get(id uuid.UUID) *SchadenplatzRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	row := h.rows[id]
	if row == nil {
		return nil
	}

	cp := *row

	return &cp
}

// ForIncident returns all non-merged Schadenplatz rows for the given incident.
func (h *SchadenplatzHandler) ForIncident(incidentID uuid.UUID) []*SchadenplatzRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*SchadenplatzRow

	for _, row := range h.rows {
		if row.IncidentID == incidentID && !row.IsMerged {
			cp := *row
			out = append(out, &cp)
		}
	}

	return out
}

// DefaultForIncident returns the default Schadenplatz row for an incident, or nil.
func (h *SchadenplatzHandler) DefaultForIncident(incidentID uuid.UUID) *SchadenplatzRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, row := range h.rows {
		if row.IncidentID == incidentID && row.IsDefault {
			cp := *row

			return &cp
		}
	}

	return nil
}
