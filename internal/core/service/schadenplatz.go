package service

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// SchadenplatzService handles write-side operations for the Schadenplatz aggregate.
type SchadenplatzService struct {
	tx        outbound.Transactor
	repo      outbound.SchadenplatzRepository
	incidents outbound.IncidentRepository
	access    outbound.IncidentAccessChecker
	clock     outbound.Clock
	ids       outbound.IDs
	notifier  outbound.EventNotifier
	tracer    trace.Tracer
}

var _ inbound.SchadenplatzService = (*SchadenplatzService)(nil)

func NewSchadenplatzService(
	tx outbound.Transactor,
	repo outbound.SchadenplatzRepository,
	incidents outbound.IncidentRepository,
	access outbound.IncidentAccessChecker,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *SchadenplatzService {
	return &SchadenplatzService{
		tx:        tx,
		repo:      repo,
		incidents: incidents,
		access:    access,
		clock:     clock,
		ids:       ids,
		notifier:  notifier,
		tracer:    otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// CreateSchadenplatz creates a new Schadenplatz for an incident.
func (s *SchadenplatzService) CreateSchadenplatz(
	ctx context.Context,
	incidentID shared.IncidentID,
	name string,
	actor identity.Actor,
) (inbound.SchadenplatzState, error) {
	ctx, span := s.tracer.Start(ctx, "SchadenplatzService.CreateSchadenplatz",
		trace.WithAttributes(attribute.String("incident.id", incidentID.String())))
	defer span.End()

	slog.DebugContext(ctx, "creating schadenplatz",
		slog.String("incident_id", incidentID.String()),
		slog.String("name", name),
		slog.String("actor", actor.Sub))

	id := shared.SchadenplatzID(s.ids.New())
	at := s.clock.Now()

	var sp *schadenplatz.Schadenplatz

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, incidentID, access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, incidentID)
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		sp = schadenplatz.New(id)
		if err := sp.Create(incidentID, name, false, at, actor.Sub); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, sp)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.SchadenplatzState{}, err
	}

	span.SetAttributes(attribute.String("schadenplatz.id", id.String()))

	_ = s.notifier.Notify(ctx)

	return stateFromSchadenplatz(sp), nil
}

// RenameSchadenplatz renames an existing Schadenplatz.
func (s *SchadenplatzService) RenameSchadenplatz(
	ctx context.Context,
	id shared.SchadenplatzID,
	name string,
	actor identity.Actor,
) (inbound.SchadenplatzState, error) {
	ctx, span := s.tracer.Start(ctx, "SchadenplatzService.RenameSchadenplatz",
		trace.WithAttributes(attribute.String("schadenplatz.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "renaming schadenplatz",
		slog.String("schadenplatz_id", id.String()),
		slog.String("name", name),
		slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var sp *schadenplatz.Schadenplatz

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error

		sp, err = s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, sp.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, sp.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		if err := sp.Rename(name, actor.Sub, at); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, sp)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.SchadenplatzState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return stateFromSchadenplatz(sp), nil
}

// SetSchadenplatzGeometry updates the GeoJSON geometry of a Schadenplatz.
func (s *SchadenplatzService) SetSchadenplatzGeometry(
	ctx context.Context,
	id shared.SchadenplatzID,
	geoJSON []byte,
	actor identity.Actor,
) (inbound.SchadenplatzState, error) {
	ctx, span := s.tracer.Start(ctx, "SchadenplatzService.SetSchadenplatzGeometry",
		trace.WithAttributes(attribute.String("schadenplatz.id", id.String())))
	defer span.End()

	at := s.clock.Now()

	var sp *schadenplatz.Schadenplatz

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error

		sp, err = s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, sp.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, sp.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		if err := sp.SetGeometry(geoJSON, actor.Sub, at); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, sp)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.SchadenplatzState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return stateFromSchadenplatz(sp), nil
}

// RecordCasualties records casualty deltas from a message triage.
func (s *SchadenplatzService) RecordCasualties(
	ctx context.Context,
	schadenplatzID shared.SchadenplatzID,
	sourceMessageID shared.MessageID,
	deltas schadenplatz.CasualtyDeltas,
	occurredAt time.Time,
	actor identity.Actor,
) (inbound.SchadenplatzState, error) {
	ctx, span := s.tracer.Start(ctx, "SchadenplatzService.RecordCasualties",
		trace.WithAttributes(
			attribute.String("schadenplatz.id", schadenplatzID.String()),
			attribute.String("source_message.id", sourceMessageID.String()),
		))
	defer span.End()

	at := occurredAt

	var sp *schadenplatz.Schadenplatz

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error

		sp, err = s.repo.Load(ctx, schadenplatzID)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, sp.IncidentID(), access.MessageWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, sp.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		if err := sp.RecordCasualties(sourceMessageID, deltas, at, actor.Sub); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, sp)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.SchadenplatzState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return stateFromSchadenplatz(sp), nil
}

