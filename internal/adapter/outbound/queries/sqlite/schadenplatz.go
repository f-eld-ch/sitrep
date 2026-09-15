package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"

	sqliteh "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func (q *Queries) GetSchadenplatz(ctx context.Context, id uuid.UUID) (*outbound.SchadenplatzRM, error) {
	row := q.db.QueryRowContext(ctx, `
		SELECT id, incident_id, name, is_default, geojson,
		       vermisste, tote, verletzte, obdachlose, eingeschlossene,
		       is_merged, merged_into, created_at, updated_at
		FROM readmodel_schadenplatz
		WHERE id = ?`, id.String())

	rm, err := scanSchadenplatz(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, shared.ErrNotFound
	}

	return rm, err
}

func (q *Queries) ListSchadenplaetze(ctx context.Context, incidentID uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, incident_id, name, is_default, geojson,
		       vermisste, tote, verletzte, obdachlose, eingeschlossene,
		       is_merged, merged_into, created_at, updated_at
		FROM readmodel_schadenplatz
		WHERE incident_id = ? AND is_merged = 0
		ORDER BY is_default DESC, name ASC`, incidentID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*outbound.SchadenplatzRM

	for rows.Next() {
		rm, err := scanSchadenplatz(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, rm)
	}

	return out, rows.Err()
}

// spScanner is satisfied by both *sql.Row and *sql.Rows.
type spScanner interface {
	Scan(dest ...any) error
}

func scanSchadenplatz(s spScanner) (*outbound.SchadenplatzRM, error) {
	var (
		rm            outbound.SchadenplatzRM
		idStr         string
		incidentIDStr string
		geojson       sql.NullString
		mergedIntoStr sql.NullString
		isMergedInt   int
		isDefaultInt  int
		createdAt     sqliteh.Time
		updatedAt     sqliteh.Time
	)

	if err := s.Scan(
		&idStr, &incidentIDStr, &rm.Name, &isDefaultInt, &geojson,
		&rm.Casualties.Vermisste, &rm.Casualties.Tote, &rm.Casualties.Verletzte,
		&rm.Casualties.Obdachlose, &rm.Casualties.Eingeschlossene,
		&isMergedInt, &mergedIntoStr, &createdAt, &updatedAt,
	); err != nil {
		return nil, err
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil, err
	}

	incidentID, err := uuid.Parse(incidentIDStr)
	if err != nil {
		return nil, err
	}

	rm.ID = id
	rm.IncidentID = incidentID
	rm.IsDefault = isDefaultInt != 0
	rm.IsMerged = isMergedInt != 0

	if geojson.Valid && geojson.String != "" {
		rm.GeoJSON = []byte(geojson.String)
	}

	if mergedIntoStr.Valid && mergedIntoStr.String != "" {
		mid, err := uuid.Parse(mergedIntoStr.String)
		if err != nil {
			return nil, err
		}

		rm.MergedInto = &mid
	}

	rm.CreatedAt = createdAt.V
	rm.UpdatedAt = updatedAt.V

	return &rm, nil
}
