package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const (
	messageMapAckBackfillSource   = "message-map-ack-backfill"
	messageMapAckBackfillMetadata = `{"actor":"system:migration","source":"message-map-ack-backfill"}`
)

// upBackfillMessageMapAcknowledgements mirrors the Postgres migration 00030: every
// historical message triaged to the Nachrichtenkarte is marked as acknowledged by it, so
// the operator does not face the whole backlog as "not yet drawn". Safe to rerun.
func upBackfillMessageMapAcknowledgements(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT stream_id FROM eventsourcing_events WHERE stream_type = 'Incident'`)
	if err != nil {
		return fmt.Errorf("ack backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var incidentIDs []string

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("ack backfill: scan incident: %w", err)
		}

		incidentIDs = append(incidentIDs, id)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("ack backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	for _, incidentID := range incidentIDs {
		incidentEvents, _, err := loadStreamEvents(ctx, tx, "Incident", incidentID)
		if err != nil {
			return fmt.Errorf("ack backfill: load incident %s: %w", incidentID, err)
		}

		divisionID, ok, err := messagemap.MessageMapDivisionID(incidentEvents)
		if err != nil {
			return fmt.Errorf("ack backfill: incident %s divisions: %w", incidentID, err)
		}

		if !ok {
			continue
		}

		if err := backfillIncidentAcknowledgements(ctx, tx, incidentID, divisionID); err != nil {
			return err
		}
	}

	return nil
}

func backfillIncidentAcknowledgements(ctx context.Context, tx *sql.Tx, incidentID, divisionID string) error {
	divID, err := shared.ParseDivisionID(divisionID)
	if err != nil {
		return fmt.Errorf("ack backfill: division id %q: %w", divisionID, err)
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id FROM eventsourcing_events
		WHERE stream_type = 'Message' AND version = 1 AND json_extract(data, '$.incidentId') = ?`, incidentID)
	if err != nil {
		return fmt.Errorf("ack backfill: list messages of incident %s: %w", incidentID, err)
	}
	defer func() { _ = rows.Close() }()

	var messageIDs []string

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("ack backfill: scan message: %w", err)
		}

		messageIDs = append(messageIDs, id)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("ack backfill: read messages: %w", err)
	}

	_ = rows.Close()

	for _, messageID := range messageIDs {
		events, maxVersion, err := loadStreamEvents(ctx, tx, "Message", messageID)
		if err != nil {
			return fmt.Errorf("ack backfill: load message %s: %w", messageID, err)
		}

		needs, err := messagemap.NeedsAcknowledgement(events, divisionID)
		if err != nil {
			return fmt.Errorf("ack backfill: message %s: %w", messageID, err)
		}

		if !needs {
			continue
		}

		var lastEvent string
		if err := tx.QueryRowContext(ctx, `
			SELECT MAX(occurred_at) FROM eventsourcing_events
			WHERE stream_type = 'Message' AND stream_id = ?`, messageID).Scan(&lastEvent); err != nil {
			return fmt.Errorf("ack backfill: last event of message %s: %w", messageID, err)
		}

		if err := appendEvent(ctx, tx, "Message", messageID, maxVersion+1, "DivisionAcknowledged",
			message.DivisionAcknowledged{DivisionID: divID, By: "system:migration"},
			messageMapAckBackfillMetadata, lastEvent); err != nil {
			return fmt.Errorf("ack backfill: acknowledge message %s: %w", messageID, err)
		}
	}

	return nil
}

func downBackfillMessageMapAcknowledgements(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_events WHERE json_extract(metadata, '$.source') = ?`,
		messageMapAckBackfillSource); err != nil {
		return fmt.Errorf("ack backfill: remove events: %w", err)
	}

	return nil
}
