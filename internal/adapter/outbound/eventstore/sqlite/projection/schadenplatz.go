package projection

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*SchadenplatzHandler)(nil)

// SchadenplatzHandler maintains the readmodel_schadenplatz read model in SQLite.
type SchadenplatzHandler struct{ db *sql.DB }

func NewSchadenplatzHandler(db *sql.DB) *SchadenplatzHandler {
	return &SchadenplatzHandler{db: db}
}

func (h *SchadenplatzHandler) Name() string { return "readmodel.schadenplatz" }
func (h *SchadenplatzHandler) Version() int { return 1 }
func (h *SchadenplatzHandler) Reset(ctx context.Context) error {
	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_schadenplatz`)
	return err
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

func (h *SchadenplatzHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.schadenplatz: no tx in context")
	}

	id := e.StreamID.String()
	now := sqlite.FormatTime(e.OccurredAt)

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

		return exec(tx, ctx, `
			INSERT INTO readmodel_schadenplatz
			  (id, incident_id, name, is_default, geojson, vermisste, tote, verletzte, obdachlose, eingeschlossene,
			   is_merged, merged_into, created_at, updated_at)
			VALUES (?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, 0, NULL, ?, ?)
			ON CONFLICT (id) DO UPDATE
			  SET incident_id = excluded.incident_id, name = excluded.name,
			      is_default = excluded.is_default, updated_at = excluded.updated_at`,
			id, d.IncidentID, d.Name, btoi(d.IsDefault), now, now)

	case "Renamed":
		var d struct {
			Name string `json:"name"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_schadenplatz SET name = ?, updated_at = ? WHERE id = ?`,
			d.Name, now, id)

	case "GeometrySet":
		var d struct {
			GeoJSON []byte `json:"geoJson"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		var geoJSON any
		if len(d.GeoJSON) > 0 {
			geoJSON = string(d.GeoJSON)
		}

		return exec(tx, ctx, `UPDATE readmodel_schadenplatz SET geojson = ?, updated_at = ? WHERE id = ?`,
			geoJSON, now, id)

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

		return exec(tx, ctx, `
			UPDATE readmodel_schadenplatz SET
			  vermisste        = vermisste        + ?,
			  tote             = tote             + ?,
			  verletzte        = verletzte        + ?,
			  obdachlose       = obdachlose       + ?,
			  eingeschlossene  = eingeschlossene  + ?,
			  updated_at       = ?
			WHERE id = ?`,
			d.Deltas.Vermisste, d.Deltas.Tote, d.Deltas.Verletzte,
			d.Deltas.Obdachlose, d.Deltas.Eingeschlossene,
			now, id)

	case "MergedIntoDefault":
		var d struct {
			DefaultSchadenplatzID string `json:"defaultSchadenplatzId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_schadenplatz SET is_merged = 1, merged_into = ?, updated_at = ? WHERE id = ?`,
			d.DefaultSchadenplatzID, now, id)
	}

	return nil
}
