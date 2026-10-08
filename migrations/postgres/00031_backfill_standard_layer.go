package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const standardLayerBackfillSource = "standard-layer-backfill"

// upBackfillStandardLayer gives every incident without a regular layer one ("Lage").
// Incidents created before the message map layer became read-only outside a message often
// had the Nachrichtenkarte as their only drawing layer; without a regular layer they could
// no longer be drawn on freely. Safe to rerun: incidents with a regular layer are skipped.
func upBackfillStandardLayer(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id, MIN(occurred_at)
		FROM eventsourcing.events
		WHERE stream_type = 'Incident'
		GROUP BY stream_id`)
	if err != nil {
		return fmt.Errorf("standard layer backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	type incidentRow struct {
		id         uuid.UUID
		occurredAt time.Time
	}

	var incidents []incidentRow

	for rows.Next() {
		var r incidentRow
		if err := rows.Scan(&r.id, &r.occurredAt); err != nil {
			return fmt.Errorf("standard layer backfill: scan incident: %w", err)
		}

		incidents = append(incidents, r)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("standard layer backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	meta := map[string]any{"actor": "system:migration", "source": standardLayerBackfillSource}

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

		layerID := uuid.New()
		if err := appendEvent(ctx, tx, "Layer", layerID, 1, "Created", layer.Created{
			IncidentID: shared.IncidentID(inc.id),
			Name:       messagemap.FallbackStandardLayerName,
		}, meta, inc.occurredAt); err != nil {
			return fmt.Errorf("standard layer backfill: create for incident %s: %w", inc.id, err)
		}

		if err := indexStream(ctx, tx, "Layer", layerID, inc.id); err != nil {
			return fmt.Errorf("standard layer backfill: index for incident %s: %w", inc.id, err)
		}
	}

	return nil
}

// loadLayerStreams returns the event history of every layer stream of an incident.
func loadLayerStreams(ctx context.Context, tx *sql.Tx, incidentID uuid.UUID) ([]messagemap.LayerStream, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id FROM eventsourcing.events
		WHERE stream_type = 'Layer' AND version = 1 AND data ->> 'incidentId' = $1
		ORDER BY occurred_at, stream_id`, incidentID.String())
	if err != nil {
		return nil, fmt.Errorf("standard layer backfill: list layers of incident %s: %w", incidentID, err)
	}
	defer func() { _ = rows.Close() }()

	var ids []uuid.UUID

	for rows.Next() {
		var id uuid.UUID
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

		streams = append(streams, messagemap.LayerStream{ID: id.String(), Events: events})
	}

	return streams, nil
}

func downBackfillStandardLayer(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.aggregate_index ai
		WHERE ai.stream_type = 'Layer'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing.events e
			  WHERE e.stream_type = 'Layer' AND e.stream_id = ai.stream_id AND e.version = 1
			    AND e.metadata ->> 'source' = $1
		  )`, standardLayerBackfillSource); err != nil {
		return fmt.Errorf("standard layer backfill: remove indexes: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events WHERE metadata ->> 'source' = $1`,
		standardLayerBackfillSource); err != nil {
		return fmt.Errorf("standard layer backfill: remove events: %w", err)
	}

	return nil
}