// MergeSchadenplatz merges a Schadenplatz into the incident's default one.
// The incident aggregate is loaded to obtain the default Schadenplatz ID.
func (s *SchadenplatzService) MergeSchadenplatz(
	ctx context.Context,
	id shared.SchadenplatzID,
	messageTime *time.Time,
	actor identity.Actor,
) error {
	ctx, span := s.tracer.Start(ctx, "SchadenplatzService.MergeSchadenplatz",
		trace.WithAttributes(attribute.String("schadenplatz.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "merging schadenplatz",
		slog.String("schadenplatz_id", id.String()),
		slog.String("actor", actor.Sub))

	at := s.clock.Now()

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		sp, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, sp.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, sp.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		defaultID := inc.DefaultSchadenplatzID()
		if defaultID == nil {
			// Should never happen on a valid incident, but guard defensively.
			return shared.ValidationError{
				Field:   "defaultSchadenplatzId",
				Message: "incident has no default Schadenplatz",
			}
		}

		// Copy casualty totals to the default Schadenplatz before marking this one
		// as merged, so the totals are not lost when the merged SP is filtered out.
		// The SP's own ID doubles as a synthetic message ID — this makes the
		// CasualtiesRecorded event idempotent on projection replay (ON CONFLICT
		// on (message_id, schadenplatz_id)).
		c := sp.Casualties()
		if c.Vermisste != 0 || c.Tote != 0 || c.Verletzte != 0 ||
			c.Obdachlose != 0 || c.Eingeschlossene != 0 {
			defaultSp, err := s.repo.Load(ctx, *defaultID)
			if err != nil {
				return err
			}

			// Record at the message time so the totals are attributed to the
			// correct moment; fall back to the service clock when not provided.
			casualtyAt := at
			if messageTime != nil {
				casualtyAt = *messageTime
			}

			syntheticMsgID := shared.MessageID(id)
			if err := defaultSp.RecordCasualties(
				syntheticMsgID,
				schadenplatz.CasualtyDeltas(c),
				casualtyAt,
				actor.Sub,
			); err != nil {
				return err
			}

			if _, err := s.repo.Save(ctx, defaultSp); err != nil {
				return err
			}
		}

		if err := sp.MergeIntoDefault(*defaultID, actor.Sub, at); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, sp)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return err
	}

	_ = s.notifier.Notify(ctx)

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────────────────────────────────────

func stateFromSchadenplatz(sp *schadenplatz.Schadenplatz) inbound.SchadenplatzState {
	return inbound.SchadenplatzState{
		ID:         sp.ID(),
		IncidentID: sp.IncidentID(),
		Name:       sp.Name(),
		IsDefault:  sp.IsDefault(),
		GeoJSON:    sp.GeoJSON(),
		Casualties: sp.Casualties(),
		IsMerged:   sp.IsMerged(),
		MergedInto: sp.MergedInto(),
	}
}
