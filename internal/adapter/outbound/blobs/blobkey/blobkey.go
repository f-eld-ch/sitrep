// Package blobkey defines and validates blob storage key grammar.
//
// Attachment keys have the form:
//
//	incidents/<incidentUUID>/<attachmentUUID>
//
// Prefix keys (for DeletePrefix) have the form:
//
//	incidents/<incidentUUID>/
//
// Key segments are validated as UUIDs; path traversal, absolute paths, extra
// depth, and non-UUID segments are all rejected.
package blobkey

import (
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// Parse validates a full attachment key and returns its components.
// Returns shared.ErrInvalidInput on any grammar violation.
func Parse(key string) (incidentID, attachmentID uuid.UUID, err error) {
	parts := strings.Split(key, "/")
	if len(parts) != 3 || parts[0] != "incidents" {
		return uuid.UUID{}, uuid.UUID{}, fmt.Errorf("%w: key must be incidents/<uuid>/<uuid>", shared.ErrInvalidInput)
	}

	incidentID, err = uuid.Parse(parts[1])
	if err != nil {
		return uuid.UUID{}, uuid.UUID{}, fmt.Errorf("%w: invalid incident id in key", shared.ErrInvalidInput)
	}

	attachmentID, err = uuid.Parse(parts[2])
	if err != nil {
		return uuid.UUID{}, uuid.UUID{}, fmt.Errorf("%w: invalid attachment id in key", shared.ErrInvalidInput)
	}

	return incidentID, attachmentID, nil
}

// ParsePrefix validates an incident blob prefix and returns the incidentID.
// Returns shared.ErrInvalidInput on any grammar violation.
func ParsePrefix(prefix string) (incidentID uuid.UUID, err error) {
	// Prefix must be exactly "incidents/<uuid>/"
	trimmed := strings.TrimSuffix(prefix, "/")
	parts := strings.Split(trimmed, "/")

	if len(parts) != 2 || parts[0] != "incidents" {
		return uuid.UUID{}, fmt.Errorf("%w: prefix must be incidents/<uuid>/", shared.ErrInvalidInput)
	}

	incidentID, err = uuid.Parse(parts[1])
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("%w: invalid incident id in prefix", shared.ErrInvalidInput)
	}

	return incidentID, nil
}

// ForAttachment builds the canonical storage key from its components.
func ForAttachment(incidentID uuid.UUID, attachmentID uuid.UUID) string {
	return "incidents/" + incidentID.String() + "/" + attachmentID.String()
}

// PrefixForIncident builds the canonical prefix for an incident's blobs.
func PrefixForIncident(incidentID uuid.UUID) string {
	return "incidents/" + incidentID.String() + "/"
}
