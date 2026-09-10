// Package message implements the Message aggregate root.
//
// Message is its own root: no invariant spans two messages, and contention
// would be severe if messages lived inside the Incident aggregate.
package message

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Attachment holds file metadata stored on the aggregate. Bytes are never here.
type Attachment struct {
	ID          shared.AttachmentID
	Filename    string
	ContentType string
	Size        int64
	Checksum    string
	StorageKey  string
	UploaderSub string
	AddedAt     time.Time
}

// Message is the aggregate root for a single message entry.
type Message struct {
	root eventsourcing.Root

	incidentID     shared.IncidentID
	number         int
	content        string
	sender         string
	senderDetail   string
	receiver       string
	receiverDetail string
	medium         shared.Medium
	time           time.Time
	createdAt      time.Time
	triage         shared.TriageStatus
	priority       shared.PriorityStatus
	divisionIDs    []shared.DivisionID
	authorSub      *string
	lastEditorSub  *string
	deleted        bool
	attachments    []Attachment
}

func New(id shared.MessageID) *Message {
	m := &Message{}
	m.root.SetID(uuid.UUID(id))
	eventsourcing.Register(m, Recorded{}, Corrected{}, Triaged{}, Deleted{}, Imported{},
		AttachmentAdded{}, AttachmentRemoved{})

	return m
}

func (m *Message) Root() *eventsourcing.Root  { return &m.root }
func (m *Message) AggregateType() string      { return "Message" }
func (m *Message) OwnerIncidentID() uuid.UUID { return uuid.UUID(m.incidentID) }

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

func (m *Message) IncidentID() shared.IncidentID         { return m.incidentID }
func (m *Message) Number() int                           { return m.number }
func (m *Message) Content() string                       { return m.content }
func (m *Message) Sender() string                        { return m.sender }
func (m *Message) SenderDetail() string                  { return m.senderDetail }
func (m *Message) Receiver() string                      { return m.receiver }
func (m *Message) ReceiverDetail() string                { return m.receiverDetail }
func (m *Message) Medium() shared.Medium                 { return m.medium }
func (m *Message) Time() time.Time                       { return m.time }
func (m *Message) CreatedAt() time.Time                  { return m.createdAt }
func (m *Message) TriageStatus() shared.TriageStatus     { return m.triage }
func (m *Message) PriorityStatus() shared.PriorityStatus { return m.priority }
func (m *Message) DivisionIDs() []shared.DivisionID      { return m.divisionIDs }
func (m *Message) AuthorSub() *string                    { return m.authorSub }
func (m *Message) IsDeleted() bool                       { return m.deleted }

// Attachments returns a copy of the attachment list so callers cannot mutate aggregate state.
func (m *Message) Attachments() []Attachment {
	cp := make([]Attachment, len(m.attachments))
	copy(cp, m.attachments)

	return cp
}

// ──────────────────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────────────────

// Record logs a new message. Number is assigned by the service (via counter).
func (m *Message) Record(
	incidentID shared.IncidentID,
	number int,
	content, sender, senderDetail, receiver, receiverDetail string,
	medium shared.Medium,
	msgTime time.Time,
	authorSub string,
	at time.Time,
	actor string,
) error {
	if err := validateMessageFields(content, sender, senderDetail, receiver, receiverDetail, medium); err != nil {
		return err
	}

	if err := validateMessageTime(msgTime, at); err != nil {
		return err
	}

	eventsourcing.TrackChange(m, Recorded{
		IncidentID:     incidentID,
		Number:         number,
		Content:        content,
		Sender:         sender,
		SenderDetail:   senderDetail,
		Receiver:       receiver,
		ReceiverDetail: receiverDetail,
		Medium:         medium,
		Time:           msgTime,
		AuthorSub:      authorSub,
	}, at, baseMeta(actor))

	return nil
}

