// Package sqlite implements outbound.Queries against the SQLite read-model
// projection tables. Every method uses the read-only database handle; the
// write handle is never touched here.
package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"github.com/google/uuid"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

var _ outbound.Queries = (*Queries)(nil)

// Queries queries the SQLite read-model projection tables.
type Queries struct {
	db     *sql.DB
	access outbound.IncidentAccessChecker
}

// NewQueries creates a Queries adapter backed by the given read-only database handle.
func NewQueries(db *sql.DB, accessCheckers ...outbound.IncidentAccessChecker) *Queries {
	var ac outbound.IncidentAccessChecker
	if len(accessCheckers) > 0 {
		ac = accessCheckers[0]
	}

	return &Queries{db: db, access: ac}
}

// ──────────────────────────────────────────────────────────────────────────────
// Incidents
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListIncidents(ctx context.Context) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing incidents")

	var (
		query string
		args  []any
	)

	if q.access != nil {
		actor, err := identity.ActorFrom(ctx)
		if err != nil {
			return nil, err
		}

		query = `
			SELECT i.id, i.parent_id, i.name, i.is_closed, i.closed_at, i.created_at, i.updated_at, i.location
			FROM readmodel_incident i
			WHERE i.is_deleted = 0
			  AND (NOT EXISTS (SELECT 1 FROM readmodel_incident_access_mode m WHERE m.incident_id = i.id AND m.mode = 'restricted')
			       OR EXISTS (SELECT 1 FROM readmodel_access_policy p WHERE p.subject = ? AND p.domain = 'incident:' || i.id AND p.action = 'incident.read'))
			ORDER BY i.created_at DESC`
		args = []any{"user:" + actor.Sub}
	} else {
		query = `
			SELECT i.id, i.parent_id, i.name, i.is_closed, i.closed_at, i.created_at, i.updated_at, i.location
			FROM readmodel_incident i
			WHERE i.is_deleted = 0
			ORDER BY i.created_at DESC`
	}

	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []*outbound.IncidentRM

	for rows.Next() {
		inc, err := scanIncident(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, inc)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := q.loadDivisions(ctx, out); err != nil {
		return nil, err
	}

	slog.DebugContext(ctx, "listed incidents", slog.Int("count", len(out)))

	return out, nil
}

func (q *Queries) GetIncident(ctx context.Context, id uuid.UUID) (*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "getting incident", slog.String("id", id.String()))

	query := `
		SELECT i.id, i.parent_id, i.name, i.is_closed, i.closed_at, i.created_at, i.updated_at, i.location
		FROM readmodel_incident i
		WHERE i.id = ? AND i.is_deleted = 0`
	args := []any{id.String()}

	if q.access != nil {
		actor, err := identity.ActorFrom(ctx)
		if err != nil {
			return nil, err
		}

		query += ` AND (NOT EXISTS (SELECT 1 FROM readmodel_incident_access_mode m WHERE m.incident_id = i.id AND m.mode = 'restricted') OR EXISTS (SELECT 1 FROM readmodel_access_policy p WHERE p.subject = ? AND p.domain = 'incident:' || i.id AND p.action = 'incident.read'))`

		args = append(args, "user:"+actor.Sub)
	}

	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, err
		}

		return nil, shared.ErrNotFound
	}

	inc, err := scanIncident(rows)
	if err != nil {
		return nil, err
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := q.loadDivisions(ctx, []*outbound.IncidentRM{inc}); err != nil {
		return nil, err
	}

	return inc, nil
}

