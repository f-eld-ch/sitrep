package service

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// FeatureService handles write-side operations for the Feature aggregate.
// The UI generates the feature UUID client-side for optimistic updates.
type FeatureService struct {
	tx        outbound.Transactor
	repo      outbound.FeatureRepository
	incidents outbound.IncidentRepository
	layers    outbound.LayerRepository
	clock     outbound.Clock
	notifier  outbound.EventNotifier
	tracer    trace.Tracer
}

func NewFeatureService(
	tx outbound.Transactor,
	repo outbound.FeatureRepository,
	incidents outbound.IncidentRepository,
	layers outbound.LayerRepository,
	clock outbound.Clock,
	notifier outbound.EventNotifier,
) *FeatureService {
	return &FeatureService{
		tx: tx, repo: repo, incidents: incidents, layers: layers, clock: clock, notifier: notifier,
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// PlaceFeature places a new feature. The id comes from the client.
func (s *FeatureService) PlaceFeature(
	ctx context.Context,
	id shared.FeatureID,
	incidentID shared.IncidentID,
	layerID shared.LayerID,
	geometry, properties map[string]any,
	actor identity.Actor,
) error {
	ctx, span := s.tracer.Start(ctx, "FeatureService.PlaceFeature",
		trace.WithAttributes(
			attribute.String("feature.id", id.String()),
			attribute.String("incident.id", incidentID.String()),
			attribute.String("layer.id", layerID.String()),
		))
	defer span.End()
	slog.DebugContext(ctx, "placing feature", "feature_id", id, "layer_id", layerID, "actor", actor.Sub)

	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.incidents.Load(ctx, incidentID)
		if err != nil {
			return err
		}
		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}
		l, err := s.layers.Load(ctx, layerID)
		if err != nil {
			return err
		}
		if l.IncidentID() != incidentID {
			return shared.ValidationError{Field: "layerId", Message: "layer does not belong to this incident"}
		}
		f := feature.New(id)
		if err := f.Place(incidentID, layerID, geometry, properties, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, f)
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

// ModifyFeature updates geometry and/or properties in a single transaction.
// Applying both in one aggregate load prevents the optimistic concurrency conflict
// that would occur if Move and Restyle were saved as two separate operations.
// Returns the full post-update state so the resolver can respond without a projection read.
func (s *FeatureService) ModifyFeature(
	ctx context.Context,
	id shared.FeatureID,
	geometry, properties map[string]any,
	actor identity.Actor,
) (inbound.FeatureState, error) {
	ctx, span := s.tracer.Start(ctx, "FeatureService.ModifyFeature",
		trace.WithAttributes(attribute.String("feature.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "modifying feature", "feature_id", id, "actor", actor.Sub)

	var state inbound.FeatureState
	err := s.writeFeature(ctx, id, func(f *feature.Feature) error {
		at := s.clock.Now()
		if geometry != nil {
			if err := f.Move(geometry, actor.Sub, at); err != nil {
				return err
			}
		}
		if properties != nil {
			if err := f.Restyle(properties, actor.Sub, at); err != nil {
				return err
			}
		}
		state = inbound.FeatureState{
			ID:         id,
			Geometry:   f.Geometry(),
			Properties: f.Properties(),
		}
		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return inbound.FeatureState{}, err
	}
	return state, nil
}

// RemoveFeature removes a feature.
func (s *FeatureService) RemoveFeature(ctx context.Context, id shared.FeatureID, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "FeatureService.RemoveFeature",
		trace.WithAttributes(attribute.String("feature.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "removing feature", "feature_id", id, "actor", actor.Sub)

	err := s.writeFeature(ctx, id, func(f *feature.Feature) error {
		return f.Remove(shared.DeleteReasonManual, actor.Sub, s.clock.Now())
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	return err
}

func (s *FeatureService) writeFeature(ctx context.Context, id shared.FeatureID, fn func(*feature.Feature) error) error {
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		f, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := fn(f); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, f)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}
