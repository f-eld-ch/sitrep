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
}

func New(id shared.MessageID) *Message {
	m := &Message{}
	m.root.SetID(uuid.UUID(id))
	eventsourcing.Register(m, Recorded{}, Corrected{}, Triaged{}, Deleted{}, Imported{})
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
	if err := validateMessageFields(nextContent, nextSender, nextSenderDetail, nextReceiver, nextReceiverDetail, nextMedium); err != nil {
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
	default:
		return fmt.Errorf("message.Transition: unhandled event type %T", e.Data)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const maxMessageClockDrift = 5 * time.Minute

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
