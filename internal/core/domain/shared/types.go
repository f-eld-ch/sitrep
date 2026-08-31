// Package shared contains value types, typed errors and enums shared across all
// domain aggregates. It must remain free of infrastructure imports.
package shared

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// ──────────────────────────────────────────────────────────────────────────────
// Typed identifiers (newtype pattern over uuid.UUID)
// ──────────────────────────────────────────────────────────────────────────────

type (
	IncidentID uuid.UUID
	MessageID  uuid.UUID
	LayerID    uuid.UUID
	FeatureID  uuid.UUID
	DivisionID uuid.UUID
)

func (id IncidentID) String() string { return uuid.UUID(id).String() }
func (id MessageID) String() string  { return uuid.UUID(id).String() }
func (id LayerID) String() string    { return uuid.UUID(id).String() }
func (id FeatureID) String() string  { return uuid.UUID(id).String() }
func (id DivisionID) String() string { return uuid.UUID(id).String() }

func (id IncidentID) MarshalText() ([]byte, error) { return uuid.UUID(id).MarshalText() }
func (id MessageID) MarshalText() ([]byte, error)  { return uuid.UUID(id).MarshalText() }
func (id LayerID) MarshalText() ([]byte, error)    { return uuid.UUID(id).MarshalText() }
func (id FeatureID) MarshalText() ([]byte, error)  { return uuid.UUID(id).MarshalText() }
func (id DivisionID) MarshalText() ([]byte, error) { return uuid.UUID(id).MarshalText() }

func (id *IncidentID) UnmarshalText(b []byte) error { return (*uuid.UUID)(id).UnmarshalText(b) }
func (id *MessageID) UnmarshalText(b []byte) error  { return (*uuid.UUID)(id).UnmarshalText(b) }
func (id *LayerID) UnmarshalText(b []byte) error    { return (*uuid.UUID)(id).UnmarshalText(b) }
func (id *FeatureID) UnmarshalText(b []byte) error  { return (*uuid.UUID)(id).UnmarshalText(b) }
func (id *DivisionID) UnmarshalText(b []byte) error { return (*uuid.UUID)(id).UnmarshalText(b) }

func ParseIncidentID(s string) (IncidentID, error) {
	id, err := uuid.Parse(s)
	return IncidentID(id), err
}

func ParseMessageID(s string) (MessageID, error) {
	id, err := uuid.Parse(s)
	return MessageID(id), err
}

func ParseLayerID(s string) (LayerID, error) {
	id, err := uuid.Parse(s)
	return LayerID(id), err
}

func ParseFeatureID(s string) (FeatureID, error) {
	id, err := uuid.Parse(s)
	return FeatureID(id), err
}

func ParseDivisionID(s string) (DivisionID, error) {
	id, err := uuid.Parse(s)
	return DivisionID(id), err
}

// ──────────────────────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────────────────────

type Medium string

const (
	MediumRadio Medium = "RADIO"
	MediumPhone Medium = "PHONE"
	MediumEmail Medium = "EMAIL"
	MediumOther Medium = "OTHER"
)

type TriageStatus string

const (
	TriagePending  TriageStatus = "PENDING"
	TriageDone     TriageStatus = "DONE"
	TriageReset    TriageStatus = "RESET"
	TriageMoreInfo TriageStatus = "MOREINFO"
)

type PriorityStatus string

const (
	PriorityNormal PriorityStatus = "NORMAL"
	PriorityHigh   PriorityStatus = "HIGH"
	// CRITICAL is intentionally absent — legacy rows map to HIGH on import.
)

type CloseReason string

const (
	ReasonManual      CloseReason = "MANUAL"
	ReasonAutoTimeout CloseReason = "AUTO_TIMEOUT"
	ReasonParent      CloseReason = "PARENT_CLOSED"
)

type DeleteReason string

const (
	DeleteReasonManual        DeleteReason = "MANUAL"
	DeleteReasonParentDeleted DeleteReason = "PARENT_DELETED"
	DeleteReasonPurge         DeleteReason = "PURGE"
	DeleteReasonLayerRemoved  DeleteReason = "LAYER_REMOVED"
)

// ──────────────────────────────────────────────────────────────────────────────
// Typed domain errors — map to extensions.code in the GraphQL response
// ──────────────────────────────────────────────────────────────────────────────

var (
	ErrNotFound          = errors.New("NOT_FOUND")
	ErrIncidentNotOpen   = errors.New("INCIDENT_NOT_OPEN")
	ErrIncidentNotClosed = errors.New("INCIDENT_NOT_CLOSED")
	ErrIncidentDeleted   = errors.New("INCIDENT_DELETED")
	ErrAlreadyClosed     = errors.New("ALREADY_CLOSED")
	ErrAlreadyOpen       = errors.New("ALREADY_OPEN")
	ErrForbidden         = errors.New("FORBIDDEN")
	ErrInvalidInput      = errors.New("INVALID_INPUT")
	ErrConflict          = errors.New("CONFLICT")
)

// ValidationError carries a field-level message suitable for the API response.
type ValidationError struct {
	Field   string
	Message string
}

func (e ValidationError) Error() string {
	return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}

func (e ValidationError) Unwrap() error { return ErrInvalidInput }