// Correct applies a sparse correction. Only non-nil fields are updated.
func (m *Message) Correct(
	content, sender, senderDetail, receiver, receiverDetail *string,
	medium *shared.Medium,
	msgTime *time.Time,
	editorSub string,
	at time.Time,
	actor string,
) error {
	if m.deleted {
		return shared.ErrNotFound
	}

	nextContent := m.content
	if content != nil {
		nextContent = *content
	}

	nextSender := m.sender
	if sender != nil {
		nextSender = *sender
	}

	nextSenderDetail := m.senderDetail
	if senderDetail != nil {
		nextSenderDetail = *senderDetail
	}

	nextReceiver := m.receiver
	if receiver != nil {
		nextReceiver = *receiver
	}

	nextReceiverDetail := m.receiverDetail
	if receiverDetail != nil {
		nextReceiverDetail = *receiverDetail
	}

	nextMedium := m.medium
	if medium != nil {
		nextMedium = *medium
	}

	if err := validateMessageFields(
		nextContent,
		nextSender,
		nextSenderDetail,
		nextReceiver,
		nextReceiverDetail,
		nextMedium,
	); err != nil {
		return err
	}

	if msgTime != nil {
		if err := validateMessageTime(*msgTime, at); err != nil {
			return err
		}
	}

	eventsourcing.TrackChange(m, Corrected{
		Content:        content,
		Sender:         sender,
		SenderDetail:   senderDetail,
		Receiver:       receiver,
		ReceiverDetail: receiverDetail,
		Medium:         medium,
		Time:           msgTime,
		EditorSub:      editorSub,
	}, at, baseMeta(actor))

	return nil
}

// Triage updates the triage state and division set atomically.
func (m *Message) Triage(
	triage shared.TriageStatus,
	priority shared.PriorityStatus,
	divisionIDs []shared.DivisionID,
	triagedBy string,
	at time.Time,
	actor string,
) error {
	if m.deleted {
		return shared.ErrNotFound
	}

	if triage == shared.TriageMoreInfo {
		priority = shared.PriorityNormal
	}

	eventsourcing.TrackChange(m, Triaged{
		Triage:      triage,
		Priority:    priority,
		DivisionIDs: divisionIDs,
		TriagedBy:   triagedBy,
	}, at, baseMeta(actor))

	return nil
}

// AddAttachment records that a file was attached to this message.
// Adding the same attachmentID twice is an idempotent no-op (safe for retried uploads).
func (m *Message) AddAttachment(
	id shared.AttachmentID,
	filename, contentType string,
	size int64,
	checksum, storageKey, uploaderSub string,
	at time.Time,
	actor string,
) error {
	if m.deleted {
		return shared.ErrNotFound
	}

	if err := validateAttachment(filename, contentType, size); err != nil {
		return err
	}

	// Idempotent: if already present, skip without error.
	for _, a := range m.attachments {
		if a.ID == id {
			return nil
		}
	}

	eventsourcing.TrackChange(m, AttachmentAdded{
		AttachmentID: id,
		Filename:     filename,
		ContentType:  contentType,
		Size:         size,
		Checksum:     checksum,
		StorageKey:   storageKey,
		UploaderSub:  uploaderSub,
	}, at, baseMeta(actor))

	return nil
}

// RemoveAttachment records that an attachment was removed from this message.
func (m *Message) RemoveAttachment(id shared.AttachmentID, removedBy string, at time.Time, actor string) error {
	if m.deleted {
		return shared.ErrNotFound
	}

	found := false

	for _, a := range m.attachments {
		if a.ID == id {
			found = true
			break
		}
	}

	if !found {
		return shared.ErrNotFound
	}

	eventsourcing.TrackChange(m, AttachmentRemoved{
		AttachmentID: id,
		RemovedBy:    removedBy,
	}, at, baseMeta(actor))

	return nil
}

