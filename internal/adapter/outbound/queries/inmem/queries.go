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
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// Compile-time assertion.
var _ outbound.Queries = (*Queries)(nil)

// Queries implements outbound.Queries by reading directly from the in-memory
// projection handlers. It must be constructed with the same handler instances
// that the Projector is writing to.
type Queries struct {
	incidents    *projection.IncidentHandler
	divisions    *projection.IncidentDivisionHandler
	messages     *projection.MessageHandler
	layers       *projection.LayerFeaturesHandler
	schadenplatz *projection.SchadenplatzHandler
	resources    *projection.ResourceHandler
	access       outbound.IncidentAccessChecker
}

func NewQueries(
	incidents *projection.IncidentHandler,
	divisions *projection.IncidentDivisionHandler,
	messages *projection.MessageHandler,
	layers *projection.LayerFeaturesHandler,
	schadenplatz *projection.SchadenplatzHandler,
	resourceHandler *projection.ResourceHandler,
	accessCheckers ...outbound.IncidentAccessChecker,
) *Queries {
	var accessChecker outbound.IncidentAccessChecker
	if len(accessCheckers) > 0 {
		accessChecker = accessCheckers[0]
	}

	return &Queries{
		incidents:    incidents,
		divisions:    divisions,
		messages:     messages,
		layers:       layers,
		schadenplatz: schadenplatz,
		resources:    resourceHandler,
		access:       accessChecker,
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

		if !q.canRead(ctx, shared.IncidentID(row.ID)) {
			continue
		}

		out = append(out, q.toIncidentRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	slog.DebugContext(ctx, "listed incidents", slog.Int("count", len(out)))

	return out, nil
}

func (q *Queries) GetIncident(ctx context.Context, id uuid.UUID) (*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "getting incident", slog.String("id", id.String()))

	row := q.incidents.Get(id)
	if row == nil || row.IsDeleted {
		return nil, shared.ErrNotFound
	}

	if !q.canRead(ctx, shared.IncidentID(id)) {
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
	slog.DebugContext(ctx, "listing messages", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, shared.IncidentID(incidentID)) {
		return nil, shared.ErrNotFound
	}

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
	slog.DebugContext(ctx, "getting message", slog.String("id", id.String()))

	row := q.messages.Get(id)
	if row == nil || row.Deleted {
		return nil, shared.ErrNotFound
	}

	if !q.canRead(ctx, shared.IncidentID(row.IncidentID)) {
		return nil, shared.ErrNotFound
	}

	return toMessageRM(row), nil
}

func (q *Queries) ListAttachments(_ context.Context, messageID uuid.UUID) ([]*outbound.AttachmentRM, error) {
	rows := q.messages.AttachmentsForMessage(messageID)

	out := make([]*outbound.AttachmentRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAttachmentRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})

	return out, nil
}

func (q *Queries) GetAttachment(_ context.Context, id uuid.UUID) (*outbound.AttachmentRM, error) {
	row := q.messages.GetAttachment(id)
	if row == nil {
		return nil, shared.ErrNotFound
	}

	return toAttachmentRM(row), nil
}

func toAttachmentRM(row *projection.AttachmentRow) *outbound.AttachmentRM {
	return &outbound.AttachmentRM{
		ID:          row.ID,
		MessageID:   row.MessageID,
		IncidentID:  row.IncidentID,
		Filename:    row.Filename,
		ContentType: row.ContentType,
		Size:        row.Size,
		Checksum:    row.Checksum,
		StorageKey:  row.StorageKey,
		UploaderSub: row.UploaderSub,
		CreatedAt:   row.CreatedAt,
	}
}

func toMessageRM(row *projection.MessageRow) *outbound.MessageRM {
	return &outbound.MessageRM{
		ID:                row.ID,
		Number:            row.Number,
		IncidentID:        row.IncidentID,
		Content:           row.Content,
		Sender:            row.Sender,
		SenderDetail:      row.SenderDetail,
		Receiver:          row.Receiver,
		ReceiverDetail:    row.ReceiverDetail,
		Medium:            row.Medium,
		Time:              row.MsgTime,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
		Triage:            row.Triage,
		Priority:          row.Priority,
		DivisionIDs:       row.DivisionIDs,
		LinkedResourceIDs: row.LinkedResourceIDs,
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Layers
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) ListLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing layers", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, shared.IncidentID(incidentID)) {
		return nil, shared.ErrNotFound
	}

	rows := q.layers.ForIncident(incidentID)

	return q.layerRowsToRM(rows, nil), nil
}

