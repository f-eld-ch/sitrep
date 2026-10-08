package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const (
	messageMapBackfillSource   = "message-map-backfill"
	messageMapBackfillMetadata = `{"actor":"system:migration","source":"message-map-backfill"}`
)

// upBackfillMessageMap mirrors the Postgres migration 00027: every existing
// incident gets a system-managed Nachrichtenkarte division and layer, reusing an
// ordinary entity with a translated default label when one exists. Safe to rerun.
func upBackfillMessageMap(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id, MIN(occurred_at)
		FROM eventsourcing_events
		WHERE stream_type = 'Incident'
		GROUP BY stream_id`)
	if err != nil {
		return fmt.Errorf("message map backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var incidents []incidentBackfillRow

	for rows.Next() {
		var r incidentBackfillRow
		if err := rows.Scan(&r.id, &r.occurredAt); err != nil {
			return fmt.Errorf("message map backfill: scan incident: %w", err)
		}

		incidents = append(incidents, r)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("message map backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	for _, inc := range incidents {
		if err := backfillMessageMapDivision(ctx, tx, inc); err != nil {
			return err
		}

		if err := backfillMessageMapLayer(ctx, tx, inc); err != nil {
			return err
		}
	}

	return nil
}

func backfillMessageMapDivision(ctx context.Context, tx *sql.Tx, inc incidentBackfillRow) error {
	events, maxVersion, err := loadStreamEvents(ctx, tx, "Incident", inc.id)
	if err != nil {
		return fmt.Errorf("message map backfill: load incident %s: %w", inc.id, err)
	}

	plan, err := messagemap.PlanDivision(events)
	if err != nil {
		return fmt.Errorf("message map backfill: plan divisions for incident %s: %w", inc.id, err)
	}

	switch {
	case plan.None():
		return nil
	case plan.AssignKindTo != "":
		divID, err := shared.ParseDivisionID(plan.AssignKindTo)
		if err != nil {
			return fmt.Errorf("message map backfill: division id %q: %w", plan.AssignKindTo, err)
		}

		return appendEvent(ctx, tx, "Incident", inc.id, maxVersion+1, "DivisionKindAssigned",
			incident.DivisionKindAssigned{ID: divID, Kind: shared.DivisionKindMessageMap},
			messageMapBackfillMetadata, inc.occurredAt)
	default:
		return appendEvent(ctx, tx, "Incident", inc.id, maxVersion+1, "DivisionAdded",
			incident.DivisionAdded{Division: incident.DivisionData{
				ID:          incident.MessageMapDivisionID(shared.IncidentID(uuid.MustParse(inc.id))),
				Name:        messagemap.FallbackDivisionName,
				Description: messagemap.FallbackDivisionDescription,
				Kind:        shared.DivisionKindMessageMap,
			}}, messageMapBackfillMetadata, inc.occurredAt)
	}
}

func backfillMessageMapLayer(ctx context.Context, tx *sql.Tx, inc incidentBackfillRow) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT ai.stream_id
		FROM eventsourcing_aggregate_index ai
		JOIN eventsourcing_events e
		  ON e.stream_type = 'Layer' AND e.stream_id = ai.stream_id AND e.version = 1
		WHERE ai.stream_type = 'Layer' AND ai.incident_id = ?
		ORDER BY e.occurred_at, ai.stream_id`, inc.id)
	if err != nil {
		return fmt.Errorf("message map backfill: list layers for incident %s: %w", inc.id, err)
	}
	defer func() { _ = rows.Close() }()

	var layerIDs []string

	for rows.Next() {
		var id string
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

		streams = append(streams, messagemap.LayerStream{ID: id, Events: events})
		versions[id] = maxVersion
	}

	plan, err := messagemap.PlanLayer(streams)
	if err != nil {
		return fmt.Errorf("message map backfill: plan layers for incident %s: %w", inc.id, err)
	}

	switch {
	case plan.None():
		return nil
	case plan.AssignKindTo != "":
		return appendEvent(ctx, tx, "Layer", plan.AssignKindTo, versions[plan.AssignKindTo]+1, "KindAssigned",
			layer.KindAssigned{Kind: shared.LayerKindMessageMap}, messageMapBackfillMetadata, inc.occurredAt)
	default:
		layerID := uuid.NewString()
		if err := appendEvent(ctx, tx, "Layer", layerID, 1, "Created", layer.Created{
			IncidentID: shared.IncidentID(uuid.MustParse(inc.id)),
			Name:       messagemap.FallbackLayerName,
			Kind:       shared.LayerKindMessageMap,
		}, messageMapBackfillMetadata, inc.occurredAt); err != nil {
			return err
		}

		return indexStream(ctx, tx, "Layer", layerID, inc.id)
	}
}

func loadStreamEvents(
	ctx context.Context, tx *sql.Tx, streamType, streamID string,
) ([]messagemap.Event, int, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT version, event_type, data
		FROM eventsourcing_events
		WHERE stream_type = ? AND stream_id = ?
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
			data    string
		)
		if err := rows.Scan(&version, &typ, &data); err != nil {
			return nil, 0, err
		}

		maxVersion = version

		events = append(events, messagemap.Event{Type: typ, Data: []byte(data)})
	}

	return events, maxVersion, rows.Err()
}

// downBackfillMessageMap removes the events written by the backfill.
func downBackfillMessageMap(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_aggregate_index
		WHERE stream_type = 'Layer'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing_events e
			  WHERE e.stream_type = 'Layer'
			    AND e.stream_id = eventsourcing_aggregate_index.stream_id
			    AND e.version = 1
			    AND json_extract(e.metadata, '$.source') = ?
		  )`, messageMapBackfillSource); err != nil {
		return fmt.Errorf("message map backfill: remove layer indexes: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing_events
		WHERE json_extract(metadata, '$.source') = ?`, messageMapBackfillSource); err != nil {
		return fmt.Errorf("message map backfill: remove events: %w", err)
	}

	return nil
}