// Delete soft-deletes the message.
func (m *Message) Delete(reason shared.DeleteReason, actor string, at time.Time) error {
	if m.deleted {
		return shared.ErrNotFound
	}

	eventsourcing.TrackChange(m, Deleted{Reason: reason}, at, baseMeta(actor))

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Transition
// ──────────────────────────────────────────────────────────────────────────────

func (m *Message) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Recorded:
		m.incidentID = d.IncidentID
		m.number = d.Number
		m.content = d.Content
		m.sender = d.Sender
		m.senderDetail = d.SenderDetail
		m.receiver = d.Receiver
		m.receiverDetail = d.ReceiverDetail
		m.medium = d.Medium
		m.time = d.Time
		m.createdAt = e.OccurredAt
		m.authorSub = &d.AuthorSub
	case Corrected:
		if d.Content != nil {
			m.content = *d.Content
		}

		if d.Sender != nil {
			m.sender = *d.Sender
		}

		if d.SenderDetail != nil {
			m.senderDetail = *d.SenderDetail
		}

		if d.Receiver != nil {
			m.receiver = *d.Receiver
		}

		if d.ReceiverDetail != nil {
			m.receiverDetail = *d.ReceiverDetail
		}

		if d.Medium != nil {
			m.medium = *d.Medium
		}

		if d.Time != nil {
			m.time = *d.Time
		}

		m.lastEditorSub = &d.EditorSub
	case Triaged:
		m.triage = d.Triage
		m.priority = d.Priority
		m.divisionIDs = d.DivisionIDs
		m.lastEditorSub = &d.TriagedBy
	case Deleted:
		m.deleted = true
	case Imported:
		m.incidentID = d.IncidentID
		m.number = d.Number
		m.content = d.Content
		m.sender = d.Sender
		m.senderDetail = d.SenderDetail
		m.receiver = d.Receiver
		m.receiverDetail = d.ReceiverDetail
		m.medium = d.Medium
		m.time = d.Time
		m.createdAt = d.RecordedAt
		m.triage = d.Triage
		m.priority = d.Priority
		m.divisionIDs = d.DivisionIDs
		m.authorSub = d.AuthorSub
		m.lastEditorSub = d.LastEditorSub
	case AttachmentAdded:
		m.attachments = append(m.attachments, Attachment{
			ID:          d.AttachmentID,
			Filename:    d.Filename,
			ContentType: d.ContentType,
			Size:        d.Size,
			Checksum:    d.Checksum,
			StorageKey:  d.StorageKey,
			UploaderSub: d.UploaderSub,
			AddedAt:     e.OccurredAt,
		})
	case AttachmentRemoved:
		next := m.attachments[:0]
		for _, a := range m.attachments {
			if a.ID != d.AttachmentID {
				next = append(next, a)
			}
		}

		m.attachments = next
	default:
		return fmt.Errorf("message.Transition: unhandled event type %T", e.Data)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const (
	maxMessageClockDrift  = 5 * time.Minute
	MaxAttachmentSize     = 25 << 20 // 25 MiB
	maxAttachmentFilename = 255
)

// allowedContentTypes is the allowlist for attachment content types.
// SVG and HTML are intentionally excluded to prevent stored XSS via the download route.
var allowedContentTypes = map[string]bool{
	"image/jpeg":         true,
	"image/png":          true,
	"image/gif":          true,
	"image/webp":         true,
	"image/tiff":         true,
	"application/pdf":    true,
	"text/plain":         true,
	"text/csv":           true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true,
	"application/vnd.ms-powerpoint":                                             true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"application/zip":              true,
	"application/x-zip-compressed": true,
}

func validateAttachment(filename, contentType string, size int64) error {
	if strings.TrimSpace(filename) == "" {
		return shared.ValidationError{Field: "filename", Message: "must not be empty"}
	}

	if len(filename) > maxAttachmentFilename {
		return shared.ValidationError{Field: "filename", Message: "must not exceed 255 characters"}
	}

	if size <= 0 {
		return shared.ValidationError{Field: "size", Message: "must be greater than zero"}
	}

	if size > MaxAttachmentSize {
		return shared.ValidationError{Field: "size", Message: "exceeds maximum allowed size of 25 MiB"}
	}

	if !allowedContentTypes[contentType] {
		return shared.ValidationError{Field: "contentType", Message: "content type not allowed"}
	}

	return nil
}

func validateMessageFields(content, sender, senderDetail, receiver, receiverDetail string, medium shared.Medium) error {
	if strings.TrimSpace(content) == "" {
		return shared.ValidationError{Field: "content", Message: "must not be empty"}
	}

	if strings.TrimSpace(sender) == "" {
		return shared.ValidationError{Field: "sender", Message: "must not be empty"}
	}

	if strings.TrimSpace(receiver) == "" {
		return shared.ValidationError{Field: "receiver", Message: "must not be empty"}
	}

	if medium == shared.MediumPhone || medium == shared.MediumEmail {
		if strings.TrimSpace(senderDetail) == "" {
			return shared.ValidationError{Field: "senderDetail", Message: "must not be empty"}
		}

		if strings.TrimSpace(receiverDetail) == "" {
			return shared.ValidationError{Field: "receiverDetail", Message: "must not be empty"}
		}
	}

	return nil
}

func validateMessageTime(msgTime, at time.Time) error {
	if msgTime.After(at.Add(maxMessageClockDrift)) {
		return shared.ValidationError{Field: "time", Message: "must not be more than five minutes in the future"}
	}

	return nil
}

func baseMeta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}
