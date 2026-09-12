package projection

import (
	"context"
	"database/sql"
	"encoding/json/jsontext"
	"fmt"
	"time"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	_ Handler = (*IncidentHandler)(nil)
	_ Handler = (*IncidentDivisionHandler)(nil)
)

// ──────────────────────────────────────────────────────────────────────────────
// IncidentHandler — readmodel_incident
// ──────────────────────────────────────────────────────────────────────────────

type IncidentHandler struct{ db *sql.DB }

func NewIncidentHandler(db *sql.DB) *IncidentHandler { return &IncidentHandler{db: db} }

func (h *IncidentHandler) Name() string { return "readmodel.incident" }
func (h *IncidentHandler) Version() int { return 3 }
func (h *IncidentHandler) Reset(ctx context.Context) error {
	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_incident`)
	return err
}

func (h *IncidentHandler) Handles(st, t string) bool {
	if st != "Incident" {
		return false
	}

	switch t {
	case "Opened", "Renamed", "LocationChanged", "ParentLinked", "ParentUnlinked",
		"Closed", "Reopened", "Deleted", "Imported":
		return true
	}

	return false
}

func (h *IncidentHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.incident: no tx in context")
	}

	id := e.StreamID.String()

	switch e.EventType {
	case "Opened":
		type opened struct {
			Name     string         `json:"name"`
			Location jsontext.Value `json:"location"`
		}

		var d opened
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		now := sqlite.FormatTime(e.OccurredAt)

		return exec(tx, ctx, `
			INSERT INTO readmodel_incident (id, parent_id, name, location, is_closed, is_deleted, created_at, updated_at)
			VALUES (?, NULL, ?, ?, 0, 0, ?, ?)
			ON CONFLICT (id) DO UPDATE
			  SET parent_id = excluded.parent_id, name = excluded.name, location = excluded.location,
			      updated_at = excluded.updated_at`,
			id, d.Name, nullableJSON(d.Location), now, now)

	case "Imported":
		type imported struct {
			Name      string         `json:"name"`
			Location  jsontext.Value `json:"location"`
			ClosedAt  *string        `json:"closedAt"`
			DeletedAt *string        `json:"deletedAt"`
			UpdatedAt *time.Time     `json:"updatedAt,omitempty"`
		}

		var d imported
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		updatedAt := e.OccurredAt
		if d.UpdatedAt != nil {
			updatedAt = *d.UpdatedAt
		}

		closedNT, err := sqlite.ParseEventTime(d.ClosedAt)
		if err != nil {
			return err
		}

		deletedNT, err := sqlite.ParseEventTime(d.DeletedAt)
		if err != nil {
			return err
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_incident
			  (id, parent_id, name, location, is_closed, is_deleted, closed_at, deleted_at, created_at, updated_at)
			VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE
			  SET parent_id = excluded.parent_id, name = excluded.name, location = excluded.location,
			      is_closed = excluded.is_closed, is_deleted = excluded.is_deleted,
			      closed_at = excluded.closed_at, deleted_at = excluded.deleted_at,
			      updated_at = excluded.updated_at`,
			id, d.Name, nullableJSON(d.Location),
			btoi(d.ClosedAt != nil), btoi(d.DeletedAt != nil),
			&closedNT, &deletedNT,
			sqlite.FormatTime(e.OccurredAt), sqlite.FormatTime(updatedAt))

	case "Renamed":
		type renamed struct {
			Name string `json:"name"`
		}

		var d renamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_incident SET name = ?, updated_at = ? WHERE id = ?`,
			d.Name, sqlite.FormatTime(e.OccurredAt), id)

	case "LocationChanged":
		type locationChanged struct {
			Location jsontext.Value `json:"location"`
		}

		var d locationChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_incident SET location = ?, updated_at = ? WHERE id = ?`,
			nullableJSON(d.Location), sqlite.FormatTime(e.OccurredAt), id)

	case "ParentLinked":
		type parentLinked struct {
			ParentID string `json:"parentId"`
		}

		var d parentLinked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_incident SET parent_id = ?, updated_at = ? WHERE id = ?`,
			d.ParentID, sqlite.FormatTime(e.OccurredAt), id)

	case "ParentUnlinked":
		return exec(tx, ctx, `UPDATE readmodel_incident SET parent_id = NULL, updated_at = ? WHERE id = ?`,
			sqlite.FormatTime(e.OccurredAt), id)

	case "Closed":
		now := sqlite.FormatTime(e.OccurredAt)

		return exec(tx, ctx, `UPDATE readmodel_incident SET is_closed = 1, closed_at = ?, updated_at = ? WHERE id = ?`,
			now, now, id)

	case "Reopened":
		return exec(
			tx,
			ctx,
			`UPDATE readmodel_incident SET is_closed = 0, closed_at = NULL, updated_at = ? WHERE id = ?`,
			sqlite.FormatTime(e.OccurredAt),
			id,
		)

	case "Deleted":
		now := sqlite.FormatTime(e.OccurredAt)

		return exec(
			tx,
			ctx,
			`UPDATE readmodel_incident SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
			now,
			now,
			id,
		)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// IncidentDivisionHandler — readmodel_incident_division
// ──────────────────────────────────────────────────────────────────────────────

type IncidentDivisionHandler struct{ db *sql.DB }

func NewIncidentDivisionHandler(db *sql.DB) *IncidentDivisionHandler {
	return &IncidentDivisionHandler{db: db}
}

func (h *IncidentDivisionHandler) Name() string { return "readmodel.incident_division" }
func (h *IncidentDivisionHandler) Version() int { return 2 }
func (h *IncidentDivisionHandler) Reset(ctx context.Context) error {
	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_incident_division`)
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
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.incident_division: no tx in context")
	}

	incidentID := e.StreamID.String()

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
			if err := exec(tx, ctx, `
				INSERT INTO readmodel_incident_division (id, incident_id, name, description, removed_at)
				VALUES (?, ?, ?, ?, NULL)
				ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description`,
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

		return exec(tx, ctx, `
			INSERT INTO readmodel_incident_division (id, incident_id, name, description, removed_at)
			VALUES (?, ?, ?, ?, NULL)
			ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description`,
			d.Division.ID, incidentID, d.Division.Name, d.Division.Description)

	case "DivisionRenamed":
		type divisionRenamed struct {
			ID          string  `json:"id"`
			Name        string  `json:"name"`
			Description *string `json:"description,omitempty"`
		}

		var d divisionRenamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if d.Description != nil {
			return exec(tx, ctx, `UPDATE readmodel_incident_division SET name = ?, description = ? WHERE id = ?`,
				d.Name, *d.Description, d.ID)
		}

		return exec(tx, ctx, `UPDATE readmodel_incident_division SET name = ? WHERE id = ?`, d.Name, d.ID)

	case "DivisionRemoved":
		type divisionRemoved struct {
			ID string `json:"id"`
		}

		var d divisionRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_incident_division SET removed_at = ? WHERE id = ?`,
			sqlite.FormatTime(e.OccurredAt), d.ID)
	}

	return nil
}
