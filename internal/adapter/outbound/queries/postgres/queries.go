// Package postgres implements the outbound.Queries port against the Postgres
// projection tables (rm_incident, rm_incident_division, rm_message, rm_layer_features).
// These are plain SQL reads — no event store, no aggregates.
package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.Queries = (*Queries)(nil)

// Queries queries the read-model projection tables.
type Queries struct {
	pool *pgxpool.Pool
}

// NewQueries creates a Queries adapter backed by the given pool.
func NewQueries(pool *pgxpool.Pool) *Queries {
	return &Queries{pool: pool}
}

// ──────────────────────────────────────────────────────────────────────────────
// Incidents
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListIncidents(ctx context.Context) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing incidents")

	rows, err := q.pool.Query(ctx, `
		SELECT id, name, is_closed, closed_at, created_at, updated_at, location
		FROM rm_incident
		WHERE is_deleted = false
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

	slog.DebugContext(ctx, "listed incidents", "count", len(out))

	return out, nil
}

func (q *Queries) GetIncident(ctx context.Context, id uuid.UUID) (*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "getting incident", "id", id)

	rows, err := q.pool.Query(ctx, `
		SELECT id, name, is_closed, closed_at, created_at, updated_at, location
		FROM rm_incident
		WHERE id = $1 AND is_deleted = false`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

type incidentScanner interface {
	Scan(dest ...any) error
}

func scanIncident(row incidentScanner) (*outbound.IncidentRM, error) {
	var (
		id        uuid.UUID
		name      string
		isClosed  bool
		closedAt  *time.Time
		createdAt time.Time
		updatedAt time.Time
		locJSON   []byte
	)
	if err := row.Scan(&id, &name, &isClosed, &closedAt, &createdAt, &updatedAt, &locJSON); err != nil {
		return nil, err
	}

	inc := &outbound.IncidentRM{
		ID:        id,
		Name:      name,
		IsClosed:  isClosed,
		ClosedAt:  closedAt,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	if len(locJSON) > 0 {
		loc, err := parseLocation(locJSON)
		if err != nil {
			return nil, fmt.Errorf("parse location for incident %s: %w", id, err)
		}

		inc.Location = loc
	}

	return inc, nil
}

// loadDivisions bulk-fetches active divisions for the given incidents, keyed by incident ID.
func (q *Queries) loadDivisions(ctx context.Context, incidents []*outbound.IncidentRM) error {
	if len(incidents) == 0 {
		return nil
	}

	ids := make([]uuid.UUID, len(incidents))

	idx := make(map[uuid.UUID]*outbound.IncidentRM, len(incidents))
	for i, inc := range incidents {
		ids[i] = inc.ID
		idx[inc.ID] = inc
	}

	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, name, description, removed_at
		FROM rm_incident_division
		WHERE incident_id = ANY($1)
		ORDER BY incident_id, name`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			divID      uuid.UUID
			incidentID uuid.UUID
			name       string
			desc       string
			removedAt  *time.Time
		)
		if err := rows.Scan(&divID, &incidentID, &name, &desc, &removedAt); err != nil {
			return err
		}

		if inc, ok := idx[incidentID]; ok {
			inc.Divisions = append(inc.Divisions, &outbound.DivisionRM{
				ID:          divID,
				Name:        name,
				Description: desc,
				RemovedAt:   removedAt,
			})
		}
	}

	return rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListMessages(ctx context.Context, incidentID uuid.UUID) ([]*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "listing messages", "incident_id", incidentID)

	rows, err := q.pool.Query(ctx, `
		SELECT id, number, incident_id, content, sender, sender_detail,
		       receiver, receiver_detail, medium, msg_time,
		       created_at, updated_at, triage, priority, division_ids
		FROM rm_message
		WHERE incident_id = $1
		ORDER BY msg_time DESC, created_at DESC`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return collectMessages(rows)
}

func (q *Queries) GetMessage(ctx context.Context, id uuid.UUID) (*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "getting message", "id", id)

	rows, err := q.pool.Query(ctx, `
		SELECT id, number, incident_id, content, sender, sender_detail,
		       receiver, receiver_detail, medium, msg_time,
		       created_at, updated_at, triage, priority, division_ids
		FROM rm_message
		WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	msgs, err := collectMessages(rows)
	if err != nil {
		return nil, err
	}

	if len(msgs) == 0 {
		return nil, shared.ErrNotFound
	}

	return msgs[0], nil
}

func collectMessages(rows pgx.Rows) ([]*outbound.MessageRM, error) {
	defer rows.Close()

	var out []*outbound.MessageRM

	for rows.Next() {
		var (
			id             uuid.UUID
			number         int
			incidentID     uuid.UUID
			content        string
			sender         string
			senderDetail   string
			receiver       string
			receiverDetail string
			medium         string
			msgTime        time.Time
			createdAt      time.Time
			updatedAt      time.Time
			triage         string
			priority       string
			divisionIDs    []uuid.UUID
		)
		if err := rows.Scan(
			&id, &number, &incidentID, &content, &sender, &senderDetail,
			&receiver, &receiverDetail, &medium, &msgTime,
			&createdAt, &updatedAt, &triage, &priority, &divisionIDs,
		); err != nil {
			return nil, err
		}

		out = append(out, &outbound.MessageRM{
			ID:             id,
			Number:         number,
			IncidentID:     incidentID,
			Content:        content,
			Sender:         sender,
			SenderDetail:   senderDetail,
			Receiver:       receiver,
			ReceiverDetail: receiverDetail,
			Medium:         medium,
			Time:           msgTime,
			CreatedAt:      createdAt,
			UpdatedAt:      updatedAt,
			Triage:         triage,
			Priority:       priority,
			DivisionIDs:    divisionIDs,
		})
	}

	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Layers
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing layers", "incident_id", incidentID)

	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, name, geojson, revision
		FROM rm_layer_features
		WHERE incident_id = $1 AND removed = false
		ORDER BY name`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*outbound.LayerRM

	for rows.Next() {
		var (
			id       uuid.UUID
			incID    uuid.UUID
			name     string
			geojson  json.RawMessage
			revision int
		)
		if err := rows.Scan(&id, &incID, &name, &geojson, &revision); err != nil {
			return nil, err
		}

		out = append(out, &outbound.LayerRM{
			ID:         id,
			IncidentID: incID,
			Name:       name,
			GeoJSON:    geojson,
			Revision:   revision,
		})
	}

	return out, rows.Err()
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// parseLocation decodes the jsonb location column into a LocationRM.
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
