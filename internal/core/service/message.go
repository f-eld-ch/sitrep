package service

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
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
	tracer    trace.Tracer
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
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// RecordMessage records a new message on an open incident.
// msgTime is when the communication actually happened (operator-supplied, may differ from now).
func (s *MessageService) RecordMessage(
	ctx context.Context,
	incidentID shared.IncidentID,
	content, sender, senderDetail, receiver, receiverDetail string,
	medium shared.Medium,
	msgTime *time.Time,
	actor identity.Actor,
) (inbound.MessageState, error) {
	ctx, span := s.tracer.Start(ctx, "MessageService.RecordMessage",
		trace.WithAttributes(attribute.String("incident.id", incidentID.String())))
	defer span.End()
	slog.DebugContext(ctx, "recording message", "incident_id", incidentID, "actor", actor.Sub)

	msgID := shared.MessageID(s.ids.New())
	at := s.clock.Now()
	if msgTime == nil {
		msgTime = &at
	}
	var state inbound.MessageState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.requireIncidentOpen(ctx, incidentID); err != nil {
			return err
		}

		number, err := s.counter.Next(ctx, incidentID)
		if err != nil {
			return err
		}

		msg := message.New(msgID)
		if err := msg.Record(incidentID, number,
			content, sender, senderDetail, receiver, receiverDetail,
			medium, *msgTime, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		if _, err = s.repo.Save(ctx, msg); err != nil {
			return err
		}
		state = messageToState(msg, at)
		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "RecordMessage", err, "incidentId", incidentID)
		return inbound.MessageState{}, err
	}
	span.SetAttributes(attribute.String("message.id", msgID.String()))
	_ = s.notifier.Notify(ctx)
	return state, nil
}

// CorrectMessage applies a sparse correction to an existing message.
func (s *MessageService) CorrectMessage(
	ctx context.Context,
	id shared.MessageID,
	content, sender, senderDetail, receiver, receiverDetail *string,
	medium *shared.Medium,
	msgTime *time.Time,
	actor identity.Actor,
) (inbound.MessageState, error) {
	ctx, span := s.tracer.Start(ctx, "MessageService.CorrectMessage",
		trace.WithAttributes(attribute.String("message.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "correcting message", "message_id", id, "actor", actor.Sub)

	at := s.clock.Now()
	var state inbound.MessageState
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := s.requireIncidentOpen(ctx, msg.IncidentID()); err != nil {
			return err
		}
		if err := msg.Correct(content, sender, senderDetail, receiver, receiverDetail,
			medium, msgTime, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		if _, err = s.repo.Save(ctx, msg); err != nil {
			return err
		}
		state = messageToState(msg, at)
		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "CorrectMessage", err, "id", id)
		return inbound.MessageState{}, err
	}
	_ = s.notifier.Notify(ctx)
	return state, nil
}

// TriageMessage updates triage state and divisions atomically.
func (s *MessageService) TriageMessage(
	ctx context.Context,
	id shared.MessageID,
	triage shared.TriageStatus,
	priority shared.PriorityStatus,
	divisionIDs []shared.DivisionID,
	actor identity.Actor,
) (inbound.MessageState, error) {
	ctx, span := s.tracer.Start(ctx, "MessageService.TriageMessage",
		trace.WithAttributes(attribute.String("message.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "triaging message", "message_id", id, "triage", triage, "actor", actor.Sub)

	at := s.clock.Now()
	var state inbound.MessageState
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		inc, err := s.incidents.Load(ctx, msg.IncidentID())
		if err != nil {
			return err
		}
		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}
		if len(divisionIDs) > 0 {
			for _, divID := range divisionIDs {
				if _, ok := inc.Division(divID); !ok {
					return shared.ValidationError{Field: "divisionId", Message: "division does not belong to this incident"}
				}
			}
		}
		if err := msg.Triage(triage, priority, divisionIDs, actor.Sub, at, actor.Sub); err != nil {
			return err
		}
		if _, err = s.repo.Save(ctx, msg); err != nil {
			return err
		}
		state = messageToState(msg, at)
		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "TriageMessage", err, "id", id)
		return inbound.MessageState{}, err
	}
	_ = s.notifier.Notify(ctx)
	return state, nil
}

// DeleteMessage soft-deletes a message.
func (s *MessageService) DeleteMessage(ctx context.Context, id shared.MessageID, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "MessageService.DeleteMessage",
		trace.WithAttributes(attribute.String("message.id", id.String())))
	defer span.End()
	slog.DebugContext(ctx, "deleting message", "message_id", id, "actor", actor.Sub)

	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := s.requireIncidentOpen(ctx, msg.IncidentID()); err != nil {
			return err
		}
		if err := msg.Delete(shared.DeleteReasonManual, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, msg)
		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "DeleteMessage", err, "id", id)
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

func (s *MessageService) requireIncidentOpen(ctx context.Context, incidentID shared.IncidentID) error {
	inc, err := s.incidents.Load(ctx, incidentID)
	if err != nil {
		return err
	}
	if !inc.IsOpen() {
		return shared.ErrIncidentNotOpen
	}
	return nil
}

// messageToState builds a MessageState DTO from the aggregate after a write.
// updatedAt comes from the service clock; createdAt is read from the aggregate.
func messageToState(msg *message.Message, updatedAt time.Time) inbound.MessageState {
	createdAt := msg.CreatedAt()
	if createdAt.IsZero() {
		createdAt = updatedAt
	}
	return inbound.MessageState{
		ID:             shared.MessageID(msg.Root().ID()),
		IncidentID:     msg.IncidentID(),
		Number:         msg.Number(),
		Content:        msg.Content(),
		Sender:         msg.Sender(),
		SenderDetail:   msg.SenderDetail(),
		Receiver:       msg.Receiver(),
		ReceiverDetail: msg.ReceiverDetail(),
		Medium:         msg.Medium(),
		Time:           msg.Time(),
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
		Triage:         msg.TriageStatus(),
		Priority:       msg.PriorityStatus(),
		DivisionIDs:    msg.DivisionIDs(),
	}
}
