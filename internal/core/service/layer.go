package service

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// LayerService handles write-side operations for the Layer aggregate.
type LayerService struct {
	tx        outbound.Transactor
	repo      outbound.LayerRepository
	incidents outbound.IncidentRepository
	clock     outbound.Clock
	ids       outbound.IDs
	notifier  outbound.EventNotifier
	tracer    trace.Tracer
}

func NewLayerService(
	tx outbound.Transactor,
	repo outbound.LayerRepository,
	incidents outbound.IncidentRepository,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *LayerService {
	return &LayerService{
		tx: tx, repo: repo, incidents: incidents, clock: clock, ids: ids, notifier: notifier,
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// CreateLayer creates a new layer for an incident.
func (s *LayerService) CreateLayer(
	ctx context.Context,
	incidentID shared.IncidentID,
	name string,
	actor identity.Actor,
) (shared.LayerID, error) {
	ctx, span := s.tracer.Start(ctx, "LayerService.CreateLayer",
		trace.WithAttributes(
			attribute.String("incident.id", incidentID.String()),
			attribute.String("layer.name", name),
		))
	defer span.End()
	slog.DebugContext(ctx, "creating layer", "incident_id", incidentID, "name", name, "actor", actor.Sub)

	layerID := shared.LayerID(s.ids.New())
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.requireIncidentOpen(ctx, incidentID); err != nil {
			return err
		}
		l := layer.New(layerID)
		if err := l.Create(incidentID, name, actor.Sub, at); err != nil {
			return err
		}
		_, err := s.repo.Save(ctx, l)
		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return shared.LayerID{}, err
	}
	span.SetAttributes(attribute.String("layer.id", layerID.String()))
	_ = s.notifier.Notify(ctx)
	return layerID, nil
}

// RenameLayer renames an existing layer.
func (s *LayerService) RenameLayer(ctx context.Context, id shared.LayerID, name string, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "LayerService.RenameLayer",
		trace.WithAttributes(attribute.String("layer.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "renaming layer", "layer_id", id, "name", name, "actor", actor.Sub)

	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		l, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := s.requireIncidentOpen(ctx, l.IncidentID()); err != nil {
			return err
		}
		if err := l.Rename(name, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, l)
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

// RemoveLayer removes a layer and should cascade feature removal at the service level.
func (s *LayerService) RemoveLayer(ctx context.Context, id shared.LayerID, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "LayerService.RemoveLayer",
		trace.WithAttributes(attribute.String("layer.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "removing layer", "layer_id", id, "actor", actor.Sub)

	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		l, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := s.requireIncidentOpen(ctx, l.IncidentID()); err != nil {
			return err
		}
		if err := l.Remove(shared.DeleteReasonManual, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, l)
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

func (s *LayerService) requireIncidentOpen(ctx context.Context, incidentID shared.IncidentID) error {
	inc, err := s.incidents.Load(ctx, incidentID)
	if err != nil {
		return err
	}
	if !inc.IsOpen() {
		return shared.ErrIncidentNotOpen
	}
	return nil
}
