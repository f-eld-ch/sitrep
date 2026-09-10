package projection

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// AttachmentRow mirrors readmodel.message_attachment.
type AttachmentRow struct {
	ID          uuid.UUID
	MessageID   uuid.UUID
	IncidentID  uuid.UUID
	Filename    string
	ContentType string
	Size        int64
	Checksum    string
	StorageKey  string
	UploaderSub string
	CreatedAt   time.Time
}

// Compile-time assertion.
var _ Handler = (*MessageHandler)(nil)

// MessageRow mirrors readmodel.message.
type MessageRow struct {
	ID             uuid.UUID
	IncidentID     uuid.UUID
	Number         int
	Content        string
	Sender         string
	SenderDetail   string
	Receiver       string
	ReceiverDetail string
	Medium         string
	MsgTime        time.Time
	Triage         string
	Priority       string
	DivisionIDs    []uuid.UUID
	AuthorSub      *string
	LastEditorSub  *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Deleted        bool
}

// MessageHandler maintains an in-memory projection of the readmodel.message
// and readmodel.message_attachment tables.
type MessageHandler struct {
	mu          sync.RWMutex
	rows        map[uuid.UUID]*MessageRow
	attachments map[uuid.UUID]*AttachmentRow // keyed by attachment ID
}

func NewMessageHandler() *MessageHandler {
	return &MessageHandler{
		rows:        make(map[uuid.UUID]*MessageRow),
		attachments: make(map[uuid.UUID]*AttachmentRow),
	}
}

func (h *MessageHandler) Name() string { return "readmodel.message" }
func (h *MessageHandler) Version() int { return 3 }

func (h *MessageHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.rows = make(map[uuid.UUID]*MessageRow)
	h.attachments = make(map[uuid.UUID]*AttachmentRow)

	return nil
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

func (h *MessageHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := e.StreamID

	switch e.EventType {
	case "Recorded":
		var d struct {
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
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		incidentID, err := uuid.Parse(d.IncidentID)
		if err != nil {
			return err
		}

		authorSub := d.AuthorSub
		h.rows[id] = &MessageRow{
			ID:             id,
			IncidentID:     incidentID,
			Number:         d.Number,
			Content:        d.Content,
			Sender:         d.Sender,
			SenderDetail:   d.SenderDetail,
			Receiver:       d.Receiver,
			ReceiverDetail: d.ReceiverDetail,
			Medium:         d.Medium,
			MsgTime:        d.Time,
			Triage:         "PENDING",
			Priority:       "NORMAL",
			DivisionIDs:    []uuid.UUID{},
			AuthorSub:      &authorSub,
			CreatedAt:      e.OccurredAt,
			UpdatedAt:      e.OccurredAt,
		}

	case "Corrected":
		var d struct {
			Content        *string    `json:"content"`
			Sender         *string    `json:"sender"`
			SenderDetail   *string    `json:"senderDetail"`
			Receiver       *string    `json:"receiver"`
			ReceiverDetail *string    `json:"receiverDetail"`
			Medium         *string    `json:"medium"`
			Time           *time.Time `json:"time"`
			EditorSub      string     `json:"editorSub"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		row := h.rows[id]
		if row == nil {
			return nil
		}

		if d.Content != nil {
			row.Content = *d.Content
		}

		if d.Sender != nil {
			row.Sender = *d.Sender
		}

		if d.SenderDetail != nil {
			row.SenderDetail = *d.SenderDetail
		}

		if d.Receiver != nil {
			row.Receiver = *d.Receiver
		}

		if d.ReceiverDetail != nil {
			row.ReceiverDetail = *d.ReceiverDetail
		}

		if d.Medium != nil {
			row.Medium = *d.Medium
		}

		if d.Time != nil {
			row.MsgTime = *d.Time
		}

		row.LastEditorSub = &d.EditorSub
		row.UpdatedAt = e.OccurredAt

	case "Triaged":
		var d struct {
			Triage      string      `json:"triage"`
			Priority    string      `json:"priority"`
			DivisionIDs []uuid.UUID `json:"divisionIds"`
			TriagedBy   string      `json:"triagedBy"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		row := h.rows[id]
		if row == nil {
			return nil
		}

		row.Triage = d.Triage
		row.Priority = priorityForTriage(d.Triage, d.Priority)
		row.DivisionIDs = d.DivisionIDs
		row.LastEditorSub = &d.TriagedBy
		row.UpdatedAt = e.OccurredAt

	case "Deleted":
		if row := h.rows[id]; row != nil {
			row.Deleted = true
			row.UpdatedAt = e.OccurredAt
		}

		// Remove all attachments for this message.
		for attID, att := range h.attachments {
			if att.MessageID == id {
				delete(h.attachments, attID)
			}
		}

	case "AttachmentAdded":
		var d struct {
			AttachmentID string `json:"attachmentId"`
			Filename     string `json:"filename"`
			ContentType  string `json:"contentType"`
			Size         int64  `json:"size"`
			Checksum     string `json:"checksum"`
			StorageKey   string `json:"storageKey"`
			UploaderSub  string `json:"uploaderSub"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		attID, err := uuid.Parse(d.AttachmentID)
		if err != nil {
			return err
		}

		// Resolve incidentID from message row.
		var incidentID uuid.UUID
		if row := h.rows[id]; row != nil {
			incidentID = row.IncidentID
		}

		if _, exists := h.attachments[attID]; !exists {
			h.attachments[attID] = &AttachmentRow{
				ID:          attID,
				MessageID:   id,
				IncidentID:  incidentID,
				Filename:    d.Filename,
				ContentType: d.ContentType,
				Size:        d.Size,
				Checksum:    d.Checksum,
				StorageKey:  d.StorageKey,
				UploaderSub: d.UploaderSub,
				CreatedAt:   e.OccurredAt,
			}
		}

	case "AttachmentRemoved":
		var d struct {
			AttachmentID string `json:"attachmentId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		attID, err := uuid.Parse(d.AttachmentID)
		if err != nil {
			return err
		}

		delete(h.attachments, attID)
	}

	return nil
}

func priorityForTriage(triage, priority string) string {
	if triage == string(shared.TriageMoreInfo) {
		return string(shared.PriorityNormal)
	}

	return priority
}

// GetAttachment returns the attachment row for the given ID, or nil if not found.
func (h *MessageHandler) GetAttachment(id uuid.UUID) *AttachmentRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	row := h.attachments[id]
	if row == nil {
		return nil
	}

	cp := *row

	return &cp
}

// AttachmentsForMessage returns all attachments for the given message, ordered by created_at.
func (h *MessageHandler) AttachmentsForMessage(messageID uuid.UUID) []*AttachmentRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*AttachmentRow

	for _, row := range h.attachments {
		if row.MessageID == messageID {
			cp := *row
			out = append(out, &cp)
		}
	}

	return out
}

// Get returns the row for the given message ID, or nil if not found.
func (h *MessageHandler) Get(id uuid.UUID) *MessageRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	row := h.rows[id]
	if row == nil {
		return nil
	}

	cp := *row

	return &cp
}

// ForIncident returns all non-deleted messages for the given incident.
func (h *MessageHandler) ForIncident(incidentID uuid.UUID) []*MessageRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var out []*MessageRow

	for _, row := range h.rows {
		if row.IncidentID == incidentID && !row.Deleted {
			cp := *row
			out = append(out, &cp)
		}
	}

	return out
}
