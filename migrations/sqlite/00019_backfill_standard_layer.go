package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const (
	standardLayerBackfillSource   = "standard-layer-backfill"
	standardLayerBackfillMetadata = `{"actor":"system:migration","source":"standard-layer-backfill"}`
)

// upBackfillStandardLayer mirrors the Postgres migration 00031: every incident without a
// regular layer gets one ("Lage"), because the Nachrichtenkarte layer is read-only outside
// a message. Safe to rerun.
func upBackfillStandardLayer(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id, MIN(occurred_at)
		FROM eventsourcing_events
		WHERE stream_type = 'Incident'
		GROUP BY stream_id`)
	if err != nil {
		return fmt.Errorf("standard layer backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var incidents []incidentBackfillRow

	for rows.Next() {
		var r incidentBackfillRow
		if err := rows.Scan(&r.id, &r.occurredAt); err != nil {
			return fmt.Errorf("standard layer backfill: scan incident: %w", err)
		}

		incidents = append(incidents, r)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("standard layer backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	for _, inc := range incidents {
		streams, err := loadLayerStreams(ctx, tx, inc.id)
		if err != nil {
			return err
		}

		needs, err := messagemap.NeedsStandardLayer(streams)
		if err != nil {
			return fmt.Errorf("standard layer backfill: incident %s: %w", inc.id, err)
		}

		if !needs {
			continue
		}

		layerID := uuid.NewString()
		if err := appendEvent(ctx, tx, "Layer", layerID, 1, "Created", layer.Created{
			IncidentID: shared.IncidentID(uuid.MustParse(inc.id)),
			Name:       messagemap.FallbackStandardLayerName,
		}, standardLayerBackfillMetadata, inc.occurredAt); err != nil {
			return fmt.Errorf("standard layer backfill: create for incident %s: %w", inc.id, err)
		}

		if err := indexStream(ctx, tx, "Layer", layerID, inc.id); err != nil {
			return fmt.Errorf("standard layer backfill: index for incident %s: %w", inc.id, err)
		}
	}

	return nil
}

// loadLayerStreams returns the event history of every layer stream of an incident.
func loadLayerStreams(ctx context.Context, tx *sql.Tx, incidentID string) ([]messagemap.LayerStream, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id FROM eventsourcing_events
		WHERE stream_type = 'Layer' AND version = 1 AND json_extract(data, '$.incidentId') = ?
		ORDER BY occurred_at, stream_id`, incidentID)
	if err != nil {
		return nil, fmt.Errorf("standard layer backfill: list layers of incident %s: %w", incidentID, err)
	}
	defer func() { _ = rows.Close() }()

	var ids []string

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("standard layer backfill: scan layer: %w", err)
		}

		ids = append(ids, id)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("standard layer backfill: read layers: %w", err)
	}

	_ = rows.Close()

	streams := make([]messagemap.LayerStream, 0, len(ids))

	for _, id := range ids {
		events, _, err := loadStreamEvents(ctx, tx, "Layer", id)
		if err != nil {
			return nil, fmt.Errorf("standard layer backfill: load layer %s: %w", id, err)
		}

		streams = append(streams, messagemap.LayerStream{ID: id, Events: events})
	}

	return streams, nil
}

func downBackfillStandardLayer(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_aggregate_index
		WHERE stream_type = 'Layer'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing_events e
			  WHERE e.stream_type = 'Layer' AND e.stream_id = eventsourcing_aggregate_index.stream_id
			    AND e.version = 1 AND json_extract(e.metadata, '$.source') = ?
		  )`, standardLayerBackfillSource); err != nil {
		return fmt.Errorf("standard layer backfill: remove indexes: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_events WHERE json_extract(metadata, '$.source') = ?`,
		standardLayerBackfillSource); err != nil {
		return fmt.Errorf("standard layer backfill: remove events: %w", err)
	}

	return nil
}
