package graphql

import (
	"context"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
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

// messageFromState builds a mutation response from the message aggregate's state. Division
// names come from the incident aggregate, never from the read model, which lags behind the
// write the mutation just made.
func (r *Resolver) messageFromState(ctx context.Context, state inbound.MessageState) (*model.Message, error) {
	msg := messageStateToModel(state)

	inc, err := r.Incidents.LoadIncident(ctx, state.IncidentID)
	if err != nil {
		return nil, err
	}

	for _, divID := range state.DivisionIDs {
		if d, ok := inc.Division(divID); ok {
			msg.Divisions = append(msg.Divisions, divisionToModel(d))
		}
	}

	for _, a := range state.Acknowledgements {
		if d, ok := inc.Division(a.DivisionID); ok {
			msg.Acknowledgements = append(msg.Acknowledgements, &model.DivisionAcknowledgement{
				Division:       divisionToModel(d),
				AcknowledgedAt: a.At,
				AcknowledgedBy: a.By,
			})
		}
	}

	return msg, nil
}
