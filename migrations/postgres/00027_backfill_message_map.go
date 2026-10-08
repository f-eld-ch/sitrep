package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const messageMapBackfillSource = "message-map-backfill"

// upBackfillMessageMap guarantees that every existing incident has a
// system-managed Nachrichtenkarte division and layer. Historical incidents stored
// them as ordinary entities with translated default labels; those are marked with
// the MESSAGE_MAP kind, and a new one is added when no match exists. It is safe
// to rerun: incidents that already have both are skipped.
func upBackfillMessageMap(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id, MIN(occurred_at)
		FROM eventsourcing.events
		WHERE stream_type = 'Incident'
		GROUP BY stream_id`)
	if err != nil {
		return fmt.Errorf("message map backfill: list incidents: %w", err)
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
			return fmt.Errorf("message map backfill: scan incident: %w", err)
		}

		incidents = append(incidents, r)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("message map backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	meta := map[string]any{"actor": "system:migration", "source": messageMapBackfillSource}

	for _, inc := range incidents {
		if err := backfillMessageMapDivision(ctx, tx, inc.id, inc.occurredAt, meta); err != nil {
			return err
		}

		if err := backfillMessageMapLayer(ctx, tx, inc.id, inc.occurredAt, meta); err != nil {
			return err
		}
	}

	return nil
}

func backfillMessageMapDivision(
	ctx context.Context, tx *sql.Tx, incidentID uuid.UUID, occurredAt time.Time, meta map[string]any,
) error {
	events, maxVersion, err := loadStreamEvents(ctx, tx, "Incident", incidentID)
	if err != nil {
		return fmt.Errorf("message map backfill: load incident %s: %w", incidentID, err)
	}

	plan, err := messagemap.PlanDivision(events)
	if err != nil {
		return fmt.Errorf("message map backfill: plan divisions for incident %s: %w", incidentID, err)
	}

	switch {
	case plan.None():
		return nil
	case plan.AssignKindTo != "":
		divID, err := shared.ParseDivisionID(plan.AssignKindTo)
		if err != nil {
			return fmt.Errorf("message map backfill: division id %q: %w", plan.AssignKindTo, err)
		}

		return appendEvent(ctx, tx, "Incident", incidentID, maxVersion+1, "DivisionKindAssigned",
			incident.DivisionKindAssigned{ID: divID, Kind: shared.DivisionKindMessageMap}, meta, occurredAt)
	default:
		return appendEvent(ctx, tx, "Incident", incidentID, maxVersion+1, "DivisionAdded",
			incident.DivisionAdded{Division: incident.DivisionData{
				ID:          incident.MessageMapDivisionID(shared.IncidentID(incidentID)),
				Name:        messagemap.FallbackDivisionName,
				Description: messagemap.FallbackDivisionDescription,
				Kind:        shared.DivisionKindMessageMap,
			}}, meta, occurredAt)
	}
}

func backfillMessageMapLayer(
	ctx context.Context, tx *sql.Tx, incidentID uuid.UUID, occurredAt time.Time, meta map[string]any,
) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT ai.stream_id
		FROM eventsourcing.aggregate_index ai
		JOIN eventsourcing.events e
		  ON e.stream_type = 'Layer' AND e.stream_id = ai.stream_id AND e.version = 1
		WHERE ai.stream_type = 'Layer' AND ai.incident_id = $1
		ORDER BY e.occurred_at, ai.stream_id`, incidentID)
	if err != nil {
		return fmt.Errorf("message map backfill: list layers for incident %s: %w", incidentID, err)
	}
	defer func() { _ = rows.Close() }()

	var layerIDs []uuid.UUID

	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("message map backfill: scan layer: %w", err)
		}

		layerIDs = append(layerIDs, id)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("message map backfill: read layers: %w", err)
	}

	_ = rows.Close()

	streams := make([]messagemap.LayerStream, 0, len(layerIDs))
	versions := make(map[string]int, len(layerIDs))

	for _, id := range layerIDs {
		events, maxVersion, err := loadStreamEvents(ctx, tx, "Layer", id)
		if err != nil {
			return fmt.Errorf("message map backfill: load layer %s: %w", id, err)
		}

		streams = append(streams, messagemap.LayerStream{ID: id.String(), Events: events})
		versions[id.String()] = maxVersion
	}

	plan, err := messagemap.PlanLayer(streams)
	if err != nil {
		return fmt.Errorf("message map backfill: plan layers for incident %s: %w", incidentID, err)
	}

	switch {
	case plan.None():
		return nil
	case plan.AssignKindTo != "":
		return appendEvent(ctx, tx, "Layer", uuid.MustParse(plan.AssignKindTo), versions[plan.AssignKindTo]+1,
			"KindAssigned", layer.KindAssigned{Kind: shared.LayerKindMessageMap}, meta, occurredAt)
	default:
		layerID := uuid.New()
		if err := appendEvent(ctx, tx, "Layer", layerID, 1, "Created", layer.Created{
			IncidentID: shared.IncidentID(incidentID),
			Name:       messagemap.FallbackLayerName,
			Kind:       shared.LayerKindMessageMap,
		}, meta, occurredAt); err != nil {
			return err
		}

		return indexStream(ctx, tx, "Layer", layerID, incidentID)
	}
}

func loadStreamEvents(
	ctx context.Context, tx *sql.Tx, streamType string, streamID uuid.UUID,
) ([]messagemap.Event, int, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT version, event_type, data
		FROM eventsourcing.events
		WHERE stream_type = $1 AND stream_id = $2
		ORDER BY version`, streamType, streamID)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()

	var (
		events     []messagemap.Event
		maxVersion int
	)

	for rows.Next() {
		var (
			version int
			typ     string
			data    []byte
		)
		if err := rows.Scan(&version, &typ, &data); err != nil {
			return nil, 0, err
		}

		maxVersion = version

		events = append(events, messagemap.Event{Type: typ, Data: data})
	}

	return events, maxVersion, rows.Err()
}

// downBackfillMessageMap removes the events written by the backfill.
func downBackfillMessageMap(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.aggregate_index ai
		WHERE ai.stream_type = 'Layer'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing.events e
			  WHERE e.stream_type = 'Layer'
			    AND e.stream_id = ai.stream_id
			    AND e.version = 1
			    AND e.metadata ->> 'source' = $1
		  )`, messageMapBackfillSource); err != nil {
		return fmt.Errorf("message map backfill: remove layer indexes: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events
		WHERE metadata ->> 'source' = $1`, messageMapBackfillSource); err != nil {
		return fmt.Errorf("message map backfill: remove events: %w", err)
	}

	return nil
}
