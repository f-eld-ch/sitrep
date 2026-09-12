package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.IncidentRetention = (*IncidentRetention)(nil)

// IncidentRetention archives incident-owned streams outside the live event log.
//
// NOTE: Archive deletes events, including the tail of the log. This is why
// eventsourcing_events uses AUTOINCREMENT — without it, reused rowids would
// land behind the projector checkpoint and those events would never be read.
// See migrations/sqlite/00001_eventsourcing.sql for the full explanation.
type IncidentRetention struct {
	read *sql.DB
}

func NewIncidentRetention(read *sql.DB) *IncidentRetention {
	return &IncidentRetention{read: read}
}

func (r *IncidentRetention) OpenBefore(ctx context.Context, before time.Time, limit int) ([]shared.IncidentID, error) {
	rows, err := r.read.QueryContext(ctx, `
		SELECT id FROM readmodel_incident
		WHERE is_closed = 0 AND is_deleted = 0 AND updated_at <= ?
		ORDER BY updated_at
		LIMIT ?`,
		sqlite.FormatTime(before), limit)

	return scanIncidentIDs(rows, err)
}

func (r *IncidentRetention) ArchiveBefore(
	ctx context.Context,
	closedBefore, deletedBefore time.Time,
	limit int,
) ([]shared.IncidentID, error) {
	rows, err := r.read.QueryContext(ctx, `
		SELECT id FROM readmodel_incident
		WHERE (is_deleted = 0 AND is_closed = 1 AND closed_at <= ?)
		   OR (is_deleted = 1 AND deleted_at <= ?)
		ORDER BY COALESCE(deleted_at, closed_at)
		LIMIT ?`,
		sqlite.FormatTime(closedBefore), sqlite.FormatTime(deletedBefore), limit)

	return scanIncidentIDs(rows, err)
}

func scanIncidentIDs(rows *sql.Rows, err error) ([]shared.IncidentID, error) {
	if err != nil {
		return nil, fmt.Errorf("retention candidates: %w", err)
	}

	defer func() { _ = rows.Close() }()

	var ids []shared.IncidentID

	for rows.Next() {
		var idStr string

		if err := rows.Scan(&idStr); err != nil {
			return nil, err
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("retention: parse id %q: %w", idStr, err)
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

	id := uuid.UUID(incidentID).String()
	archivedAtStr := sqlite.FormatTime(archivedAt)

	res, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO eventsourcing_archive_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at, archived_at)
		SELECT e.stream_type, e.stream_id, e.version, e.event_type, e.data, e.metadata, e.occurred_at, e.recorded_at, ?
		  FROM eventsourcing_events e
		  JOIN eventsourcing_aggregate_index i USING (stream_type, stream_id)
		 WHERE i.incident_id = ?`,
		archivedAtStr, id)
	if err != nil {
		return fmt.Errorf("archive events: %w", err)
	}

	archiveEvents, _ := res.RowsAffected()

	res, err = tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO eventsourcing_archive_aggregate_index (stream_type, stream_id, incident_id, archived_at)
		SELECT stream_type, stream_id, incident_id, ?
		  FROM eventsourcing_aggregate_index
		 WHERE incident_id = ?`,
		archivedAtStr, id)
	if err != nil {
		return fmt.Errorf("archive index: %w", err)
	}

	archiveStreams, _ := res.RowsAffected()

	if _, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO eventsourcing_archived_incidents (incident_id, archived_at, reason)
		VALUES (?, ?, 'PURGE')`,
		id, archivedAtStr,
	); err != nil {
		return fmt.Errorf("archive audit: %w", err)
	}

	// Row-value IN is the SQLite equivalent of DELETE … USING in Postgres.
	// Cross-reference: this DELETE is why AUTOINCREMENT is mandatory on
	// eventsourcing_events — see migrations/sqlite/00001_eventsourcing.sql.
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_events
		 WHERE (stream_type, stream_id) IN (
		       SELECT stream_type, stream_id
		         FROM eventsourcing_aggregate_index
		        WHERE incident_id = ?
		 )`,
		id,
	); err != nil {
		return fmt.Errorf("remove live events: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM eventsourcing_aggregate_index WHERE incident_id = ?`,
		id,
	); err != nil {
		return fmt.Errorf("remove live index: %w", err)
	}

	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM eventsourcing_incident_counters WHERE incident_id = ?`,
		id,
	); err != nil {
		return fmt.Errorf("remove message counter: %w", err)
	}

	slog.InfoContext(ctx, "archived incident event-store data",
		slog.String("incident_id", incidentID.String()),
		slog.Int64("events", archiveEvents),
		slog.Int64("streams", archiveStreams))

	return nil
}
