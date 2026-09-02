package postgres

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.IncidentRetention = (*IncidentRetention)(nil)

// IncidentRetention archives incident-owned streams outside the live event log.
type IncidentRetention struct {
	pool *pgxpool.Pool
}

func NewIncidentRetention(pool *pgxpool.Pool) *IncidentRetention {
	return &IncidentRetention{pool: pool}
}

func (r *IncidentRetention) OpenBefore(ctx context.Context, before time.Time, limit int) ([]shared.IncidentID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM rm_incident
		WHERE is_closed = false AND is_deleted = false AND updated_at <= $1
		ORDER BY updated_at
		LIMIT $2`, before, limit)

	return scanIncidentIDs(rows, err)
}

func (r *IncidentRetention) ArchiveBefore(
	ctx context.Context,
	closedBefore, deletedBefore time.Time,
	limit int,
) ([]shared.IncidentID, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM rm_incident
		WHERE (is_deleted = false AND is_closed = true AND closed_at <= $1)
		   OR (is_deleted = true AND deleted_at <= $2)
		ORDER BY COALESCE(deleted_at, closed_at)
		LIMIT $3`, closedBefore, deletedBefore, limit)

	return scanIncidentIDs(rows, err)
}

func scanIncidentIDs(rows pgx.Rows, err error) ([]shared.IncidentID, error) {
	if err != nil {
		return nil, fmt.Errorf("retention candidates: %w", err)
	}

	defer rows.Close()

	var ids []shared.IncidentID

	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, shared.IncidentID(id))
	}

	return ids, rows.Err()
}

func (r *IncidentRetention) Archive(ctx context.Context, incidentID shared.IncidentID, archivedAt time.Time) error {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return fmt.Errorf("archive incident: %w", err)
	}

	id := uuid.UUID(incidentID)

	tag, err := tx.Exec(ctx, `INSERT INTO eventsourcing.archive_events
		SELECT e.stream_type,e.stream_id,e.version,e.event_type,e.data,e.metadata,e.occurred_at,e.recorded_at,e.xid,e.seq,$1
		FROM eventsourcing.events e JOIN eventsourcing.aggregate_index i USING (stream_type, stream_id)
		WHERE i.incident_id=$2 ON CONFLICT DO NOTHING`, archivedAt, id)
	if err != nil {
		return fmt.Errorf("archive events: %w", err)
	}

	archiveEvents := tag.RowsAffected()

	tag, err = tx.Exec(ctx, `INSERT INTO eventsourcing.archive_aggregate_index
		SELECT stream_type,stream_id,incident_id,$1 FROM eventsourcing.aggregate_index WHERE incident_id=$2 ON CONFLICT DO NOTHING`, archivedAt, id)
	if err != nil {
		return fmt.Errorf("archive index: %w", err)
	}

	archiveStreams := tag.RowsAffected()

	if _, err := tx.Exec(
		ctx,
		`INSERT INTO eventsourcing.archived_incidents (incident_id, archived_at, reason) VALUES ($1,$2,'PURGE') ON CONFLICT DO NOTHING`,
		id,
		archivedAt,
	); err != nil {
		return fmt.Errorf("archive audit: %w", err)
	}

	if _, err := tx.Exec(
		ctx,
		`DELETE FROM eventsourcing.events e USING eventsourcing.aggregate_index i WHERE e.stream_type=i.stream_type AND e.stream_id=i.stream_id AND i.incident_id=$1`,
		id,
	); err != nil {
		return fmt.Errorf("remove live events: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM eventsourcing.aggregate_index WHERE incident_id=$1`, id); err != nil {
		return fmt.Errorf("remove live index: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM eventsourcing.incident_counters WHERE incident_id=$1`, id); err != nil {
		return fmt.Errorf("remove message counter: %w", err)
	}

	slog.InfoContext(ctx, "archived incident event-store data",
		"incident_id", incidentID, "events", archiveEvents, "streams", archiveStreams)

	return nil
}
