package service

import (
	"context"
	"errors"
	"log/slog"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// Compile-time assertions: concrete services satisfy their inbound port interfaces.
var (
	_ inbound.IncidentService = (*IncidentService)(nil)
	_ inbound.MessageService  = (*MessageService)(nil)
	_ inbound.LayerService    = (*LayerService)(nil)
	_ inbound.FeatureService  = (*FeatureService)(nil)
)

// logIfUnexpected logs err at error level when it is an infrastructure/unexpected
// error. Domain errors are intentionally excluded — they are expected business
// outcomes and are logged at the resolver boundary.
func logIfUnexpected(ctx context.Context, op string, err error, attrs ...any) {
	if err == nil {
		return
	}

	if errors.Is(err, shared.ErrNotFound) ||
		errors.Is(err, shared.ErrIncidentNotOpen) ||
		errors.Is(err, shared.ErrIncidentNotClosed) ||
		errors.Is(err, shared.ErrIncidentDeleted) ||
		errors.Is(err, shared.ErrAlreadyClosed) ||
		errors.Is(err, shared.ErrAlreadyOpen) ||
		errors.Is(err, shared.ErrForbidden) ||
		errors.Is(err, shared.ErrInvalidInput) ||
		errors.Is(err, shared.ErrInvalidParent) ||
		errors.Is(err, shared.ErrConflict) {
		return
	}

	slog.ErrorContext(ctx, "service error", append([]any{"operation", op, "error", err}, attrs...)...)
}
