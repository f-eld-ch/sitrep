package graphql

import (
	"context"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
)

// loadMessage fetches a message from the projection and resolves its division names.
// Used by mutation resolvers that return the updated message.
func (r *Resolver) loadMessage(ctx context.Context, msgID uuid.UUID) (*model.Message, error) {
	msg, err := r.Queries.GetMessage(ctx, msgID)
	if err != nil {
		return nil, err
	}

	inc, err := r.Queries.GetIncident(ctx, msg.IncidentID)
	if err != nil {
		return nil, err
	}

	divIndex := divisionsByID(inc.Divisions)

	return messageRMToModel(msg, divIndex), nil
}
