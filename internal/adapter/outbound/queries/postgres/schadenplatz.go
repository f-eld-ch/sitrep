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

func (q *Queries) ListAllSchadenplaetze(ctx context.Context, incidentID uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, name, is_default, geojson,
		       vermisste, tote, verletzte, obdachlose, eingeschlossene,
		       is_merged, merged_into, created_at, updated_at
		FROM readmodel.schadenplatz
		WHERE incident_id = $1
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

func (q *Queries) ListMessageCasualties(
	ctx context.Context,
	messageID uuid.UUID,
) ([]*outbound.MessageCasualtyRM, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT message_id, schadenplatz_id, vermisste, tote, verletzte, obdachlose, eingeschlossene
		FROM readmodel.message_casualties
		WHERE message_id = $1`, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*outbound.MessageCasualtyRM

	for rows.Next() {
		var rm outbound.MessageCasualtyRM
		if err := rows.Scan(
			&rm.MessageID,
			&rm.SchadenplatzID,
			&rm.Vermisste,
			&rm.Tote,
			&rm.Verletzte,
			&rm.Obdachlose,
			&rm.Eingeschlossene,
		); err != nil {
			return nil, err
		}

		out = append(out, &rm)
	}

	return out, rows.Err()
}

func (q *Queries) HasCasualtyRecords(ctx context.Context, incidentID uuid.UUID) (bool, error) {
	var found bool

	// The non-zero predicate must stay identical to the partial index
	// idx_rm_message_casualties_schadenplatz_nonzero (migration 00027), or it is not used.
	err := q.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM readmodel.message_casualties mc
			JOIN readmodel.schadenplatz sp ON sp.id = mc.schadenplatz_id
			WHERE sp.incident_id = $1
			  AND (mc.vermisste <> 0 OR mc.tote <> 0 OR mc.verletzte <> 0
			       OR mc.obdachlose <> 0 OR mc.eingeschlossene <> 0)
		)`, incidentID).Scan(&found)

	return found, err
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
