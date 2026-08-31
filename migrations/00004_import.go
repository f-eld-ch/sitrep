package migrations

// Import migration: reads the legacy Hasura tables and writes events into the
// eventsourcing schema.  This is a one-shot migration — it refuses to run if any
// streams already exist, and its Down rolls back by truncating the event log.
//
// Import order (DAG, no back-references):
//   Incidents → Layers → Features → Messages
//
// Design notes (see docs/create-the-plan-composed-allen.md Phase 2):
//   - occurred_at = original row created_at so replay reproduces timestamps.
//   - Division IDs preserved verbatim so existing message tags stay valid.
//   - Multi-journal incidents merged into one log.
//   - Message.number assigned by window function (time, created_at, id).
//   - legacy `critical` priority downgraded to HIGH; original recorded in metadata.
//   - author_sub re-stamped on every Hasura update → detect ambiguity and record it.
//
// NOTE: All import functions materialise their query results into a slice before
// writing events.  pgx's extended-query-protocol portals stay open on the tx
// connection until Close() is called, so interleaving ExecContext with
// rows.Next() on the same *sql.Tx causes "driver: bad connection".

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// ──────────────────────────────────────────────────────────────────────────────
// Enum maps — total: an absent value aborts the migration.
// ──────────────────────────────────────────────────────────────────────────────

var legacyMedium = map[string]shared.Medium{
	"radio": shared.MediumRadio,
	"phone": shared.MediumPhone,
	"email": shared.MediumEmail,
	"other": shared.MediumOther,
}

var legacyTriage = map[string]shared.TriageStatus{
	"pending":  shared.TriagePending,
	"done":     shared.TriageDone,
	"reset":    shared.TriageReset,
	"moreinfo": shared.TriageMoreInfo,
}

var legacyPriority = map[string]shared.PriorityStatus{
	"normal":   shared.PriorityNormal,
	"high":     shared.PriorityHigh,
	"critical": shared.PriorityHigh, // downgraded; original kept in metadata
}

// ──────────────────────────────────────────────────────────────────────────────
// Up / Down entry points (registered in migrations.go)
// ──────────────────────────────────────────────────────────────────────────────

