package message

import (
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// Recorded is emitted when an operator logs a new message.
type Recorded struct {
	IncidentID     shared.IncidentID `json:"incidentId"`
	Number         int               `json:"number"`
	Content        string            `json:"content"`
	Sender         string            `json:"sender"`
	SenderDetail   string            `json:"senderDetail"`
	Receiver       string            `json:"receiver"`
	ReceiverDetail string            `json:"receiverDetail"`
	Medium         shared.Medium     `json:"medium"`
	Time           time.Time         `json:"time"`
	AuthorSub      string            `json:"authorSub"`
}

// Corrected carries only the fields that changed — sparse update.
type Corrected struct {
	Content        *string        `json:"content,omitempty"`
	Sender         *string        `json:"sender,omitempty"`
	SenderDetail   *string        `json:"senderDetail,omitempty"`
	Receiver       *string        `json:"receiver,omitempty"`
	ReceiverDetail *string        `json:"receiverDetail,omitempty"`
	Medium         *shared.Medium `json:"medium,omitempty"`
	Time           *time.Time     `json:"time,omitempty"`
	EditorSub      string         `json:"editorSub"`
}

// Triaged replaces the triage state and the entire division set atomically.
type Triaged struct {
	Triage      shared.TriageStatus   `json:"triage"`
	Priority    shared.PriorityStatus `json:"priority"`
	DivisionIDs []shared.DivisionID   `json:"divisionIds"`
	TriagedBy   string                `json:"triagedBy"`
}

// Deleted marks the message as soft-deleted.
type Deleted struct {
	Reason shared.DeleteReason `json:"reason"`
}

// Imported is the one-shot import event — see migration design.
// AuthorSub may be empty if the author is ambiguous (was last editor in Hasura).
type Imported struct {
	IncidentID     shared.IncidentID     `json:"incidentId"`
	Number         int                   `json:"number"`
	Content        string                `json:"content"`
	Sender         string                `json:"sender"`
	SenderDetail   string                `json:"senderDetail"`
	Receiver       string                `json:"receiver"`
	ReceiverDetail string                `json:"receiverDetail"`
	Medium         shared.Medium         `json:"medium"`
	Time           time.Time             `json:"time"`
	Triage         shared.TriageStatus   `json:"triage"`
	Priority       shared.PriorityStatus `json:"priority"`
	DivisionIDs    []shared.DivisionID   `json:"divisionIds"`
	AuthorSub      *string               `json:"authorSub,omitempty"`
	LastEditorSub  *string               `json:"lastEditorSub,omitempty"`
	RecordedAt     time.Time             `json:"recordedAt"`
	LastUpdatedAt  time.Time             `json:"lastUpdatedAt"`
}