func (q *Queries) ListChildIncidents(ctx context.Context, parentID uuid.UUID) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing child incidents", slog.String("parent_id", parentID.String()))

	if !q.canRead(ctx, parentID) {
		return nil, shared.ErrNotFound
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT id, parent_id, name, is_closed, closed_at, created_at, updated_at, location
		FROM readmodel_incident
		WHERE parent_id = ? AND is_deleted = 0
		ORDER BY created_at DESC`, parentID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []*outbound.IncidentRM

	for rows.Next() {
		inc, err := scanIncident(rows)
		if err != nil {
			return nil, err
		}

		if q.canRead(ctx, inc.ID) {
			out = append(out, inc)
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := q.loadDivisions(ctx, out); err != nil {
		return nil, err
	}

	return out, nil
}

type incidentScanner interface {
	Scan(dest ...any) error
}

func scanIncident(row incidentScanner) (*outbound.IncidentRM, error) {
	var (
		idStr     string
		parentStr *string
		name      string
		isClosed  int
		closedAt  sqlite.NullTime
		createdAt sqlite.Time
		updatedAt sqlite.Time
		locJSON   *string
	)

	if err := row.Scan(
		&idStr, &parentStr, &name, &isClosed, &closedAt, &createdAt, &updatedAt, &locJSON,
	); err != nil {
		return nil, err
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil, fmt.Errorf("parse incident id %q: %w", idStr, err)
	}

	var parentID *uuid.UUID

	if parentStr != nil {
		p, err := uuid.Parse(*parentStr)
		if err != nil {
			return nil, fmt.Errorf("parse parent_id %q: %w", *parentStr, err)
		}

		parentID = &p
	}

	inc := &outbound.IncidentRM{
		ID:        id,
		ParentID:  parentID,
		Name:      name,
		IsClosed:  isClosed != 0,
		ClosedAt:  closedAt.V,
		CreatedAt: createdAt.V,
		UpdatedAt: updatedAt.V,
	}

	if locJSON != nil && len(*locJSON) > 0 {
		loc, err := parseLocation([]byte(*locJSON))
		if err != nil {
			return nil, fmt.Errorf("parse location for incident %s: %w", id, err)
		}

		inc.Location = loc
	}

	return inc, nil
}

// loadDivisions bulk-fetches active divisions for the given incidents, keyed by incident ID.
// Uses json_each for IN-list expansion — injection-proof and immune to SQLITE_MAX_VARIABLE_NUMBER.
func (q *Queries) loadDivisions(ctx context.Context, incidents []*outbound.IncidentRM) error {
	if len(incidents) == 0 {
		return nil
	}

	ids := make([]string, len(incidents))
	idx := make(map[uuid.UUID]*outbound.IncidentRM, len(incidents))

	for i, inc := range incidents {
		ids[i] = inc.ID.String()
		idx[inc.ID] = inc
	}

	idsJSON, err := json.Marshal(ids)
	if err != nil {
		return fmt.Errorf("marshal incident ids: %w", err)
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT id, incident_id, name, description, removed_at
		FROM readmodel_incident_division
		WHERE incident_id IN (SELECT value FROM json_each(?))
		ORDER BY incident_id, name`, string(idsJSON))
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var (
			divIDStr  string
			incIDStr  string
			name      string
			desc      string
			removedAt sqlite.NullTime
		)
		if err := rows.Scan(&divIDStr, &incIDStr, &name, &desc, &removedAt); err != nil {
			return err
		}

		divID, err := uuid.Parse(divIDStr)
		if err != nil {
			return fmt.Errorf("parse division id %q: %w", divIDStr, err)
		}

		incID, err := uuid.Parse(incIDStr)
		if err != nil {
			return fmt.Errorf("parse division incident_id %q: %w", incIDStr, err)
		}

		if inc, ok := idx[incID]; ok {
			inc.Divisions = append(inc.Divisions, &outbound.DivisionRM{
				ID:          divID,
				Name:        name,
				Description: desc,
				RemovedAt:   removedAt.V,
			})
		}
	}

	return rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListMessages(ctx context.Context, incidentID uuid.UUID) ([]*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "listing messages", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, incidentID) {
		return nil, shared.ErrNotFound
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT id, number, incident_id, content, sender, sender_detail,
		       receiver, receiver_detail, medium, msg_time,
		       created_at, updated_at, triage, priority, division_ids
		FROM readmodel_message
		WHERE incident_id = ?
		ORDER BY msg_time DESC, created_at DESC`, incidentID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	return collectMessages(rows)
}

func (q *Queries) GetMessage(ctx context.Context, id uuid.UUID) (*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "getting message", slog.String("id", id.String()))

	rows, err := q.db.QueryContext(ctx, `
		SELECT id, number, incident_id, content, sender, sender_detail,
		       receiver, receiver_detail, medium, msg_time,
		       created_at, updated_at, triage, priority, division_ids
		FROM readmodel_message
		WHERE id = ?`, id.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	msgs, err := collectMessages(rows)
	if err != nil {
		return nil, err
	}

	if len(msgs) == 0 {
		return nil, shared.ErrNotFound
	}

	if !q.canRead(ctx, msgs[0].IncidentID) {
		return nil, shared.ErrNotFound
	}

	return msgs[0], nil
}

func collectMessages(rows *sql.Rows) ([]*outbound.MessageRM, error) {
	defer func() { _ = rows.Close() }()

	var out []*outbound.MessageRM

	for rows.Next() {
		var (
			idStr          string
			number         int
			incIDStr       string
			content        string
			sender         string
			senderDetail   string
			receiver       string
			receiverDetail string
			medium         string
			msgTime        sqlite.Time
			createdAt      sqlite.Time
			updatedAt      sqlite.Time
			triage         string
			priority       string
			divisionIDsStr string
		)

		if err := rows.Scan(
			&idStr, &number, &incIDStr, &content, &sender, &senderDetail,
			&receiver, &receiverDetail, &medium, &msgTime,
			&createdAt, &updatedAt, &triage, &priority, &divisionIDsStr,
		); err != nil {
			return nil, err
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("parse message id %q: %w", idStr, err)
		}

		incID, err := uuid.Parse(incIDStr)
		if err != nil {
			return nil, fmt.Errorf("parse message incident_id %q: %w", incIDStr, err)
		}

		var divisionIDs []uuid.UUID
		if err := json.Unmarshal([]byte(divisionIDsStr), &divisionIDs); err != nil {
			return nil, fmt.Errorf("unmarshal division_ids: %w", err)
		}

		if divisionIDs == nil {
			divisionIDs = []uuid.UUID{}
		}

		out = append(out, &outbound.MessageRM{
			ID:             id,
			Number:         number,
			IncidentID:     incID,
			Content:        content,
			Sender:         sender,
			SenderDetail:   senderDetail,
			Receiver:       receiver,
			ReceiverDetail: receiverDetail,
			Medium:         medium,
			Time:           msgTime.V,
			CreatedAt:      createdAt.V,
			UpdatedAt:      updatedAt.V,
			Triage:         triage,
			Priority:       priority,
			DivisionIDs:    divisionIDs,
		})
	}

	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Attachments
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListAttachments(ctx context.Context, messageID uuid.UUID) ([]*outbound.AttachmentRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, message_id, incident_id, filename, content_type, size, checksum, storage_key, uploader_sub, created_at
		FROM readmodel_message_attachment
		WHERE message_id = ?
		ORDER BY created_at ASC`, messageID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	return collectAttachments(rows)
}

