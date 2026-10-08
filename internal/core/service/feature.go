package service

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"slices"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

const maxFeatureWriteRetries = 3

// FeatureService handles write-side operations for the Feature aggregate.
// Feature IDs are derived server-side from the client's draw key (feature.DeriveID).
type FeatureService struct {
	tx        outbound.Transactor
	repo      outbound.FeatureRepository
	incidents outbound.IncidentRepository
	layers    outbound.LayerRepository
	messages  outbound.MessageRepository
	access    outbound.IncidentAccessChecker
	clock     outbound.Clock
	notifier  outbound.EventNotifier
	tracer    trace.Tracer
}

func NewFeatureService(
	tx outbound.Transactor,
	repo outbound.FeatureRepository,
	incidents outbound.IncidentRepository,
	layers outbound.LayerRepository,
	messages outbound.MessageRepository,
	access outbound.IncidentAccessChecker,
	clock outbound.Clock,
	notifier outbound.EventNotifier,
) *FeatureService {
	return &FeatureService{
		tx: tx, repo: repo, incidents: incidents, layers: layers, messages: messages,
		access: access, clock: clock, notifier: notifier,
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

const maxClientKeyLength = 128

// PlaceFeature places a new feature. See inbound.FeatureService for the idempotency contract.
func (s *FeatureService) PlaceFeature(
	ctx context.Context,
	incidentID shared.IncidentID,
	layerID shared.LayerID,
	clientKey string,
	geometry, properties map[string]any,
	change inbound.FeatureChange,
	actor identity.Actor,
) (inbound.FeatureState, error) {
	ctx, span := s.tracer.Start(ctx, "FeatureService.PlaceFeature",
		trace.WithAttributes(
			attribute.String("incident.id", incidentID.String()),
			attribute.String("layer.id", layerID.String()),
		))
	defer span.End()

	slog.DebugContext(ctx, "placing feature",
		slog.String("incident_id", incidentID.String()),
		slog.String("layer_id", layerID.String()),
		slog.String("actor", actor.Sub))

	if clientKey == "" || len(clientKey) > maxClientKeyLength {
		err := shared.ValidationError{Field: "clientKey", Message: "must be 1-128 characters"}
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.FeatureState{}, err
	}

	id := feature.DeriveID(incidentID, clientKey)
	span.SetAttributes(attribute.String("feature.id", id.String()))

	var state inbound.FeatureState

	err := s.withRetry(ctx, id, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, incidentID, access.FeatureWrite); err != nil {
			return err
		}

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

		changeCtx, err := s.resolveChange(ctx, inc, l, change)
		if err != nil {
			return err
		}

		existing, err := s.repo.Load(ctx, id)
		switch {
		case err == nil:
			// Re-sent create: idempotent when it matches what was stored, a conflict otherwise.
			if !isSamePlacement(existing, layerID, geometry, properties, change.MessageID) {
				return shared.ErrConflict
			}

			state = featureState(existing)

			return nil
		case !errors.Is(err, shared.ErrNotFound):
			return err
		}

		f := feature.New(id)
		if err := f.Place(incidentID, layerID, geometry, properties, changeCtx, actor.Sub, s.clock.Now()); err != nil {
			return err
		}

		if _, err := s.repo.Save(ctx, f); err != nil {
			return err
		}

		state = featureState(f)

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.FeatureState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, nil
}

// ModifyFeature updates geometry and/or properties in a single transaction.
// Applying both in one aggregate load prevents the optimistic concurrency conflict
// that would occur if Move and Restyle were saved as two separate operations.
// Returns the full post-update state so the resolver can respond without a projection read.
func (s *FeatureService) ModifyFeature(
	ctx context.Context,
	id shared.FeatureID,
	geometry, properties map[string]any,
	change inbound.FeatureChange,
	actor identity.Actor,
) (inbound.FeatureState, error) {
	ctx, span := s.tracer.Start(ctx, "FeatureService.ModifyFeature",
		trace.WithAttributes(attribute.String("feature.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "modifying feature",
		slog.String("feature_id", id.String()), slog.String("actor", actor.Sub))

	var state inbound.FeatureState

	err := s.writeFeature(ctx, id, actor, access.LayerWrite, change,
		func(f *feature.Feature, changeCtx feature.ChangeContext) error {
			at := s.clock.Now()
			if geometry != nil {
				if err := f.Move(geometry, changeCtx, actor.Sub, at); err != nil {
					return err
				}
			}

			if properties != nil {
				if err := f.Restyle(properties, changeCtx, actor.Sub, at); err != nil {
					return err
				}
			}

			state = featureState(f)

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
func (s *FeatureService) RemoveFeature(
	ctx context.Context,
	id shared.FeatureID,
	change inbound.FeatureChange,
	actor identity.Actor,
) error {
	ctx, span := s.tracer.Start(ctx, "FeatureService.RemoveFeature",
		trace.WithAttributes(attribute.String("feature.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "removing feature",
		slog.String("feature_id", id.String()), slog.String("actor", actor.Sub))

	err := s.writeFeature(ctx, id, actor, access.FeatureWrite, change,
		func(f *feature.Feature, changeCtx feature.ChangeContext) error {
			return f.Remove(shared.DeleteReasonManual, changeCtx, actor.Sub, s.clock.Now())
		})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}

	return err
}

// RestoreFeature brings a removed feature back. Returns the feature's state so the resolver
// can respond without a projection read.
func (s *FeatureService) RestoreFeature(
	ctx context.Context,
	id shared.FeatureID,
	change inbound.FeatureChange,
	actor identity.Actor,
) (inbound.FeatureState, error) {
	ctx, span := s.tracer.Start(ctx, "FeatureService.RestoreFeature",
		trace.WithAttributes(attribute.String("feature.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "restoring feature",
		slog.String("feature_id", id.String()), slog.String("actor", actor.Sub))

	var state inbound.FeatureState

	err := s.writeFeature(ctx, id, actor, access.FeatureWrite, change,
		func(f *feature.Feature, changeCtx feature.ChangeContext) error {
			if err := f.Restore(changeCtx, actor.Sub, s.clock.Now()); err != nil {
				return err
			}

			state = featureState(f)

			return nil
		})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.FeatureState{}, err
	}

	return state, nil
}

func (s *FeatureService) writeFeature(
	ctx context.Context,
	id shared.FeatureID,
	actor identity.Actor,
	action access.Action,
	change inbound.FeatureChange,
	fn func(*feature.Feature, feature.ChangeContext) error,
) error {
	err := s.withRetry(ctx, id, func(ctx context.Context) error {
		f, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, f.IncidentID(), action); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, f.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		l, err := s.layers.Load(ctx, f.LayerID())
		if err != nil {
			return err
		}

		changeCtx, err := s.resolveChange(ctx, inc, l, change)
		if err != nil {
			return err
		}

		if err := fn(f, changeCtx); err != nil {
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

// withRetry runs fn in a transaction, retrying optimistic-concurrency conflicts.
func (s *FeatureService) withRetry(ctx context.Context, id shared.FeatureID, fn func(context.Context) error) error {
	var txErr error

	for attempt := range maxFeatureWriteRetries {
		txErr = s.tx.WithinTx(ctx, fn)
		if txErr == nil {
			return nil
		}

		if !isOptimisticConflict(txErr) || attempt == maxFeatureWriteRetries-1 {
			break
		}

		slog.DebugContext(ctx, "feature write optimistic conflict, retrying",
			slog.Int("attempt", attempt+1), slog.String("feature_id", id.String()))
	}

	return txErr
}

// resolveChange decides when a change takes effect. Everything it checks comes from
// aggregates (incident, layer, message), never from read models.
func (s *FeatureService) resolveChange(
	ctx context.Context,
	inc *incident.Incident,
	l *layer.Layer,
	change inbound.FeatureChange,
) (feature.ChangeContext, error) {
	isMapLayer := l.Kind() == shared.LayerKindMessageMap

	if change.MessageID == nil {
		if isMapLayer {
			return feature.ChangeContext{}, shared.ValidationError{
				Field: "messageId", Message: "required on the message map layer",
			}
		}

		now := s.clock.Now()
		if change.EffectiveAt == nil {
			return feature.ChangeContext{EffectiveAt: now}, nil
		}

		if change.EffectiveAt.After(now) {
			return feature.ChangeContext{}, shared.ValidationError{
				Field: "effectiveAt", Message: "must not be in the future",
			}
		}

		return feature.ChangeContext{EffectiveAt: *change.EffectiveAt}, nil
	}

	if !isMapLayer {
		return feature.ChangeContext{}, shared.ValidationError{
			Field: "messageId", Message: "only allowed on the message map layer",
		}
	}

	if change.EffectiveAt != nil {
		return feature.ChangeContext{}, shared.ValidationError{
			Field: "effectiveAt", Message: "cannot be combined with messageId; the message time applies",
		}
	}

	msg, err := s.messages.Load(ctx, *change.MessageID)
	if err != nil {
		return feature.ChangeContext{}, err
	}

	// A message of another incident must look like it does not exist.
	if msg.IncidentID() != shared.IncidentID(inc.Root().ID()) || msg.IsDeleted() {
		return feature.ChangeContext{}, shared.ErrNotFound
	}

	mapDivision, ok := inc.MessageMapDivision()
	if !ok || !slices.Contains(msg.DivisionIDs(), mapDivision.ID) {
		return feature.ChangeContext{}, shared.ValidationError{
			Field: "messageId", Message: "message is not triaged to the Nachrichtenkarte",
		}
	}

	return feature.ChangeContext{EffectiveAt: msg.Time(), MessageID: change.MessageID}, nil
}

func featureState(f *feature.Feature) inbound.FeatureState {
	return inbound.FeatureState{
		ID:         shared.FeatureID(f.Root().ID()),
		IncidentID: f.IncidentID(),
		LayerID:    f.LayerID(),
		Geometry:   f.Geometry(),
		Properties: f.Properties(),
		MessageIDs: f.MessageIDs(),
	}
}

// isSamePlacement reports whether a re-sent create matches the stored feature.
func isSamePlacement(
	f *feature.Feature,
	layerID shared.LayerID,
	geometry, properties map[string]any,
	messageID *shared.MessageID,
) bool {
	if f.IsRemoved() || f.LayerID() != layerID {
		return false
	}

	linked := f.MessageIDs()
	if messageID == nil && len(linked) > 0 || messageID != nil && !slices.Contains(linked, *messageID) {
		return false
	}

	return sameJSON(f.Geometry(), geometry) && sameJSON(f.Properties(), properties)
}

// sameJSON compares two JSON objects by value. Both sides are normalised first: a request
// decoded by the API layer carries json.Number("8.0") where the stored event decodes to
// float64(8), which must not make a re-sent create look like a different payload.
func sameJSON(a, b map[string]any) bool {
	left, okA := normalizeJSON(a)
	right, okB := normalizeJSON(b)

	return okA && okB && reflect.DeepEqual(left, right)
}

func normalizeJSON(v map[string]any) (any, bool) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, false
	}

	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, false
	}

	return out, true
}
