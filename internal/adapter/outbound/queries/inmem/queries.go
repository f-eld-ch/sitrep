// Package inmem implements the outbound.Queries port against the in-memory
// projection handlers. It is the read-side counterpart of the in-memory event
// store and is intended for use in tests that exercise the full write→project→read
// cycle without a database.
package inmem

import (
	"context"
	"log/slog"
	"sort"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.Queries = (*Queries)(nil)

// Queries implements outbound.Queries by reading directly from the in-memory
// projection handlers. It must be constructed with the same handler instances
// that the Projector is writing to.
type Queries struct {
	incidents *projection.IncidentHandler
	divisions *projection.IncidentDivisionHandler
	messages  *projection.MessageHandler
	layers    *projection.LayerFeaturesHandler
}

func NewQueries(
	incidents *projection.IncidentHandler,
	divisions *projection.IncidentDivisionHandler,
	messages *projection.MessageHandler,
	layers *projection.LayerFeaturesHandler,
) *Queries {
	return &Queries{
		incidents: incidents,
		divisions: divisions,
		messages:  messages,
		layers:    layers,
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Incidents
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListIncidents(ctx context.Context) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing incidents")

	rows := q.incidents.All()

	out := make([]*outbound.IncidentRM, 0, len(rows))
	for _, row := range rows {
		if row.IsDeleted {
			continue
		}

		out = append(out, q.toIncidentRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	slog.DebugContext(ctx, "listed incidents", "count", len(out))

	return out, nil
}

func (q *Queries) GetIncident(ctx context.Context, id uuid.UUID) (*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "getting incident", "id", id)

	row := q.incidents.Get(id)
	if row == nil || row.IsDeleted {
		return nil, shared.ErrNotFound
	}

	return q.toIncidentRM(row), nil
}

func (q *Queries) toIncidentRM(row *projection.IncidentRow) *outbound.IncidentRM {
	inc := &outbound.IncidentRM{
		ID:        row.ID,
		ParentID:  row.ParentID,
		Name:      row.Name,
		IsClosed:  row.IsClosed,
		ClosedAt:  row.ClosedAt,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
	for _, div := range q.divisions.ForIncident(row.ID) {
		inc.Divisions = append(inc.Divisions, &outbound.DivisionRM{
			ID:          div.ID,
			Name:        div.Name,
			Description: div.Description,
			RemovedAt:   div.RemovedAt,
		})
	}

	return inc
}

// ──────────────────────────────────────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListMessages(ctx context.Context, incidentID uuid.UUID) ([]*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "listing messages", "incident_id", incidentID)
	rows := q.messages.ForIncident(incidentID)

	out := make([]*outbound.MessageRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, toMessageRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Time.Equal(out[j].Time) {
			return out[i].CreatedAt.After(out[j].CreatedAt)
		}

		return out[i].Time.After(out[j].Time)
	})

	return out, nil
}

func (q *Queries) GetMessage(ctx context.Context, id uuid.UUID) (*outbound.MessageRM, error) {
	slog.DebugContext(ctx, "getting message", "id", id)

	row := q.messages.Get(id)
	if row == nil || row.Deleted {
		return nil, shared.ErrNotFound
	}

	return toMessageRM(row), nil
}

func toMessageRM(row *projection.MessageRow) *outbound.MessageRM {
	return &outbound.MessageRM{
		ID:             row.ID,
		Number:         row.Number,
		IncidentID:     row.IncidentID,
		Content:        row.Content,
		Sender:         row.Sender,
		SenderDetail:   row.SenderDetail,
		Receiver:       row.Receiver,
		ReceiverDetail: row.ReceiverDetail,
		Medium:         row.Medium,
		Time:           row.MsgTime,
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
		Triage:         row.Triage,
		Priority:       row.Priority,
		DivisionIDs:    row.DivisionIDs,
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Layers
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing layers", "incident_id", incidentID)
	rows := q.layers.ForIncident(incidentID)

	return q.layerRowsToRM(rows, nil), nil
}

func (q *Queries) ListVisibleLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing visible layers", "incident_id", incidentID)

	rows := q.layers.ForIncident(incidentID)
	for _, incidentRow := range q.incidents.All() {
		if incidentRow.IsDeleted || incidentRow.ParentID == nil || *incidentRow.ParentID != incidentID {
			continue
		}

		rows = append(rows, q.layers.ForIncident(incidentRow.ID)...)
	}

	return q.layerRowsToRM(rows, &incidentID), nil
}

func (q *Queries) ListChildIncidents(ctx context.Context, parentID uuid.UUID) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing child incidents", "parent_id", parentID)

	var out []*outbound.IncidentRM

	for _, row := range q.incidents.All() {
		if row.IsDeleted || row.ParentID == nil || *row.ParentID != parentID {
			continue
		}

		out = append(out, q.toIncidentRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})

	return out, nil
}

func (q *Queries) layerRowsToRM(rows []*projection.LayerRow, viewedIncidentID *uuid.UUID) []*outbound.LayerRM {
	out := make([]*outbound.LayerRM, 0, len(rows))
	for _, row := range rows {
		sourceName := ""
		if incidentRow := q.incidents.Get(row.IncidentID); incidentRow != nil {
			sourceName = incidentRow.Name
		}

		out = append(out, &outbound.LayerRM{
			ID:                 row.ID,
			IncidentID:         row.IncidentID,
			SourceIncidentID:   row.IncidentID,
			SourceIncidentName: sourceName,
			Name:               row.Name,
			GeoJSON:            row.GeoJSON(),
			Revision:           row.Revision,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		left := out[i]
		right := out[j]

		if viewedIncidentID != nil {
			leftOwn := left.SourceIncidentID == *viewedIncidentID
			rightOwn := right.SourceIncidentID == *viewedIncidentID

			if leftOwn != rightOwn {
				return leftOwn
			}

			if !leftOwn && left.SourceIncidentName != right.SourceIncidentName {
				return left.SourceIncidentName < right.SourceIncidentName
			}
		}

		return left.Name < right.Name
	})

	return out
}