func (q *Queries) GetAttachment(ctx context.Context, id uuid.UUID) (*outbound.AttachmentRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, message_id, incident_id, filename, content_type, size, checksum, storage_key, uploader_sub, created_at
		FROM readmodel_message_attachment
		WHERE id = ?`, id.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	atts, err := collectAttachments(rows)
	if err != nil {
		return nil, err
	}

	if len(atts) == 0 {
		return nil, shared.ErrNotFound
	}

	return atts[0], nil
}

func collectAttachments(rows *sql.Rows) ([]*outbound.AttachmentRM, error) {
	defer func() { _ = rows.Close() }()

	var out []*outbound.AttachmentRM

	for rows.Next() {
		var (
			idStr       string
			msgIDStr    string
			incIDStr    string
			filename    string
			contentType string
			size        int64
			checksum    string
			storageKey  string
			uploaderSub string
			createdAt   sqlite.Time
		)

		if err := rows.Scan(
			&idStr, &msgIDStr, &incIDStr, &filename, &contentType,
			&size, &checksum, &storageKey, &uploaderSub, &createdAt,
		); err != nil {
			return nil, err
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("parse attachment id %q: %w", idStr, err)
		}

		msgID, err := uuid.Parse(msgIDStr)
		if err != nil {
			return nil, fmt.Errorf("parse attachment message_id %q: %w", msgIDStr, err)
		}

		incID, err := uuid.Parse(incIDStr)
		if err != nil {
			return nil, fmt.Errorf("parse attachment incident_id %q: %w", incIDStr, err)
		}

		out = append(out, &outbound.AttachmentRM{
			ID:          id,
			MessageID:   msgID,
			IncidentID:  incID,
			Filename:    filename,
			ContentType: contentType,
			Size:        size,
			Checksum:    checksum,
			StorageKey:  storageKey,
			UploaderSub: uploaderSub,
			CreatedAt:   createdAt.V,
		})
	}

	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Layers
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing layers", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, incidentID) {
		return nil, shared.ErrNotFound
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT l.id, l.incident_id, i.name, l.name, l.geojson, l.revision
		FROM readmodel_layer_features l
		JOIN readmodel_incident i ON i.id = l.incident_id
		WHERE l.incident_id = ? AND l.removed = 0
		ORDER BY l.name`, incidentID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	return collectLayers(rows)
}

