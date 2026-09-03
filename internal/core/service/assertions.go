package service

import (
	"context"
	"errors"
	"log/slog"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

func requireIncidentAccess(
	ctx context.Context,
	checker outbound.IncidentAccessChecker,
	actor identity.Actor,
	incidentID shared.IncidentID,
	action access.Action,
) error {
	if checker == nil {
		return nil
	}

	allowed, err := checker.Can(ctx, actor.Sub, incidentID, action)
	if err != nil {
		return err
	}

	if !allowed {
		return shared.ErrForbidden
	}

	return nil
}

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
func logIfUnexpected(ctx context.Context, op string, err error, attrs ...slog.Attr) {
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

	slog.LogAttrs(ctx, slog.LevelError, "service error",
		append([]slog.Attr{slog.String("operation", op), slog.String("error", err.Error())}, attrs...)...)
}