func upImportLegacyData(ctx context.Context, tx *sql.Tx) error {
	// Guard: refuse if any events already exist.
	var n int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM eventsourcing.events`).Scan(&n); err != nil {
		return fmt.Errorf("import guard: %w", err)
	}
	if n > 0 {
		return fmt.Errorf("import: %d event(s) already exist — migration is one-shot; truncate eventsourcing.events to re-import", n)
	}

	if err := importIncidents(ctx, tx); err != nil {
		return fmt.Errorf("import incidents: %w", err)
	}
	if err := importLayers(ctx, tx); err != nil {
		return fmt.Errorf("import layers: %w", err)
	}
	if err := importFeatures(ctx, tx); err != nil {
		return fmt.Errorf("import features: %w", err)
	}
	if err := importMessages(ctx, tx); err != nil {
		return fmt.Errorf("import messages: %w", err)
	}
	return nil
}

func downImportLegacyData(ctx context.Context, tx *sql.Tx) error {
	for _, tbl := range []string{
		"eventsourcing.incident_counters",
		"eventsourcing.aggregate_index",
		"eventsourcing.projection_dead_letter",
		"eventsourcing.projection_checkpoint",
		"eventsourcing.events",
	} {
		if _, err := tx.ExecContext(ctx, `TRUNCATE `+tbl+` CASCADE`); err != nil {
			return fmt.Errorf("truncate %s: %w", tbl, err)
		}
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Incidents
// ──────────────────────────────────────────────────────────────────────────────

type incidentRow struct {
	id        uuid.UUID
	name      string
	createdAt time.Time
	closedAt  *time.Time
	deletedAt *time.Time
	locName   *string
	lon, lat  *float64
	locID     *uuid.UUID
}

func importIncidents(ctx context.Context, tx *sql.Tx) error {
	divsByIncident, err := loadDivisions(ctx, tx)
	if err != nil {
		return err
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT i.id, i.name, i.created_at, i.closed_at, i.deleted_at,
		       l.name AS loc_name,
		       l.coordinates[0] AS lon, l.coordinates[1] AS lat,
		       l.id AS loc_id
		FROM incidents i
		LEFT JOIN locations l ON l.id = i.location_id
		ORDER BY i.created_at`)
	if err != nil {
		return err
	}

	// Materialise before writing events — cannot interleave ExecContext with
	// an open portal on the same tx connection.
	var incidents []incidentRow
	for rows.Next() {
		var r incidentRow
		if err := rows.Scan(&r.id, &r.name, &r.createdAt, &r.closedAt, &r.deletedAt,
			&r.locName, &r.lon, &r.lat, &r.locID); err != nil {
			_ = rows.Close()
			return err
		}
		incidents = append(incidents, r)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range incidents {
		var loc *incident.LocationData
		if r.locName != nil {
			loc = &incident.LocationData{Name: *r.locName}
			if r.lon != nil && r.lat != nil {
				coords := [2]float64{*r.lon, *r.lat}
				loc.Coordinates = &coords
			}
		}

		evt := incident.Imported{
			Name:             r.name,
			Location:         loc,
			Divisions:        divsByIncident[r.id],
			CreatedAt:        r.createdAt,
			ClosedAt:         r.closedAt,
			DeletedAt:        r.deletedAt,
			LegacyLocationID: r.locID,
		}
		if err := appendEvent(ctx, tx, "Incident", r.id, 1, "Imported", evt, importMeta(), r.createdAt); err != nil {
			return fmt.Errorf("incident %s: %w", r.id, err)
		}
		if err := indexStream(ctx, tx, "Incident", r.id, r.id); err != nil {
			return err
		}
	}
	return nil
}