func (q *Queries) ListVisibleLayers(ctx context.Context, incidentID uuid.UUID) ([]*outbound.LayerRM, error) {
	slog.DebugContext(ctx, "listing visible layers", slog.String("incident_id", incidentID.String()))

	if !q.canRead(ctx, shared.IncidentID(incidentID)) {
		return nil, shared.ErrNotFound
	}

	rows := q.layers.ForIncident(incidentID)
	for _, incidentRow := range q.incidents.All() {
		if incidentRow.IsDeleted || incidentRow.ParentID == nil || *incidentRow.ParentID != incidentID {
			continue
		}

		if !q.canRead(ctx, shared.IncidentID(incidentRow.ID)) {
			continue
		}

		rows = append(rows, q.layers.ForIncident(incidentRow.ID)...)
	}

	return q.layerRowsToRM(rows, &incidentID), nil
}

func (q *Queries) GetFeatureIncidentID(_ context.Context, featureID uuid.UUID) (uuid.UUID, error) {
	incidentID, ok := q.layers.FindFeatureIncidentID(featureID)
	if !ok {
		return uuid.UUID{}, shared.ErrNotFound
	}

	return incidentID, nil
}

func (q *Queries) ListChildIncidents(ctx context.Context, parentID uuid.UUID) ([]*outbound.IncidentRM, error) {
	slog.DebugContext(ctx, "listing child incidents", slog.String("parent_id", parentID.String()))

	var out []*outbound.IncidentRM

	for _, row := range q.incidents.All() {
		if row.IsDeleted || row.ParentID == nil || *row.ParentID != parentID {
			continue
		}

		if !q.canRead(ctx, shared.IncidentID(row.ID)) {
			continue
		}

		out = append(out, q.toIncidentRM(row))
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})

	return out, nil
}

func (q *Queries) canRead(ctx context.Context, incidentID shared.IncidentID) bool {
	if q.access == nil {
		return true
	}

	actor, err := identity.ActorFrom(ctx)
	if err != nil {
		return false
	}

	allowed, err := q.access.Can(ctx, actor.Sub, incidentID, access.IncidentRead)

	return err == nil && allowed
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

// ──────────────────────────────────────────────────────────────────────────────
// Schadenplatz
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) GetSchadenplatz(_ context.Context, id uuid.UUID) (*outbound.SchadenplatzRM, error) {
	row := q.schadenplatz.Get(id)
	if row == nil {
		return nil, shared.ErrNotFound
	}

	return spRowToRM(row), nil
}

func (q *Queries) ListSchadenplaetze(_ context.Context, incidentID uuid.UUID) ([]*outbound.SchadenplatzRM, error) {
	rows := q.schadenplatz.ForIncident(incidentID)

	out := make([]*outbound.SchadenplatzRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, spRowToRM(row))
	}

	return out, nil
}

func (q *Queries) ListMessageCasualties(_ context.Context, messageID uuid.UUID) ([]*outbound.MessageCasualtyRM, error) {
	rows := q.schadenplatz.GetMessageCasualties(messageID)

	out := make([]*outbound.MessageCasualtyRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, &outbound.MessageCasualtyRM{
			MessageID:       row.MessageID,
			SchadenplatzID:  row.SchadenplatzID,
			Vermisste:       row.Vermisste,
			Tote:            row.Tote,
			Verletzte:       row.Verletzte,
			Obdachlose:      row.Obdachlose,
			Eingeschlossene: row.Eingeschlossene,
		})
	}

	return out, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Resource