func (q *Queries) ListVisibleLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing visible layers", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, incidentID) {
		return nil, shared.ErrNotFound
	}

	visibleIDs := []string{incidentID.String()}

	childRows, err := q.db.QueryContext(ctx,
		`SELECT id FROM readmodel_incident WHERE parent_id = ? AND is_deleted = 0`,
		incidentID.String(),
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = childRows.Close() }()

	for childRows.Next() {
		var childIDStr string
		if err := childRows.Scan(&childIDStr); err != nil {
			return nil, err
		}

		childID, err := uuid.Parse(childIDStr)
		if err != nil {
			return nil, fmt.Errorf("parse child incident id %q: %w", childIDStr, err)
		}

		if q.canRead(ctx, childID) {
			visibleIDs = append(visibleIDs, childIDStr)
		}
	}

	if err := childRows.Err(); err != nil {
		return nil, err
	}

	visibleJSON, err := json.Marshal(visibleIDs)
	if err != nil {
		return nil, fmt.Errorf("marshal visible ids: %w", err)
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT l.id, l.incident_id, i.name, l.name, l.geojson, l.revision
		FROM readmodel_layer_features l
		JOIN readmodel_incident i ON i.id = l.incident_id
		WHERE l.removed = 0
		  AND i.is_deleted = 0
		  AND l.incident_id IN (SELECT value FROM json_each(?))`,
		string(visibleJSON))
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	layers, err := collectLayers(rows)
	if err != nil {
		return nil, err
	}

	// Sort in Go: own-incident first, then lower(sourceIncidentName), then lower(name).
	// SQLite's lower() is ASCII-only; strings.ToLower is Unicode-aware and matches
	// Postgres for both ASCII and non-ASCII input.
	slices.SortFunc(layers, func(a, b *outbound.LayerRM) int {
		aOwn := a.IncidentID == incidentID
		bOwn := b.IncidentID == incidentID

		if aOwn != bOwn {
			if aOwn {
				return -1
			}

			return 1
		}

		if aOwn {
			return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
		}

		if c := strings.Compare(strings.ToLower(a.SourceIncidentName), strings.ToLower(b.SourceIncidentName)); c != 0 {
			return c
		}

		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})

	return layers, nil
}

// GetFeatureIncidentID returns the incident that owns the given feature.
// Unlike the Postgres implementation, which incorrectly queries by layer id,
// this correctly finds the layer containing featureID via JSON1.
func (q *Queries) GetFeatureIncidentID(ctx context.Context, featureID uuid.UUID) (uuid.UUID, error) {
	var incIDStr string

	err := q.db.QueryRowContext(ctx, `
		SELECT l.incident_id
		  FROM readmodel_layer_features l
		 WHERE l.removed = 0
		   AND EXISTS (
		       SELECT 1 FROM json_each(l.geojson, '$.features') je
		        WHERE json_extract(je.value, '$.id') = ?
		   )
		 LIMIT 1`, featureID.String(),
	).Scan(&incIDStr)
	if errors.Is(err, sql.ErrNoRows) {
		return uuid.UUID{}, shared.ErrNotFound
	}

	if err != nil {
		return uuid.UUID{}, err
	}

	incID, err := uuid.Parse(incIDStr)
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("parse incident_id %q: %w", incIDStr, err)
	}

	return incID, nil
}

func collectLayers(rows *sql.Rows) ([]*outbound.LayerRM, error) {
	defer func() { _ = rows.Close() }()

	var out []*outbound.LayerRM

	for rows.Next() {
		var (
			idStr      string
			incIDStr   string
			srcName    string
			name       string
			geojsonStr string
			revision   int
		)

		if err := rows.Scan(&idStr, &incIDStr, &srcName, &name, &geojsonStr, &revision); err != nil {
			return nil, err
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, fmt.Errorf("parse layer id %q: %w", idStr, err)
		}

		incID, err := uuid.Parse(incIDStr)
		if err != nil {
			return nil, fmt.Errorf("parse layer incident_id %q: %w", incIDStr, err)
		}

		out = append(out, &outbound.LayerRM{
			ID:                 id,
			IncidentID:         incID,
			SourceIncidentID:   incID,
			SourceIncidentName: srcName,
			Name:               name,
			GeoJSON:            json.RawMessage(geojsonStr),
			Revision:           revision,
		})
	}

	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) canRead(ctx context.Context, incidentID uuid.UUID) bool {
	if q.access == nil {
		return true
	}

	actor, err := identity.ActorFrom(ctx)
	if err != nil {
		return false
	}

	allowed, err := q.access.Can(ctx, actor.Sub, shared.IncidentID(incidentID), access.IncidentRead)

	return err == nil && allowed
}

// parseLocation decodes the JSON location column into a LocationRM.
// The stored JSON has the shape {"name":"...","coordinates":[lon,lat]}.
func parseLocation(b []byte) (*outbound.LocationRM, error) {
	var raw struct {
		Name        string      `json:"name"`
		Coordinates *[2]float64 `json:"coordinates"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}

	return &outbound.LocationRM{
		Name:        raw.Name,
		Coordinates: raw.Coordinates,
	}, nil
}
