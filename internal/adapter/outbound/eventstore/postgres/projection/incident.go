package projection

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions: handlers implement Handler.
var (
	_ Handler = (*IncidentHandler)(nil)
	_ Handler = (*IncidentDivisionHandler)(nil)
)

// IncidentHandler maintains the rm_incident read model.
type IncidentHandler struct {
	pool *pgxpool.Pool
}

func NewIncidentHandler(pool *pgxpool.Pool) *IncidentHandler {
	return &IncidentHandler{pool: pool}
}

func (h *IncidentHandler) Name() string { return "rm_incident" }
func (h *IncidentHandler) Version() int { return 1 }
func (h *IncidentHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE rm_incident CASCADE`)
	return err
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

func (h *IncidentHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	db, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("rm_incident: no tx in context")
	}
	id := e.StreamID

	switch e.EventType {
	case "Opened":
		type opened struct {
			Name     string          `json:"name"`
			Location json.RawMessage `json:"location"`
		}
		var d opened
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `
			INSERT INTO rm_incident (id, name, location, is_closed, is_deleted, created_at, updated_at)
			VALUES ($1, $2, $3, false, false, $4, $4)
			ON CONFLICT (id) DO UPDATE
			  SET name = EXCLUDED.name, location = EXCLUDED.location,
			      updated_at = EXCLUDED.updated_at`,
			id, d.Name, nullableJSON(d.Location), e.OccurredAt)

	case "Imported":
		type imported struct {
			Name      string          `json:"name"`
			Location  json.RawMessage `json:"location"`
			ClosedAt  *string         `json:"closedAt"`
			DeletedAt *string         `json:"deletedAt"`
		}
		var d imported
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		// occurred_at == original created_at (set that way by the import migration).
		return exec(db, ctx, `
			INSERT INTO rm_incident
			  (id, name, location, is_closed, is_deleted, closed_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $7)
			ON CONFLICT (id) DO UPDATE
			  SET name = EXCLUDED.name, location = EXCLUDED.location,
			      is_closed = EXCLUDED.is_closed, is_deleted = EXCLUDED.is_deleted,
			      closed_at = EXCLUDED.closed_at, updated_at = EXCLUDED.updated_at`,
			id, d.Name, nullableJSON(d.Location), d.ClosedAt != nil, d.DeletedAt != nil,
			d.ClosedAt, e.OccurredAt)

	case "Renamed":
		type renamed struct {
			Name string `json:"name"`
		}
		var d renamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `UPDATE rm_incident SET name = $1, updated_at = $2 WHERE id = $3`,
			d.Name, e.OccurredAt, id)

	case "LocationChanged":
		type locationChanged struct {
			Location json.RawMessage `json:"location"`
		}
		var d locationChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `UPDATE rm_incident SET location = $1, updated_at = $2 WHERE id = $3`,
			nullableJSON(d.Location), e.OccurredAt, id)

	case "Closed":
		return exec(db, ctx, `
			UPDATE rm_incident SET is_closed = true, closed_at = $1, updated_at = $1 WHERE id = $2`,
			e.OccurredAt, id)

	case "Reopened":
		return exec(db, ctx, `
			UPDATE rm_incident SET is_closed = false, closed_at = NULL, updated_at = $1 WHERE id = $2`,
			e.OccurredAt, id)

	case "Deleted":
		return exec(db, ctx, `
			UPDATE rm_incident SET is_deleted = true, updated_at = $1 WHERE id = $2`,
			e.OccurredAt, id)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// IncidentDivisionHandler — rm_incident_division
// ──────────────────────────────────────────────────────────────────────────────

type IncidentDivisionHandler struct {
	pool *pgxpool.Pool
}

func NewIncidentDivisionHandler(pool *pgxpool.Pool) *IncidentDivisionHandler {
	return &IncidentDivisionHandler{pool: pool}
}

func (h *IncidentDivisionHandler) Name() string { return "rm_incident_division" }
func (h *IncidentDivisionHandler) Version() int { return 2 }
func (h *IncidentDivisionHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE rm_incident_division`)
	return err
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

func (h *IncidentDivisionHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	db, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("rm_incident_division: no tx in context")
	}
	incidentID := e.StreamID

	switch e.EventType {
	case "Opened", "Imported":
		type division struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		type withDivisions struct {
			Divisions []division `json:"divisions"`
		}
		var d withDivisions
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		for _, div := range d.Divisions {
			if err := exec(db, ctx, `
				INSERT INTO rm_incident_division (id, incident_id, name, description, removed_at)
				VALUES ($1, $2, $3, $4, NULL)
				ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
				div.ID, incidentID, div.Name, div.Description); err != nil {
				return err
			}
		}
		return nil

	case "DivisionAdded":
		type divisionAdded struct {
			Division struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"division"`
		}
		var d divisionAdded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `
			INSERT INTO rm_incident_division (id, incident_id, name, description, removed_at)
			VALUES ($1, $2, $3, $4, NULL)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
			d.Division.ID, incidentID, d.Division.Name, d.Division.Description)

	case "DivisionRenamed":
		type divisionRenamed struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		var d divisionRenamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `UPDATE rm_incident_division SET name = $1 WHERE id = $2`, d.Name, d.ID)

	case "DivisionRemoved":
		type divisionRemoved struct {
			ID string `json:"id"`
		}
		var d divisionRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(db, ctx, `UPDATE rm_incident_division SET removed_at = $1 WHERE id = $2`,
			e.OccurredAt, d.ID)
	}
	return nil
}
