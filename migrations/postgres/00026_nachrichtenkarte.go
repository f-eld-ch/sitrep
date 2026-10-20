package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

// Schema of the Nachrichtenkarte: system kinds on divisions and layers, the feature change history
// and the per-division acknowledgements of a message.
var nachrichtenkarteSchemaUp = []string{
	`ALTER TABLE readmodel.incident_division ADD COLUMN kind text NOT NULL DEFAULT ''`,
	`ALTER TABLE readmodel.layer_features ADD COLUMN kind text NOT NULL DEFAULT ''`,
	`CREATE TABLE readmodel.feature_change (
    feature_id   uuid        NOT NULL,
    version      int         NOT NULL,
    incident_id  uuid        NOT NULL,
    layer_id     uuid        NOT NULL,
    change       text        NOT NULL,
    effective_at timestamptz NOT NULL,
    recorded_at  timestamptz NOT NULL,
    message_id   uuid,
    geometry     jsonb,
    properties   jsonb,
    actor        text        NOT NULL DEFAULT '',
    PRIMARY KEY (feature_id, version)
)`,
	`CREATE INDEX ON readmodel.feature_change (incident_id, effective_at)`,
	`CREATE INDEX ON readmodel.feature_change (message_id) WHERE message_id IS NOT NULL`,
	`ALTER TABLE readmodel.message ADD COLUMN acknowledgements jsonb NOT NULL DEFAULT '[]'`,
}

var nachrichtenkarteSchemaDown = []string{
	`ALTER TABLE readmodel.message DROP COLUMN IF EXISTS acknowledgements`,
	`DROP TABLE IF EXISTS readmodel.feature_change`,
	`ALTER TABLE readmodel.layer_features DROP COLUMN IF EXISTS kind`,
	`ALTER TABLE readmodel.incident_division DROP COLUMN IF EXISTS kind`,
}

// upNachrichtenkarte adds the read-model columns and the feature change table, then runs the backfills in
// order, all in one transaction.
func upNachrichtenkarte(ctx context.Context, tx *sql.Tx) error {
	for _, stmt := range nachrichtenkarteSchemaUp {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("nachrichtenkarte: schema: %w", err)
		}
	}

	if err := upBackfillMessageMap(ctx, tx); err != nil {
		return err
	}

	if err := upBackfillMessageMapAcknowledgements(ctx, tx); err != nil {
		return err
	}

	if err := upBackfillStandardLayer(ctx, tx); err != nil {
		return err
	}

	return nil
}

// downNachrichtenkarte undoes the backfills in reverse order, then drops what the schema step added.
func downNachrichtenkarte(ctx context.Context, tx *sql.Tx) error {
	if err := downBackfillStandardLayer(ctx, tx); err != nil {
		return err
	}

	if err := downBackfillMessageMapAcknowledgements(ctx, tx); err != nil {
		return err
	}

	if err := downBackfillMessageMap(ctx, tx); err != nil {
		return err
	}

	for _, stmt := range nachrichtenkarteSchemaDown {
		if _, err := tx.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("nachrichtenkarte: drop schema: %w", err)
		}
	}

	return nil
}

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

const messageMapAckBackfillSource = "message-map-ack-backfill"

// upBackfillMessageMapAcknowledgements marks every historical message that is triaged to
// the Nachrichtenkarte as acknowledged by it. Those messages predate per-division
// acknowledgements and were drawn (or not) by hand; without this the operator would face
// the whole backlog as "not yet drawn". It is safe to rerun: acknowledged messages are skipped.
func upBackfillMessageMapAcknowledgements(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT stream_id FROM eventsourcing.events WHERE stream_type = 'Incident'`)
	if err != nil {
		return fmt.Errorf("ack backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var incidentIDs []uuid.UUID

	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("ack backfill: scan incident: %w", err)
		}

		incidentIDs = append(incidentIDs, id)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("ack backfill: read incidents: %w", err)
	}

	_ = rows.Close()

	meta := map[string]any{"actor": "system:migration", "source": messageMapAckBackfillSource}

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

		if err := backfillIncidentAcknowledgements(ctx, tx, incidentID, divisionID, meta); err != nil {
			return err
		}
	}

	return nil
}

func backfillIncidentAcknowledgements(
	ctx context.Context, tx *sql.Tx, incidentID uuid.UUID, divisionID string, meta map[string]any,
) error {
	divID, err := shared.ParseDivisionID(divisionID)
	if err != nil {
		return fmt.Errorf("ack backfill: division id %q: %w", divisionID, err)
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT stream_id FROM eventsourcing.events
		WHERE stream_type = 'Message' AND version = 1 AND data ->> 'incidentId' = $1`, incidentID.String())
	if err != nil {
		return fmt.Errorf("ack backfill: list messages of incident %s: %w", incidentID, err)
	}
	defer func() { _ = rows.Close() }()

	var messageIDs []uuid.UUID

	for rows.Next() {
		var id uuid.UUID
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

		var lastEvent time.Time
		if err := tx.QueryRowContext(ctx, `
			SELECT MAX(occurred_at) FROM eventsourcing.events
			WHERE stream_type = 'Message' AND stream_id = $1`, messageID).Scan(&lastEvent); err != nil {
			return fmt.Errorf("ack backfill: last event of message %s: %w", messageID, err)
		}

		if err := appendEvent(ctx, tx, "Message", messageID, maxVersion+1, "DivisionAcknowledged",
			message.DivisionAcknowledged{DivisionID: divID, By: "system:migration"}, meta, lastEvent); err != nil {
			return fmt.Errorf("ack backfill: acknowledge message %s: %w", messageID, err)
		}
	}

	return nil
}

func downBackfillMessageMapAcknowledgements(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events WHERE metadata ->> 'source' = $1`,
		messageMapAckBackfillSource); err != nil {
		return fmt.Errorf("ack backfill: remove events: %w", err)
	}

	return nil
}

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
