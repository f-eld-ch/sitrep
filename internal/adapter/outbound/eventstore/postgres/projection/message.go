package projection

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion: MessageHandler implements Handler.
var _ Handler = (*MessageHandler)(nil)

// MessageHandler maintains the rm_message read model.
type MessageHandler struct {
	pool *pgxpool.Pool
}

func NewMessageHandler(pool *pgxpool.Pool) *MessageHandler {
	return &MessageHandler{pool: pool}
}

func (h *MessageHandler) Name() string { return "rm_message" }
func (h *MessageHandler) Version() int { return 2 }
func (h *MessageHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE rm_message`)
	return err
}

func (h *MessageHandler) Handles(st, t string) bool {
	if st != "Message" {
		return false
	}

	switch t {
	case "Recorded", "Corrected", "Triaged", "Deleted", "Imported":
		return true
	}

	return false
}

func (h *MessageHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	db, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("rm_message: no tx in context")
	}

	id := e.StreamID

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

		return exec(db, ctx, `
			INSERT INTO rm_message
			  (id, incident_id, number, content, sender, sender_detail, receiver, receiver_detail,
			   medium, msg_time, triage, priority, division_ids, author_sub, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING','NORMAL','{}',$11,$12,$12)
			ON CONFLICT (id) DO NOTHING`,
			id, d.IncidentID, d.Number, d.Content, d.Sender, d.SenderDetail,
			d.Receiver, d.ReceiverDetail, d.Medium, d.Time, d.AuthorSub, e.OccurredAt)

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

		return exec(db, ctx, `
			INSERT INTO rm_message
			  (id, incident_id, number, content, sender, sender_detail, receiver, receiver_detail,
			   medium, msg_time, triage, priority, division_ids, author_sub, last_editor_sub,
			   created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
			ON CONFLICT (id) DO UPDATE
			  SET content = EXCLUDED.content, triage = EXCLUDED.triage,
			      priority = EXCLUDED.priority, division_ids = EXCLUDED.division_ids,
			      updated_at = EXCLUDED.updated_at`,
			id, d.IncidentID, d.Number, d.Content, d.Sender, d.SenderDetail,
			d.Receiver, d.ReceiverDetail, d.Medium, d.Time, d.Triage, d.Priority,
			d.DivisionIDs, d.AuthorSub, d.LastEditorSub, createdAt, updatedAt)

	case "Corrected":
		type corrected struct {
			Content        *string `json:"content"`
			Sender         *string `json:"sender"`
			SenderDetail   *string `json:"senderDetail"`
			Receiver       *string `json:"receiver"`
			ReceiverDetail *string `json:"receiverDetail"`
			Medium         *string `json:"medium"`
			Time           *string `json:"time"`
			EditorSub      string  `json:"editorSub"`
		}

		var d corrected
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(db, ctx, `
			UPDATE rm_message SET
			  content         = COALESCE($2, content),
			  sender          = COALESCE($3, sender),
			  sender_detail   = COALESCE($4, sender_detail),
			  receiver        = COALESCE($5, receiver),
			  receiver_detail = COALESCE($6, receiver_detail),
			  medium          = COALESCE($7, medium),
			  msg_time        = COALESCE($8::timestamptz, msg_time),
			  last_editor_sub = $9,
			  updated_at      = $10
			WHERE id = $1`,
			id, d.Content, d.Sender, d.SenderDetail, d.Receiver, d.ReceiverDetail,
			d.Medium, d.Time, d.EditorSub, e.OccurredAt)

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

		return exec(db, ctx, `
			UPDATE rm_message
			SET triage = $2, priority = $3, division_ids = $4, last_editor_sub = $5,
			    updated_at = $6
			WHERE id = $1`,
			id, d.Triage, d.Priority, d.DivisionIDs, d.TriagedBy, e.OccurredAt)

	case "Deleted":
		return exec(db, ctx, `DELETE FROM rm_message WHERE id = $1`, id)
	}

	return nil
}

func priorityForTriage(triage, priority string) string {
	if triage == string(shared.TriageMoreInfo) {
		return string(shared.PriorityNormal)
	}

	return priority
}
