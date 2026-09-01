package incident

import (
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// ──────────────────────────────────────────────────────────────────────────────
// Value objects embedded in events
// ──────────────────────────────────────────────────────────────────────────────

type LocationData struct {
	Name        string      `json:"name"`
	Coordinates *[2]float64 `json:"coordinates,omitempty"` // [lon, lat]
}

type DivisionData struct {
	ID          shared.DivisionID `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Incident events
// ──────────────────────────────────────────────────────────────────────────────

type Opened struct {
	Name     string        `json:"name"`
	Location *LocationData `json:"location,omitempty"`
}

type Renamed struct {
	Name string `json:"name"`
}

type LocationChanged struct {
	Location LocationData `json:"location"`
}

// DivisionAdded fires for each new division in a set-replacement.
type DivisionAdded struct {
	Division DivisionData `json:"division"`
}

// DivisionRenamed fires when an existing division's name or description changes.
// Description is a pointer for backward-compatible event replay (old events lack it).
type DivisionRenamed struct {
	ID          shared.DivisionID `json:"id"`
	Name        string            `json:"name"`
	Description *string           `json:"description,omitempty"`
}

// DivisionRemoved fires when a division is removed in a set-replacement.
type DivisionRemoved struct {
	ID shared.DivisionID `json:"id"`
}

type Closed struct {
	ClosedAt time.Time          `json:"closedAt"`
	Reason   shared.CloseReason `json:"reason"`
}

type Reopened struct{}

type Deleted struct {
	Reason shared.DeleteReason `json:"reason"`
}

// Imported is the one-shot event written by the goose import migration.
// After version 1, all further events on the stream are ordinary domain events.
type Imported struct {
	Name      string         `json:"name"`
	Location  *LocationData  `json:"location,omitempty"`
	Divisions []DivisionData `json:"divisions"`
	CreatedAt time.Time      `json:"createdAt"`
	// UpdatedAt carries the last-modified time from the legacy incidents table.
	// Pointer for backward-compat: old events without it fall back to CreatedAt.
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
	ClosedAt  *time.Time `json:"closedAt,omitempty"`
	DeletedAt *time.Time `json:"deletedAt,omitempty"`
	// LegacyLocationID preserved for the pre-flight diff.
	LegacyLocationID *uuid.UUID `json:"legacyLocationId,omitempty"`
}
