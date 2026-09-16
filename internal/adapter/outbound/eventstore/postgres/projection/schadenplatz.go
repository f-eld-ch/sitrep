package projection

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*SchadenplatzHandler)(nil)

// SchadenplatzHandler maintains the readmodel.schadenplatz read model.
type SchadenplatzHandler struct {
	pool *pgxpool.Pool
}

func NewSchadenplatzHandler(pool *pgxpool.Pool) *SchadenplatzHandler {
	return &SchadenplatzHandler{pool: pool}
}

func (h *SchadenplatzHandler) Name() string { return "readmodel.schadenplatz" }
func (h *SchadenplatzHandler) Version() int { return 1 }
func (h *SchadenplatzHandler) Reset(ctx context.Context) error {
	if _, err := h.pool.Exec(ctx, `TRUNCATE readmodel.message_casualties`); err != nil {
		return err
	}

	_, err := h.pool.Exec(ctx, `TRUNCATE readmodel.schadenplatz`)

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
	db, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.schadenplatz: no tx in context")
	}

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

		return exec(db, ctx, `
			INSERT INTO readmodel.schadenplatz
			  (id, incident_id, name, is_default, geojson, vermisste, tote, verletzte, obdachlose, eingeschlossene,
			   is_merged, merged_into, created_at, updated_at)
			VALUES ($1, $2, $3, $4, NULL, 0, 0, 0, 0, 0, false, NULL, $5, $5)
			ON CONFLICT (id) DO UPDATE
			  SET incident_id = EXCLUDED.incident_id, name = EXCLUDED.name,
			      is_default = EXCLUDED.is_default, updated_at = EXCLUDED.updated_at`,
			id, d.IncidentID, d.Name, d.IsDefault, e.OccurredAt)

	case "Renamed":
		var d struct {
			Name string `json:"name"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(db, ctx, `UPDATE readmodel.schadenplatz SET name = $1, updated_at = $2 WHERE id = $3`,
			d.Name, e.OccurredAt, id)

	case "GeometrySet":
		var d struct {
			GeoJSON []byte `json:"geoJson"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		// nil GeoJSON clears the column.
		var geoJSON any
		if len(d.GeoJSON) > 0 {
			geoJSON = d.GeoJSON
		}

		return exec(db, ctx, `UPDATE readmodel.schadenplatz SET geojson = $1, updated_at = $2 WHERE id = $3`,
			geoJSON, e.OccurredAt, id)

	case "CasualtiesRecorded":
		var d struct {
			SourceMessageID string `json:"sourceMessageId"`
			Deltas          struct {
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

		// Read existing per-message record to compute net delta.
		var oldV, oldT, oldVl, oldO, oldE int

		scanErr := db.QueryRow(ctx, `
			SELECT vermisste, tote, verletzte, obdachlose, eingeschlossene
			FROM readmodel.message_casualties
			WHERE message_id = $1 AND schadenplatz_id = $2`,
			d.SourceMessageID, id).Scan(&oldV, &oldT, &oldVl, &oldO, &oldE)
		if scanErr != nil && !errors.Is(scanErr, pgx.ErrNoRows) {
			return scanErr
		}

		netV := d.Deltas.Vermisste - oldV
		netT := d.Deltas.Tote - oldT
		netVl := d.Deltas.Verletzte - oldVl
		netO := d.Deltas.Obdachlose - oldO
		netE := d.Deltas.Eingeschlossene - oldE

		if err := exec(db, ctx, `
			UPDATE readmodel.schadenplatz SET
			  vermisste        = vermisste        + $1,
			  tote             = tote             + $2,
			  verletzte        = verletzte        + $3,
			  obdachlose       = obdachlose       + $4,
			  eingeschlossene  = eingeschlossene  + $5,
			  updated_at       = $6
			WHERE id = $7`,
			netV, netT, netVl, netO, netE, e.OccurredAt, id); err != nil {
			return err
		}

		return exec(db, ctx, `
			INSERT INTO readmodel.message_casualties
			  (message_id, schadenplatz_id, vermisste, tote, verletzte, obdachlose, eingeschlossene, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (message_id, schadenplatz_id) DO UPDATE SET
			  vermisste = EXCLUDED.vermisste, tote = EXCLUDED.tote,
			  verletzte = EXCLUDED.verletzte, obdachlose = EXCLUDED.obdachlose,
			  eingeschlossene = EXCLUDED.eingeschlossene, updated_at = EXCLUDED.updated_at`,
			d.SourceMessageID, id,
			d.Deltas.Vermisste, d.Deltas.Tote, d.Deltas.Verletzte,
			d.Deltas.Obdachlose, d.Deltas.Eingeschlossene, e.OccurredAt)

	case "MergedIntoDefault":
		var d struct {
			DefaultSchadenplatzID string `json:"defaultSchadenplatzId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(db, ctx, `
			UPDATE readmodel.schadenplatz
			SET is_merged = true, merged_into = $1, updated_at = $2
			WHERE id = $3`,
			d.DefaultSchadenplatzID, e.OccurredAt, id)
	}

	return nil
}