// ──────────────────────────────────────────────────────────────────────────────

func (q *Queries) GetResource(_ context.Context, id uuid.UUID) (*outbound.ResourceRM, error) {
	row := q.resources.Get(id)
	if row == nil {
		return nil, shared.ErrNotFound
	}

	return resourceRowToRM(row), nil
}

func (q *Queries) ListResourcesForSchadenplatz(
	_ context.Context,
	schadenplatzID uuid.UUID,
) ([]*outbound.ResourceRM, error) {
	rows := q.resources.ForSchadenplatz(schadenplatzID)

	out := make([]*outbound.ResourceRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, resourceRowToRM(row))
	}

	return out, nil
}

func (q *Queries) ListResourcesForIncident(ctx context.Context, incidentID uuid.UUID) ([]*outbound.ResourceRM, error) {
	if !q.canRead(ctx, shared.IncidentID(incidentID)) {
		return nil, shared.ErrNotFound
	}

	rows := q.resources.ForIncident(incidentID)
	for _, incidentRow := range q.incidents.All() {
		if incidentRow.IsDeleted || incidentRow.ParentID == nil || *incidentRow.ParentID != incidentID {
			continue
		}

		if q.canRead(ctx, shared.IncidentID(incidentRow.ID)) {
			rows = append(rows, q.resources.ForIncident(incidentRow.ID)...)
		}
	}

	out := make([]*outbound.ResourceRM, 0, len(rows))
	for _, row := range rows {
		out = append(out, resourceRowToRM(row))
	}

	return out, nil
}

func resourceRowToRM(row *projection.ResourceRow) *outbound.ResourceRM {
	rm := &outbound.ResourceRM{
		ID:               row.ID,
		IncidentID:       row.IncidentID,
		SchadenplatzID:   row.SchadenplatzID,
		Formation:        row.Formation,
		Name:             row.Name,
		Size:             row.Size,
		PersonnelCount:   row.PersonnelCount,
		Hauptaufgabe:     row.Hauptaufgabe,
		ContactMedium:    row.ContactMedium,
		ContactDetail:    row.ContactDetail,
		HomeLocationName: row.HomeLocationName,
		HomeLocationLat:  row.HomeLocationLat,
		HomeLocationLng:  row.HomeLocationLng,
		Status:           row.Status,
		StatusAt:         row.StatusAt,
		AlertedAt:        row.AlertedAt,
		ReadyAt:          row.ReadyAt,
		DeployedAt:       row.DeployedAt,
		StoodDownAt:      row.StoodDownAt,
		RelievedAt:       row.RelievedAt,
		EinsatzBeginn:    row.EinsatzBeginn,
		EinsatzEnde:      row.EinsatzEnde,
		PredecessorID:    row.PredecessorID,
		SuccessorID:      row.SuccessorID,
		SourceMessageID:  row.SourceMessageID,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}

	if row.DeploymentLat != nil && row.DeploymentLng != nil {
		label := ""
		if row.DeploymentLabel != nil {
			label = *row.DeploymentLabel
		}

		rm.DeploymentLocation = &outbound.DeploymentLocationRM{
			Lat:   row.DeploymentLat,
			Lng:   row.DeploymentLng,
			Label: label,
		}
	}

	return rm
}

func spRowToRM(row *projection.SchadenplatzRow) *outbound.SchadenplatzRM {
	return &outbound.SchadenplatzRM{
		ID:         row.ID,
		IncidentID: row.IncidentID,
		Name:       row.Name,
		IsDefault:  row.IsDefault,
		GeoJSON:    row.GeoJSON,
		Casualties: outbound.CasualtiesRM{
			Vermisste:       row.Vermisste,
			Tote:            row.Tote,
			Verletzte:       row.Verletzte,
			Obdachlose:      row.Obdachlose,
			Eingeschlossene: row.Eingeschlossene,
		},
		IsMerged:   row.IsMerged,
		MergedInto: row.MergedInto,
		CreatedAt:  row.CreatedAt,
		UpdatedAt:  row.UpdatedAt,
	}
}
