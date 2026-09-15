package projection

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*ResourceHandler)(nil)

// ResourceRow mirrors the resource read model.
type ResourceRow struct {
	ID               uuid.UUID
	IncidentID       uuid.UUID
	SchadenplatzID   uuid.UUID
	Formation        string
	Name             string
	Size             string
	PersonnelCount   int
	Hauptaufgabe     string
	ContactMedium    *string
	ContactDetail    *string
	HomeLocationName *string
	HomeLocationLat  *float64
	HomeLocationLng  *float64
	DeploymentLat    *float64
	DeploymentLng    *float64
	DeploymentLabel  *string
	Status           string
	StatusAt         time.Time
	EinsatzBeginn    *time.Time
	EinsatzEnde      *time.Time
	PredecessorID    *uuid.UUID
	SuccessorID      *uuid.UUID
	SourceMessageID  *uuid.UUID
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// ResourceHandler maintains an in-memory projection of the Resource read model.
type ResourceHandler struct {
	mu   sync.RWMutex
	rows map[uuid.UUID]*ResourceRow
}

func NewResourceHandler() *ResourceHandler {
	return &ResourceHandler{rows: make(map[uuid.UUID]*ResourceRow)}
}

func (h *ResourceHandler) Name() string { return "readmodel.resource" }
func (h *ResourceHandler) Version() int { return 1 }

func (h *ResourceHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.rows = make(map[uuid.UUID]*ResourceRow)

	return nil
}

func (h *ResourceHandler) Handles(st, t string) bool {
	if st != "Resource" {
		return false
	}

	switch t {
	case "Alerted", "MarkedReady", "Deployed", "StoodDown", "Relieved",
		"SuccessionLinked", "ReassignedToSchadenplatz", "DeploymentLocationUpdated",
		"HauptaufgabeChanged", "ContactUpdated", "PersonnelCountUpdated",
		"EinsatzDauerRecorded":
		return true
	}

	return false
}

func (h *ResourceHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := e.StreamID

	switch e.EventType {
	case "Alerted":
		var d struct {
			IncidentID     string `json:"incidentId"`
			SchadenplatzID string `json:"schadenplatzId"`
			Formation      string `json:"formation"`
			Name           string `json:"name"`
			Size           string `json:"size"`
			PersonnelCount int    `json:"personnelCount"`
			Hauptaufgabe   string `json:"hauptaufgabe"`
			Contact        *struct {
				Medium string `json:"medium"`
				Detail string `json:"detail"`
			} `json:"contact"`
			HomeLocation *struct {
				Name        string      `json:"name"`
				Coordinates *[2]float64 `json:"coordinates"`
			} `json:"homeLocation"`
			SourceMessageID *string `json:"sourceMessageId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		incidentID, err := uuid.Parse(d.IncidentID)
		if err != nil {
			return err
		}

		schadenplatzID, err := uuid.Parse(d.SchadenplatzID)
		if err != nil {
			return err
		}

		row := &ResourceRow{
			ID:             id,
			IncidentID:     incidentID,
			SchadenplatzID: schadenplatzID,
			Formation:      d.Formation,
			Name:           d.Name,
			Size:           d.Size,
			PersonnelCount: d.PersonnelCount,
			Hauptaufgabe:   d.Hauptaufgabe,
			Status:         "AUFGEBOTEN",
			StatusAt:       e.OccurredAt,
			CreatedAt:      e.OccurredAt,
			UpdatedAt:      e.OccurredAt,
		}

		if d.Contact != nil {
			row.ContactMedium = &d.Contact.Medium
			row.ContactDetail = &d.Contact.Detail
		}

		if d.HomeLocation != nil {
			row.HomeLocationName = &d.HomeLocation.Name
			if d.HomeLocation.Coordinates != nil {
				row.HomeLocationLat = &d.HomeLocation.Coordinates[0]
				row.HomeLocationLng = &d.HomeLocation.Coordinates[1]
			}
		}

		if d.SourceMessageID != nil {
			msgID, err := uuid.Parse(*d.SourceMessageID)
			if err != nil {
				return err
			}

			row.SourceMessageID = &msgID
		}

		h.rows[id] = row

	case "MarkedReady":
		if row := h.rows[id]; row != nil {
			row.Status = "EINSATZBEREIT"
			row.StatusAt = e.OccurredAt
			row.UpdatedAt = e.OccurredAt
		}

	case "Deployed":
		if row := h.rows[id]; row != nil {
			row.Status = "EINGESETZT"
			row.StatusAt = e.OccurredAt
			row.UpdatedAt = e.OccurredAt
		}

	case "StoodDown":
		if row := h.rows[id]; row != nil {
			row.Status = "EINSATZBEREIT"
			row.StatusAt = e.OccurredAt
			row.UpdatedAt = e.OccurredAt
		}

	case "Relieved":
		var d struct {
			SuccessorID *string `json:"successorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.Status = "ABGELOEST"
			row.StatusAt = e.OccurredAt
			row.UpdatedAt = e.OccurredAt

			if d.SuccessorID != nil {
				succID, err := uuid.Parse(*d.SuccessorID)
				if err != nil {
					return err
				}

				row.SuccessorID = &succID
			}
		}

	case "SuccessionLinked":
		var d struct {
			PredecessorID string `json:"predecessorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		predID, err := uuid.Parse(d.PredecessorID)
		if err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.PredecessorID = &predID
			row.UpdatedAt = e.OccurredAt
		}

	case "ReassignedToSchadenplatz":
		var d struct {
			SchadenplatzID string `json:"schadenplatzId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		spID, err := uuid.Parse(d.SchadenplatzID)
		if err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.SchadenplatzID = spID
			row.UpdatedAt = e.OccurredAt
		}

	case "DeploymentLocationUpdated":
		var d struct {
			Location *struct {
				Lat   float64 `json:"lat"`
				Lng   float64 `json:"lng"`
				Label string  `json:"label"`
			} `json:"location"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			if d.Location != nil {
				row.DeploymentLat = &d.Location.Lat
				row.DeploymentLng = &d.Location.Lng
				row.DeploymentLabel = &d.Location.Label
			} else {
				row.DeploymentLat = nil
				row.DeploymentLng = nil
				row.DeploymentLabel = nil
			}

			row.UpdatedAt = e.OccurredAt
		}

	case "HauptaufgabeChanged":
		var d struct {
			Hauptaufgabe string `json:"hauptaufgabe"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.Hauptaufgabe = d.Hauptaufgabe
			row.UpdatedAt = e.OccurredAt
		}

	case "ContactUpdated":
		var d struct {
			Contact struct {
				Medium string `json:"medium"`
				Detail string `json:"detail"`
			} `json:"contact"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.ContactMedium = &d.Contact.Medium
			row.ContactDetail = &d.Contact.Detail
			row.UpdatedAt = e.OccurredAt
		}

	case "PersonnelCountUpdated":
		var d struct {
			Count int `json:"count"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			row.PersonnelCount = d.Count
			row.UpdatedAt = e.OccurredAt
		}

	case "EinsatzDauerRecorded":
		var d struct {
			Beginn string  `json:"beginn"`
			Ende   *string `json:"ende"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if row := h.rows[id]; row != nil {
			beginn := e.OccurredAt // fallback; overwritten below
			if t, err := time.Parse(time.RFC3339, d.Beginn); err == nil {
				beginn = t
			}

			row.EinsatzBeginn = &beginn

			if d.Ende != nil {
				if t, err := time.Parse(time.RFC3339, *d.Ende); err == nil {
					row.EinsatzEnde = &t
				}
			}

			row.UpdatedAt = e.OccurredAt
		}
	}

	return nil
}

// Get returns the row for the given ID, or nil if not found.
func (h *ResourceHandler) Get(id uuid.UUID) *ResourceRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	row := h.rows[id]
	if row == nil {
		return nil
	}

	cp := *row

	return &cp
}

// ForSchadenplatz returns all non-relieved resource rows for the given Schadenplatz.
func (h *ResourceHandler) ForSchadenplatz(schadenplatzID uuid.UUID) []*ResourceRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*ResourceRow

	for _, row := range h.rows {
		if row.SchadenplatzID == schadenplatzID && row.Status != "ABGELOEST" {
			cp := *row
			out = append(out, &cp)
		}
	}

	return out
}

// ForIncident returns all resource rows for the given incident (including relieved).
func (h *ResourceHandler) ForIncident(incidentID uuid.UUID) []*ResourceRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*ResourceRow

	for _, row := range h.rows {
		if row.IncidentID == incidentID {
			cp := *row
			out = append(out, &cp)
		}
	}

	return out
}
