package outbound

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// IncidentRepository loads and saves the Incident aggregate.
type IncidentRepository interface {
	Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error)
	Save(ctx context.Context, a *incident.Incident) (Cursor, error)
}

// MessageRepository loads and saves the Message aggregate.
type MessageRepository interface {
	Load(ctx context.Context, id shared.MessageID) (*message.Message, error)
	Save(ctx context.Context, a *message.Message) (Cursor, error)
}

// LayerRepository loads and saves the Layer aggregate.
type LayerRepository interface {
	Load(ctx context.Context, id shared.LayerID) (*layer.Layer, error)
	Save(ctx context.Context, a *layer.Layer) (Cursor, error)
}

// FeatureRepository loads and saves the Feature aggregate.
type FeatureRepository interface {
	Load(ctx context.Context, id shared.FeatureID) (*feature.Feature, error)
	Save(ctx context.Context, a *feature.Feature) (Cursor, error)
}

// MessageCounter assigns the next sequential message number for an incident.
// The counter row is locked for the duration of the calling transaction.
type MessageCounter interface {
	Next(ctx context.Context, incidentID shared.IncidentID) (int, error)
}

// UserRepository persists authenticated user profiles.
// Users are not event-sourced — the table is a plain upsert target keyed on sub.
type UserRepository interface {
	Upsert(ctx context.Context, sub, email, name string) error
}
