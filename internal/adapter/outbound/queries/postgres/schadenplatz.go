package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func (q *Queries) GetSchadenplatz(ctx context.Context, id uuid.UUID) (*outbound.SchadenplatzRM, error) {
	row := q.pool.QueryRow(ctx, `
		SELECT id, incident_id, name, is_default, geojson,
		       vermisste, tote, verletzte, obdachlose, eingeschlossene,
		       is_merged, merged_into, created_at, updated_at
		FROM readmodel.schadenplatz
		WHERE id = $1`, id)

	rm, err := scanPgSchadenplatz(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}

	return rm, err
}

func (q *Queries) ListSchadenplaetze(ctx context.Context, incidentID uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, name, is_default, geojson,
		       vermisste, tote, verletzte, obdachlose, eingeschlossene,
		       is_merged, merged_into, created_at, updated_at
		FROM readmodel.schadenplatz
		WHERE incident_id = $1 AND is_merged = false
		ORDER BY is_default DESC, name ASC`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*outbound.SchadenplatzRM

	for rows.Next() {
		rm, err := scanPgSchadenplatz(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, rm)
	}

	return out, rows.Err()
}

func scanPgSchadenplatz(s incidentScanner) (*outbound.SchadenplatzRM, error) {
	var (
		rm         outbound.SchadenplatzRM
		geojson    []byte
		mergedInto *uuid.UUID
		createdAt  time.Time
		updatedAt  time.Time
	)

	if err := s.Scan(
		&rm.ID, &rm.IncidentID, &rm.Name, &rm.IsDefault, &geojson,
		&rm.Casualties.Vermisste, &rm.Casualties.Tote, &rm.Casualties.Verletzte,
		&rm.Casualties.Obdachlose, &rm.Casualties.Eingeschlossene,
		&rm.IsMerged, &mergedInto, &createdAt, &updatedAt,
	); err != nil {
		return nil, err
	}

	rm.GeoJSON = geojson
	rm.MergedInto = mergedInto
	rm.CreatedAt = createdAt.UTC()
	rm.UpdatedAt = updatedAt.UTC()

	return &rm, nil
}
