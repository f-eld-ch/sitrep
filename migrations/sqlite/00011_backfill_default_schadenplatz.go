package sqlite

import (
	"context"
	"database/sql"
	"encoding/json/v2"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

type incidentBackfillRow struct {
	id         string
	occurredAt string
}

func upBackfillDefaultSchadenplatz(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT e.stream_id, MIN(e.occurred_at)
		FROM eventsourcing_events e
		WHERE e.stream_type = 'Incident'
		  AND NOT EXISTS (
			  SELECT 1 FROM eventsourcing_events x
			  WHERE x.stream_type = 'Incident'
			    AND x.stream_id = e.stream_id
			    AND x.event_type = 'DefaultSchadenplatzLinked'
		  )
		GROUP BY e.stream_id`)
	if err != nil {
		return fmt.Errorf("schadenplatz backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var incidents []incidentBackfillRow
	for rows.Next() {
		var row incidentBackfillRow
		if err := rows.Scan(&row.id, &row.occurredAt); err != nil {
			return fmt.Errorf("schadenplatz backfill: scan incident: %w", err)
		}
		incidents = append(incidents, row)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("schadenplatz backfill: read incidents: %w", err)
	}

	metadata := `{"actor":"system:migration","source":"schadenplatz-backfill"}`
	for _, inc := range incidents {
		spID := uuid.New()
		created := schadenplatz.Created{
			IncidentID: shared.IncidentID(uuid.MustParse(inc.id)),
			Name:       "Allgemein",
			IsDefault:  true,
		}

		if err := appendEvent(
			ctx,
			tx,
			"Schadenplatz",
			spID.String(),
			1,
			"Created",
			created,
			metadata,
			inc.occurredAt,
		); err != nil {
			return fmt.Errorf("schadenplatz backfill: create for incident %s: %w", inc.id, err)
		}
		if err := indexStream(ctx, tx, "Schadenplatz", spID.String(), inc.id); err != nil {
			return fmt.Errorf("schadenplatz backfill: index for incident %s: %w", inc.id, err)
		}

		var maxVersion int
		if err := tx.QueryRowContext(ctx, `
			SELECT COALESCE(MAX(version), 0)
			FROM eventsourcing_events
			WHERE stream_type = 'Incident' AND stream_id = ?`, inc.id).Scan(&maxVersion); err != nil {
			return fmt.Errorf("schadenplatz backfill: max version for incident %s: %w", inc.id, err)
		}

		linked := incident.DefaultSchadenplatzLinked{
			SchadenplatzID: shared.SchadenplatzID(spID),
		}
		if err := appendEvent(
			ctx,
			tx,
			"Incident",
			inc.id,
			maxVersion+1,
			"DefaultSchadenplatzLinked",
			linked,
			metadata,
			inc.occurredAt,
		); err != nil {
			return fmt.Errorf("schadenplatz backfill: link for incident %s: %w", inc.id, err)
		}
	}

	return nil
}

func downBackfillDefaultSchadenplatz(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_aggregate_index
		WHERE stream_type = 'Schadenplatz'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing_events e
			  WHERE e.stream_type = 'Schadenplatz'
			    AND e.stream_id = eventsourcing_aggregate_index.stream_id
			    AND json_extract(e.metadata, '$.source') = 'schadenplatz-backfill'
		  )`); err != nil {
		return fmt.Errorf("schadenplatz backfill: remove indexes: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_events
		WHERE json_extract(metadata, '$.source') = 'schadenplatz-backfill'`); err != nil {
		return fmt.Errorf("schadenplatz backfill: remove events: %w", err)
	}

	return nil
}

func appendEvent(
	ctx context.Context,
	tx *sql.Tx,
	streamType, streamID string,
	version int,
	eventType string,
	data any,
	metadata string,
	occurredAt string,
) error {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal event data: %w", err)
	}

	recordedAt := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO eventsourcing_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		streamType, streamID, version, eventType, string(dataBytes), metadata, occurredAt, recordedAt)

	return err
}

func indexStream(ctx context.Context, tx *sql.Tx, streamType, streamID, incidentID string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO eventsourcing_aggregate_index (stream_type, stream_id, incident_id)
		VALUES (?, ?, ?)`, streamType, streamID, incidentID)

	return err
}
