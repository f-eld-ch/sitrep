package projection

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions.
var (
	_ Handler = (*IncidentHandler)(nil)
	_ Handler = (*IncidentDivisionHandler)(nil)
)

// ──────────────────────────────────────────────────────────────────────────────
// IncidentRow mirrors rm_incident
// ──────────────────────────────────────────────────────────────────────────────

type IncidentRow struct {
	ID        uuid.UUID
	Name      string
	IsClosed  bool
	IsDeleted bool
	ClosedAt  *time.Time
	Location  json.RawMessage
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IncidentHandler maintains an in-memory projection of the rm_incident table.
type IncidentHandler struct {
	mu   sync.RWMutex
	rows map[uuid.UUID]*IncidentRow
}

func NewIncidentHandler() *IncidentHandler {
	return &IncidentHandler{rows: make(map[uuid.UUID]*IncidentRow)}
}

func (h *IncidentHandler) Name() string { return "rm_incident" }
func (h *IncidentHandler) Version() int { return 1 }

func (h *IncidentHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rows = make(map[uuid.UUID]*IncidentRow)
	return nil
}

func (h *IncidentHandler) Handles(st, t string) bool {
	if st != "Incident" {
		return false
	}
	switch t {
	case "Opened", "Renamed", "LocationChanged", "Closed", "Reopened", "Deleted", "Imported":
		return true
	}
	return false
}

func (h *IncidentHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := e.StreamID

	switch e.EventType {
	case "Opened":
		var d struct {
			Name     string          `json:"name"`
			Location json.RawMessage `json:"location"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		h.rows[id] = &IncidentRow{
			ID:        id,
			Name:      d.Name,
			Location:  d.Location,
			CreatedAt: e.OccurredAt,
			UpdatedAt: e.OccurredAt,
		}

	case "Imported":
		var d struct {
			Name      string          `json:"name"`
			Location  json.RawMessage `json:"location"`
			ClosedAt  *time.Time      `json:"closedAt"`
			DeletedAt *time.Time      `json:"deletedAt"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		row := &IncidentRow{
			ID:        id,
			Name:      d.Name,
			Location:  d.Location,
			IsClosed:  d.ClosedAt != nil,
			IsDeleted: d.DeletedAt != nil,
			ClosedAt:  d.ClosedAt,
			CreatedAt: e.OccurredAt,
			UpdatedAt: e.OccurredAt,
		}
		h.rows[id] = row

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

	case "LocationChanged":
		var d struct {
			Location json.RawMessage `json:"location"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		if row := h.rows[id]; row != nil {
			row.Location = d.Location
			row.UpdatedAt = e.OccurredAt
		}

	case "Closed":
		if row := h.rows[id]; row != nil {
			t := e.OccurredAt
			row.IsClosed = true
			row.ClosedAt = &t
			row.UpdatedAt = e.OccurredAt
		}

	case "Reopened":
		if row := h.rows[id]; row != nil {
			row.IsClosed = false
			row.ClosedAt = nil
			row.UpdatedAt = e.OccurredAt
		}

	case "Deleted":
		if row := h.rows[id]; row != nil {
			row.IsDeleted = true
			row.UpdatedAt = e.OccurredAt
		}
	}
	return nil
}

// Get returns the row for the given ID, or nil if not found.
func (h *IncidentHandler) Get(id uuid.UUID) *IncidentRow {
	h.mu.RLock()
	defer h.mu.RUnlock()
	row := h.rows[id]
	if row == nil {
		return nil
	}
	cp := *row
	return &cp
}

// All returns a snapshot of all rows.
func (h *IncidentHandler) All() []*IncidentRow {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]*IncidentRow, 0, len(h.rows))
	for _, row := range h.rows {
		cp := *row
		out = append(out, &cp)
	}
	return out
}

// ──────────────────────────────────────────────────────────────────────────────
// DivisionRow + IncidentDivisionHandler mirrors rm_incident_division
// ──────────────────────────────────────────────────────────────────────────────

type DivisionRow struct {
	ID          uuid.UUID
	IncidentID  uuid.UUID
	Name        string
	Description string
	RemovedAt   *time.Time
}

// IncidentDivisionHandler maintains an in-memory projection of rm_incident_division.
type IncidentDivisionHandler struct {
	mu   sync.RWMutex
	rows map[uuid.UUID]*DivisionRow
}

func NewIncidentDivisionHandler() *IncidentDivisionHandler {
	return &IncidentDivisionHandler{rows: make(map[uuid.UUID]*DivisionRow)}
}

func (h *IncidentDivisionHandler) Name() string { return "rm_incident_division" }
func (h *IncidentDivisionHandler) Version() int { return 1 }

func (h *IncidentDivisionHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rows = make(map[uuid.UUID]*DivisionRow)
	return nil
}

func (h *IncidentDivisionHandler) Handles(st, t string) bool {
	if st != "Incident" {
		return false
	}
	switch t {
	case "Opened", "DivisionAdded", "DivisionRenamed", "DivisionRemoved", "Imported":
		return true
	}
	return false
}

func (h *IncidentDivisionHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	incidentID := e.StreamID

	switch e.EventType {
	case "Opened", "Imported":
		var d struct {
			Divisions []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"divisions"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		for _, div := range d.Divisions {
			id, err := uuid.Parse(div.ID)
			if err != nil {
				continue
			}
			h.rows[id] = &DivisionRow{
				ID:          id,
				IncidentID:  incidentID,
				Name:        div.Name,
				Description: div.Description,
			}
		}

	case "DivisionAdded":
		var d struct {
			Division struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"division"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		id, err := uuid.Parse(d.Division.ID)
		if err != nil {
			return err
		}
		h.rows[id] = &DivisionRow{
			ID:          id,
			IncidentID:  incidentID,
			Name:        d.Division.Name,
			Description: d.Division.Description,
		}

	case "DivisionRenamed":
		var d struct {
			ID          string  `json:"id"`
			Name        string  `json:"name"`
			Description *string `json:"description,omitempty"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		id, err := uuid.Parse(d.ID)
		if err != nil {
			return err
		}
		if row := h.rows[id]; row != nil {
			row.Name = d.Name
			if d.Description != nil {
				row.Description = *d.Description
			}
		}

	case "DivisionRemoved":
		var d struct {
			ID string `json:"id"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		id, err := uuid.Parse(d.ID)
		if err != nil {
			return err
		}
		if row := h.rows[id]; row != nil {
			t := e.OccurredAt
			row.RemovedAt = &t
		}
	}
	return nil
}

// ForIncident returns all non-removed divisions for the given incident.
func (h *IncidentDivisionHandler) ForIncident(incidentID uuid.UUID) []*DivisionRow {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var out []*DivisionRow
	for _, row := range h.rows {
		if row.IncidentID == incidentID && row.RemovedAt == nil {
			cp := *row
			out = append(out, &cp)
		}
	}
	return out
}
