// Package eventstore provides event-sourced repository implementations that work
// with any outbound.EventStore backend — Postgres, in-memory, or SQLite.
// Only the MessageCounter (which needs an atomic DB counter) is backend-specific
// and lives in the corresponding backend package.
package eventstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions: all repositories satisfy their port interfaces.
var (
	_ outbound.IncidentRepository = (*IncidentRepository)(nil)
	_ outbound.MessageRepository  = (*MessageRepository)(nil)
	_ outbound.LayerRepository    = (*LayerRepository)(nil)
	_ outbound.FeatureRepository  = (*FeatureRepository)(nil)
)

// ──────────────────────────────────────────────────────────────────────────────
// Incident
// ──────────────────────────────────────────────────────────────────────────────

type IncidentRepository struct{ store outbound.EventStore }

func NewIncidentRepository(store outbound.EventStore) *IncidentRepository {
	return &IncidentRepository{store: store}
}

func (r *IncidentRepository) Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	inc := incident.New(id)
	if err := loadAggregate(ctx, r.store, inc, uuid.UUID(id)); err != nil {
		return nil, fmt.Errorf("incident repository load %s: %w", id, err)
	}

	return inc, nil
}

func (r *IncidentRepository) Save(ctx context.Context, a *incident.Incident) (outbound.Cursor, error) {
	cursor, err := r.store.Append(ctx, a)
	if err != nil {
		return nil, fmt.Errorf("incident repository save %s: %w", a.Root().ID(), err)
	}

	return cursor, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Message
// ──────────────────────────────────────────────────────────────────────────────

type MessageRepository struct{ store outbound.EventStore }

func NewMessageRepository(store outbound.EventStore) *MessageRepository {
	return &MessageRepository{store: store}
}

func (r *MessageRepository) Load(ctx context.Context, id shared.MessageID) (*message.Message, error) {
	msg := message.New(id)
	if err := loadAggregate(ctx, r.store, msg, uuid.UUID(id)); err != nil {
		return nil, fmt.Errorf("message repository load %s: %w", id, err)
	}

	return msg, nil
}

func (r *MessageRepository) Save(ctx context.Context, a *message.Message) (outbound.Cursor, error) {
	cursor, err := r.store.Append(ctx, a)
	if err != nil {
		return nil, fmt.Errorf("message repository save %s: %w", a.Root().ID(), err)
	}

	return cursor, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer
// ──────────────────────────────────────────────────────────────────────────────

type LayerRepository struct{ store outbound.EventStore }

func NewLayerRepository(store outbound.EventStore) *LayerRepository {
	return &LayerRepository{store: store}
}

func (r *LayerRepository) Load(ctx context.Context, id shared.LayerID) (*layer.Layer, error) {
	l := layer.New(id)
	if err := loadAggregate(ctx, r.store, l, uuid.UUID(id)); err != nil {
		return nil, fmt.Errorf("layer repository load %s: %w", id, err)
	}

	return l, nil
}

func (r *LayerRepository) Save(ctx context.Context, a *layer.Layer) (outbound.Cursor, error) {
	cursor, err := r.store.Append(ctx, a)
	if err != nil {
		return nil, fmt.Errorf("layer repository save %s: %w", a.Root().ID(), err)
	}

	return cursor, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Feature
// ──────────────────────────────────────────────────────────────────────────────

type FeatureRepository struct{ store outbound.EventStore }

func NewFeatureRepository(store outbound.EventStore) *FeatureRepository {
	return &FeatureRepository{store: store}
}

func (r *FeatureRepository) Load(ctx context.Context, id shared.FeatureID) (*feature.Feature, error) {
	f := feature.New(id)
	if err := loadAggregate(ctx, r.store, f, uuid.UUID(id)); err != nil {
		return nil, fmt.Errorf("feature repository load %s: %w", id, err)
	}

	return f, nil
}

func (r *FeatureRepository) Save(ctx context.Context, a *feature.Feature) (outbound.Cursor, error) {
	cursor, err := r.store.Append(ctx, a)
	if err != nil {
		return nil, fmt.Errorf("feature repository save %s: %w", a.Root().ID(), err)
	}

	return cursor, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared helper
// ──────────────────────────────────────────────────────────────────────────────

func loadAggregate(ctx context.Context, store outbound.EventStore, a eventsourcing.Aggregate, id uuid.UUID) error {
	events, err := store.Load(ctx, a.AggregateType(), id)
	if err != nil {
		return err
	}

	if len(events) == 0 {
		return shared.ErrNotFound
	}

	for _, e := range events {
		if err := eventsourcing.Apply(a, e); err != nil {
			return err
		}
	}

	return nil
}
