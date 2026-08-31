package service

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// MessageService handles write-side operations for the Message aggregate.
type MessageService struct {
	tx        outbound.Transactor
	repo      outbound.MessageRepository
	incidents outbound.IncidentRepository
	counter   outbound.MessageCounter
	clock     outbound.Clock
	ids       outbound.IDs
	notifier  outbound.EventNotifier
}

func NewMessageService(
	tx outbound.Transactor,
	repo outbound.MessageRepository,
	incidents outbound.IncidentRepository,
	counter outbound.MessageCounter,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *MessageService {
	return &MessageService{
		tx: tx, repo: repo, incidents: incidents,
		counter: counter, clock: clock, ids: ids, notifier: notifier,
	}
}

// RecordMessage records a new message on an open incident.
// msgTime is when the communication actually happened (operator-supplied, may differ from now).
func (s *MessageService) RecordMessage(
	ctx context.Context,
	incidentID shared.IncidentID,
	content, sender, senderDetail, receiver, receiverDetail string,
	medium shared.Medium,
	actor identity.Actor,
) (shared.MessageID, error) {
	msgID := shared.MessageID(s.ids.New())
	at := s.clock.Now()

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		// Cross-aggregate precondition: incident must be open. Load from aggregate,
		// not from a projection, to avoid stale-read bugs.
		inc, err := s.incidents.Load(ctx, incidentID)
		if err != nil {
			return err
		}
		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		number, err := s.counter.Next(ctx, incidentID)
		if err != nil {
			return err
		}

		msg := message.New(msgID)
		if err := msg.Record(incidentID, number,
			content, sender, senderDetail, receiver, receiverDetail,
			medium, at, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, msg)
		return err
	})
	if err != nil {
		return shared.MessageID{}, err
	}
	_ = s.notifier.Notify(ctx)
	return msgID, nil
}

// CorrectMessage applies a sparse correction to an existing message.
func (s *MessageService) CorrectMessage(
	ctx context.Context,
	id shared.MessageID,
	content, sender, senderDetail, receiver, receiverDetail *string,
	medium *shared.Medium,
	actor identity.Actor,
) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := msg.Correct(content, sender, senderDetail, receiver, receiverDetail,
			medium, nil, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, msg)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

// TriageMessage updates triage state and divisions atomically.
func (s *MessageService) TriageMessage(
	ctx context.Context,
	id shared.MessageID,
	triage shared.TriageStatus,
	priority shared.PriorityStatus,
	divisionIDs []shared.DivisionID,
	actor identity.Actor,
) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := msg.Triage(triage, priority, divisionIDs, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, msg)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

// DeleteMessage soft-deletes a message.
func (s *MessageService) DeleteMessage(ctx context.Context, id shared.MessageID, actor identity.Actor) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := msg.Delete(shared.DeleteReasonManual, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, msg)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}
