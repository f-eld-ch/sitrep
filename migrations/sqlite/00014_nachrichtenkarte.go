package sqlite

import (
	"context"
	"database/sql"
	"fmt"

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
	`ALTER TABLE readmodel_incident_division ADD COLUMN kind TEXT NOT NULL DEFAULT ''`,
	`ALTER TABLE readmodel_layer_features ADD COLUMN kind TEXT NOT NULL DEFAULT ''`,
	`CREATE TABLE readmodel_feature_change (
    feature_id   TEXT NOT NULL,
    version      INTEGER NOT NULL,
    incident_id  TEXT NOT NULL,
    layer_id     TEXT NOT NULL,
    change       TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    recorded_at  TEXT NOT NULL,
    message_id   TEXT,
    geometry     TEXT,
    properties   TEXT,
    actor        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (feature_id, version)
) STRICT`,
	`CREATE INDEX readmodel_feature_change_incident_idx ON readmodel_feature_change (incident_id, effective_at)`,
	`CREATE INDEX readmodel_feature_change_message_idx ON readmodel_feature_change (message_id) WHERE message_id IS NOT NULL`,
	`ALTER TABLE readmodel_message ADD COLUMN acknowledgements TEXT NOT NULL DEFAULT '[]'`,
}

var nachrichtenkarteSchemaDown = []string{
	`ALTER TABLE readmodel_message DROP COLUMN acknowledgements`,
	`DROP TABLE IF EXISTS readmodel_feature_change`,
	`ALTER TABLE readmodel_layer_features DROP COLUMN kind`,
	`ALTER TABLE readmodel_incident_division DROP COLUMN kind`,
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

const (
	messageMapBackfillSource   = "message-map-backfill"
	messageMapBackfillMetadata = `{"actor":"system:migration","source":"message-map-backfill"}`
)

// upBackfillMessageMap mirrors the Postgres backfill in 00026_nachrichtenkarte.go: every existing
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

const (
	messageMapAckBackfillSource   = "message-map-ack-backfill"
	messageMapAckBackfillMetadata = `{"actor":"system:migration","source":"message-map-ack-backfill"}`
)

// upBackfillMessageMapAcknowledgements mirrors the Postgres backfill in 00026_nachrichtenkarte.go: every
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

const (
	standardLayerBackfillSource   = "standard-layer-backfill"
	standardLayerBackfillMetadata = `{"actor":"system:migration","source":"standard-layer-backfill"}`
)

// upBackfillStandardLayer mirrors the Postgres backfill in 00026_nachrichtenkarte.go: every incident without a
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