// loadDivisions returns divisions keyed by incident_id, preserving legacy IDs.
func loadDivisions(ctx context.Context, tx *sql.Tx) (map[uuid.UUID][]incident.DivisionData, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT id, incident_id, name, COALESCE(description, '')
		FROM divisions
		ORDER BY incident_id, name`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := make(map[uuid.UUID][]incident.DivisionData)
	for rows.Next() {
		var divID, incID uuid.UUID
		var name, desc string
		if err := rows.Scan(&divID, &incID, &name, &desc); err != nil {
			return nil, err
		}
		out[incID] = append(out[incID], incident.DivisionData{
			ID:          shared.DivisionID(divID),
			Name:        name,
			Description: desc,
		})
	}
	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Layers
// ──────────────────────────────────────────────────────────────────────────────

type layerRow struct {
	id         uuid.UUID
	incidentID uuid.UUID
	name       string
	createdAt  time.Time
	deletedAt  *time.Time
}

func importLayers(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT id, incident_id, name, created_at, deleted_at
		FROM layers
		ORDER BY incident_id, created_at`)
	if err != nil {
		return err
	}

	var layers []layerRow
	for rows.Next() {
		var r layerRow
		if err := rows.Scan(&r.id, &r.incidentID, &r.name, &r.createdAt, &r.deletedAt); err != nil {
			_ = rows.Close()
			return err
		}
		layers = append(layers, r)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range layers {
		evt := layer.Imported{
			IncidentID: shared.IncidentID(r.incidentID),
			Name:       r.name,
		}
		if err := appendEvent(ctx, tx, "Layer", r.id, 1, "Imported", evt, importMeta(), r.createdAt); err != nil {
			return fmt.Errorf("layer %s: %w", r.id, err)
		}
		if err := indexStream(ctx, tx, "Layer", r.id, r.incidentID); err != nil {
			return err
		}

		if r.deletedAt != nil {
			removed := layer.Removed{Reason: shared.DeleteReasonManual}
			if err := appendEvent(ctx, tx, "Layer", r.id, 2, "Removed", removed, importMeta(), *r.deletedAt); err != nil {
				return fmt.Errorf("layer %s removed: %w", r.id, err)
			}
		}
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Features
// ──────────────────────────────────────────────────────────────────────────────

type featureRow struct {
	id         uuid.UUID
	layerID    uuid.UUID
	incidentID uuid.UUID
	geomRaw    []byte
	propRaw    []byte
	createdAt  time.Time
	deletedAt  *time.Time
}

func importFeatures(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT f.id, f.layer_id, l.incident_id, f.geometry, f.properties, f.created_at, f.deleted_at
		FROM features f
		JOIN layers l ON l.id = f.layer_id
		ORDER BY l.incident_id, f.created_at`)
	if err != nil {
		return err
	}

	var features []featureRow
	for rows.Next() {
		var r featureRow
		if err := rows.Scan(&r.id, &r.layerID, &r.incidentID, &r.geomRaw, &r.propRaw, &r.createdAt, &r.deletedAt); err != nil {
			_ = rows.Close()
			return err
		}
		features = append(features, r)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range features {
		var geom, props map[string]any
		if err := json.Unmarshal(r.geomRaw, &geom); err != nil {
			return fmt.Errorf("feature %s geometry: %w", r.id, err)
		}
		if err := json.Unmarshal(r.propRaw, &props); err != nil {
			return fmt.Errorf("feature %s properties: %w", r.id, err)
		}

		evt := feature.Imported{
			IncidentID: shared.IncidentID(r.incidentID),
			LayerID:    shared.LayerID(r.layerID),
			Geometry:   geom,
			Properties: props,
		}
		if err := appendEvent(ctx, tx, "Feature", r.id, 1, "Imported", evt, importMeta(), r.createdAt); err != nil {
			return fmt.Errorf("feature %s: %w", r.id, err)
		}
		if err := indexStream(ctx, tx, "Feature", r.id, r.incidentID); err != nil {
			return err
		}

		if r.deletedAt != nil {
			removed := feature.Removed{Reason: shared.DeleteReasonManual}
			if err := appendEvent(ctx, tx, "Feature", r.id, 2, "Removed", removed, importMeta(), *r.deletedAt); err != nil {
				return fmt.Errorf("feature %s removed: %w", r.id, err)
			}
		}
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────────────────────

type messageRow struct {
	id             uuid.UUID
	incidentID     uuid.UUID
	content        string
	sender         string
	senderDetail   string
	receiver       string
	receiverDetail string
	mediumRaw      string
	msgTime        time.Time
	triageRaw      string
	priorityRaw    string
	authorSub      *string
	createdAt      time.Time
	updatedAt      time.Time
	deletedAt      *time.Time
	journalID      uuid.UUID
	journalName    string
	number         int
}

func importMessages(ctx context.Context, tx *sql.Tx) error {
	divTags, err := loadMessageDivisionTags(ctx, tx)
	if err != nil {
		return err
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT
		    m.id,
		    j.incident_id,
		    m.content,
		    m.sender,
		    COALESCE(m.sender_detail, ''),
		    m.receiver,
		    COALESCE(m.receiver_detail, ''),
		    COALESCE(m.medium_id, 'radio'),
		    m.time,
		    COALESCE(m.triage_id,   'pending'),
		    COALESCE(m.priority_id, 'normal'),
		    m.author_sub,
		    m.created_at,
		    m.updated_at,
		    m.deleted_at,
		    j.id   AS journal_id,
		    j.name AS journal_name,
		    row_number() OVER (
		        PARTITION BY j.incident_id
		        ORDER BY m.time, m.created_at, m.id
		    ) AS number
		FROM messages m
		JOIN journals j ON j.id = m.journal_id
		ORDER BY j.incident_id, m.time, m.created_at, m.id`)
	if err != nil {
		return err
	}

	var msgs []messageRow
	for rows.Next() {
		var r messageRow
		if err := rows.Scan(
			&r.id, &r.incidentID, &r.content, &r.sender, &r.senderDetail,
			&r.receiver, &r.receiverDetail, &r.mediumRaw, &r.msgTime,
			&r.triageRaw, &r.priorityRaw, &r.authorSub,
			&r.createdAt, &r.updatedAt, &r.deletedAt,
			&r.journalID, &r.journalName, &r.number,
		); err != nil {
			_ = rows.Close()
			return err
		}
		msgs = append(msgs, r)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}

	maxNumberByIncident := make(map[uuid.UUID]int)

	for _, r := range msgs {
		medium, ok := legacyMedium[r.mediumRaw]
		if !ok {
			return fmt.Errorf("message %s: unknown medium %q", r.id, r.mediumRaw)
		}
		triage, ok := legacyTriage[r.triageRaw]
		if !ok {
			return fmt.Errorf("message %s: unknown triage %q", r.id, r.triageRaw)
		}
		priority, ok := legacyPriority[r.priorityRaw]
		if !ok {
			return fmt.Errorf("message %s: unknown priority %q", r.id, r.priorityRaw)
		}

		var importedAuthor, importedEditor *string
		meta := importMeta()
		meta["originalJournalId"] = r.journalID.String()
		meta["originalJournalName"] = r.journalName
		if r.priorityRaw == "critical" {
			meta["originalPriority"] = "critical"
		}

		wasEdited := r.updatedAt.After(r.createdAt.Add(time.Second))
		if wasEdited {
			importedEditor = r.authorSub
			meta["authorAmbiguous"] = true
		} else {
			importedAuthor = r.authorSub
		}

		divIDs := divTags[r.id]
		if divIDs == nil {
			divIDs = []shared.DivisionID{}
		}
		evt := message.Imported{
			IncidentID:     shared.IncidentID(r.incidentID),
			Number:         r.number,
			Content:        r.content,
			Sender:         r.sender,
			SenderDetail:   r.senderDetail,
			Receiver:       r.receiver,
			ReceiverDetail: r.receiverDetail,
			Medium:         medium,
			Time:           r.msgTime,
			Triage:         triage,
			Priority:       priority,
			DivisionIDs:    divIDs,
			AuthorSub:      importedAuthor,
			LastEditorSub:  importedEditor,
			RecordedAt:     r.createdAt,
			LastUpdatedAt:  r.updatedAt,
		}
		if err := appendEvent(ctx, tx, "Message", r.id, 1, "Imported", evt, meta, r.createdAt); err != nil {
			return fmt.Errorf("message %s: %w", r.id, err)
		}
		if err := indexStream(ctx, tx, "Message", r.id, r.incidentID); err != nil {
			return err
		}

		if r.deletedAt != nil {
			del := message.Deleted{Reason: shared.DeleteReasonManual}
			if err := appendEvent(ctx, tx, "Message", r.id, 2, "Deleted", del, importMeta(), *r.deletedAt); err != nil {
				return fmt.Errorf("message %s deleted: %w", r.id, err)
			}
		}

		if r.number > maxNumberByIncident[r.incidentID] {
			maxNumberByIncident[r.incidentID] = r.number
		}
	}

	for incID, maxNum := range maxNumberByIncident {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO eventsourcing.incident_counters (incident_id, next_number)
			VALUES ($1, $2)
			ON CONFLICT (incident_id) DO UPDATE SET next_number = EXCLUDED.next_number`,
			incID, maxNum+1); err != nil {
			return fmt.Errorf("incident_counters %s: %w", incID, err)
		}
	}
	return nil
}

// loadMessageDivisionTags returns division IDs per message.
func loadMessageDivisionTags(ctx context.Context, tx *sql.Tx) (map[uuid.UUID][]shared.DivisionID, error) {
	rows, err := tx.QueryContext(ctx, `SELECT message_id, division_id FROM message_division`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := make(map[uuid.UUID][]shared.DivisionID)
	for rows.Next() {
		var msgID, divID uuid.UUID
		if err := rows.Scan(&msgID, &divID); err != nil {
			return nil, err
		}
		out[msgID] = append(out[msgID], shared.DivisionID(divID))
	}
	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Preflight checks — same queries as the import, read-only.
// ──────────────────────────────────────────────────────────────────────────────

// RunPreflight performs data-quality checks against the legacy tables and
// reports findings without making any changes.  Returns an error if any check
// finds data that would cause the import to fail; non-fatal findings are
// returned as warnings.
func RunPreflight(ctx context.Context, db *sql.DB) ([]string, error) {
	var warnings []string

	// Orphaned messages (no journal).
	var orphanCount int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages WHERE journal_id IS NULL`).Scan(&orphanCount); err != nil {
		return nil, fmt.Errorf("preflight orphan check: %w", err)
	}
	if orphanCount > 0 {
		return nil, fmt.Errorf("preflight: %d message(s) have NULL journal_id — import would drop them", orphanCount)
	}

	// Multi-journal incidents (merged into one log; may reorder numbers).
	var multiJournal int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
		    SELECT incident_id FROM journals GROUP BY incident_id HAVING COUNT(*) > 1
		) t`).Scan(&multiJournal); err != nil {
		return nil, fmt.Errorf("preflight multi-journal check: %w", err)
	}
	if multiJournal > 0 {
		warnings = append(warnings,
			fmt.Sprintf("%d incident(s) have multiple journals — messages will be merged into one log per incident", multiJournal))
	}

	// Cross-incident division tags.
	var crossIncident int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM message_division md
		JOIN messages m  ON m.id  = md.message_id
		JOIN journals  j ON j.id  = m.journal_id
		WHERE md.division_id NOT IN (
		    SELECT id FROM divisions WHERE incident_id = j.incident_id
		)`).Scan(&crossIncident); err != nil {
		return nil, fmt.Errorf("preflight cross-incident tag check: %w", err)
	}
	if crossIncident > 0 {
		warnings = append(warnings,
			fmt.Sprintf("%d message-division tag(s) reference a division from a different incident — tags will be imported as-is", crossIncident))
	}

	// Unknown enum values (would abort the import).
	var unknownMedium int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages WHERE medium_id NOT IN ('radio','phone','email','other') AND medium_id IS NOT NULL`,
	).Scan(&unknownMedium); err != nil {
		return nil, fmt.Errorf("preflight medium check: %w", err)
	}
	if unknownMedium > 0 {
		return nil, fmt.Errorf("preflight: %d message(s) have unknown medium_id — import would fail", unknownMedium)
	}

	var unknownTriage int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM messages WHERE triage_id NOT IN ('pending','done','reset','moreinfo')`,
	).Scan(&unknownTriage); err != nil {
		return nil, fmt.Errorf("preflight triage check: %w", err)
	}
	if unknownTriage > 0 {
		return nil, fmt.Errorf("preflight: %d message(s) have unknown triage_id — import would fail", unknownTriage)
	}

	return warnings, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────────

func appendEvent(
	ctx context.Context, tx *sql.Tx,
	streamType string, streamID uuid.UUID, version int,
	eventType string, data any, metadata map[string]any,
	occurredAt time.Time,
) error {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal event data: %w", err)
	}
	metaBytes, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal event metadata: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO eventsourcing.events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		streamType, streamID, version, eventType, dataBytes, metaBytes, occurredAt.UTC())
	return err
}

func indexStream(ctx context.Context, tx *sql.Tx, streamType string, streamID, incidentID uuid.UUID) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO eventsourcing.aggregate_index (stream_type, stream_id, incident_id)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`,
		streamType, streamID, incidentID)
	return err
}

func importMeta() map[string]any {
	return map[string]any{"source": "hasura-import"}
}
