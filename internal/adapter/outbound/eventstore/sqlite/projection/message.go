package projection

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var _ Handler = (*MessageHandler)(nil)

// MessageHandler maintains readmodel_message and readmodel_message_attachment.
type MessageHandler struct{ db *sql.DB }

func NewMessageHandler(db *sql.DB) *MessageHandler { return &MessageHandler{db: db} }

func (h *MessageHandler) Name() string { return "readmodel.message" }
func (h *MessageHandler) Version() int { return 3 }
func (h *MessageHandler) Reset(ctx context.Context) error {
	if _, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_message_attachment`); err != nil {
		return err
	}

	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_message`)

	return err
}

func (h *MessageHandler) Handles(st, t string) bool {
	if st != "Message" {
		return false
	}

	switch t {
	case "Recorded", "Corrected", "Triaged", "Deleted", "Imported",
		"AttachmentAdded", "AttachmentRemoved":
		return true
	}

	return false
}

func (h *MessageHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.message: no tx in context")
	}

	id := e.StreamID.String()

	switch e.EventType {
	case "Recorded":
		type recorded struct {
			IncidentID     string    `json:"incidentId"`
			Number         int       `json:"number"`
			Content        string    `json:"content"`
			Sender         string    `json:"sender"`
			SenderDetail   string    `json:"senderDetail"`
			Receiver       string    `json:"receiver"`
			ReceiverDetail string    `json:"receiverDetail"`
			Medium         string    `json:"medium"`
			Time           time.Time `json:"time"`
			AuthorSub      string    `json:"authorSub"`
		}

		var d recorded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		now := sqlite.FormatTime(e.OccurredAt)

		return exec(tx, ctx, `
			INSERT INTO readmodel_message
			  (id, incident_id, number, content, sender, sender_detail, receiver, receiver_detail,
			   medium, msg_time, triage, priority, division_ids, author_sub, created_at, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING','NORMAL','[]',?,?,?)
			ON CONFLICT (id) DO NOTHING`,
			id, d.IncidentID, d.Number, d.Content, d.Sender, d.SenderDetail,
			d.Receiver, d.ReceiverDetail, d.Medium, sqlite.FormatTime(d.Time),
			d.AuthorSub, now, now)

	case "Imported":
		type imported struct {
			IncidentID     string      `json:"incidentId"`
			Number         int         `json:"number"`
			Content        string      `json:"content"`
			Sender         string      `json:"sender"`
			SenderDetail   string      `json:"senderDetail"`
			Receiver       string      `json:"receiver"`
			ReceiverDetail string      `json:"receiverDetail"`
			Medium         string      `json:"medium"`
			Time           time.Time   `json:"time"`
			Triage         string      `json:"triage"`
			Priority       string      `json:"priority"`
			DivisionIDs    []uuid.UUID `json:"divisionIds"`
			AuthorSub      *string     `json:"authorSub"`
			LastEditorSub  *string     `json:"lastEditorSub"`
			RecordedAt     time.Time   `json:"recordedAt"`
			LastUpdatedAt  time.Time   `json:"lastUpdatedAt"`
		}

		var d imported
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if d.DivisionIDs == nil {
			d.DivisionIDs = []uuid.UUID{}
		}

		createdAt := d.RecordedAt
		if createdAt.IsZero() {
			createdAt = e.OccurredAt
		}

		updatedAt := d.LastUpdatedAt
		if updatedAt.IsZero() {
			updatedAt = createdAt
		}

		d.Priority = priorityForTriage(d.Triage, d.Priority)

		divJSON, err := json.Marshal(d.DivisionIDs)
		if err != nil {
			return fmt.Errorf("marshal division_ids: %w", err)
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_message
			  (id, incident_id, number, content, sender, sender_detail, receiver, receiver_detail,
			   medium, msg_time, triage, priority, division_ids, author_sub, last_editor_sub,
			   created_at, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT (id) DO UPDATE
			  SET content = excluded.content, triage = excluded.triage,
			      priority = excluded.priority, division_ids = excluded.division_ids,
			      updated_at = excluded.updated_at`,
			id, d.IncidentID, d.Number, d.Content, d.Sender, d.SenderDetail,
			d.Receiver, d.ReceiverDetail, d.Medium, sqlite.FormatTime(d.Time),
			d.Triage, d.Priority, string(divJSON), d.AuthorSub, d.LastEditorSub,
			sqlite.FormatTime(createdAt), sqlite.FormatTime(updatedAt))

	case "Corrected":
		type corrected struct {
			Content        *string `json:"content"`
			Sender         *string `json:"sender"`
			SenderDetail   *string `json:"senderDetail"`
			Receiver       *string `json:"receiver"`
			ReceiverDetail *string `json:"receiverDetail"`
			Medium         *string `json:"medium"`
			// Time is RFC3339 from the event payload. Parse and reformat to
			// TimeLayout before storing — RFC3339 has variable width (elides trailing
			// zeros) and breaks ORDER BY on msg_time. If nil, COALESCE keeps existing.
			Time      *string `json:"time"`
			EditorSub string  `json:"editorSub"`
		}

		var d corrected
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		msgTimeNT, err := sqlite.ParseEventTime(d.Time)
		if err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_message SET
			  content         = COALESCE(?, content),
			  sender          = COALESCE(?, sender),
			  sender_detail   = COALESCE(?, sender_detail),
			  receiver        = COALESCE(?, receiver),
			  receiver_detail = COALESCE(?, receiver_detail),
			  medium          = COALESCE(?, medium),
			  msg_time        = COALESCE(?, msg_time),
			  last_editor_sub = ?,
			  updated_at      = ?
			WHERE id = ?`,
			d.Content, d.Sender, d.SenderDetail, d.Receiver, d.ReceiverDetail,
			d.Medium, &msgTimeNT, d.EditorSub, sqlite.FormatTime(e.OccurredAt), id)

	case "Triaged":
		type triaged struct {
			Triage      string      `json:"triage"`
			Priority    string      `json:"priority"`
			DivisionIDs []uuid.UUID `json:"divisionIds"`
			TriagedBy   string      `json:"triagedBy"`
		}

		var d triaged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		d.Priority = priorityForTriage(d.Triage, d.Priority)

		divJSON, err := json.Marshal(d.DivisionIDs)
		if err != nil {
			return fmt.Errorf("marshal division_ids: %w", err)
		}

		return exec(tx, ctx, `
			UPDATE readmodel_message
			SET triage = ?, priority = ?, division_ids = ?, last_editor_sub = ?, updated_at = ?
			WHERE id = ?`,
			d.Triage, d.Priority, string(divJSON), d.TriagedBy, sqlite.FormatTime(e.OccurredAt), id)

	case "Deleted":
		if err := exec(tx, ctx, `DELETE FROM readmodel_message WHERE id = ?`, id); err != nil {
			return err
		}

		return exec(tx, ctx, `DELETE FROM readmodel_message_attachment WHERE message_id = ?`, id)

	case "AttachmentAdded":
		type attachmentAdded struct {
			AttachmentID string `json:"attachmentId"`
			Filename     string `json:"filename"`
			ContentType  string `json:"contentType"`
			Size         int64  `json:"size"`
			Checksum     string `json:"checksum"`
			StorageKey   string `json:"storageKey"`
			UploaderSub  string `json:"uploaderSub"`
		}

		var d attachmentAdded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		var incidentID string

		row := tx.QueryRowContext(ctx, `SELECT incident_id FROM readmodel_message WHERE id = ?`, id)
		if err := row.Scan(&incidentID); err != nil {
			return fmt.Errorf("readmodel.message_attachment: resolve incident_id: %w", err)
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_message_attachment
			  (id, message_id, incident_id, filename, content_type, size, checksum, storage_key, uploader_sub, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO NOTHING`,
			d.AttachmentID, id, incidentID, d.Filename, d.ContentType,
			d.Size, d.Checksum, d.StorageKey, d.UploaderSub, sqlite.FormatTime(e.OccurredAt))

	case "AttachmentRemoved":
		type attachmentRemoved struct {
			AttachmentID string `json:"attachmentId"`
		}

		var d attachmentRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `DELETE FROM readmodel_message_attachment WHERE id = ?`, d.AttachmentID)
	}

	return nil
}

func priorityForTriage(triage, priority string) string {
	if triage == string(shared.TriageMoreInfo) {
		return string(shared.PriorityNormal)
	}

	return priority
}
