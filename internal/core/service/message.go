package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

const maxAttachRetries = 3

// MessageService handles write-side operations for the Message aggregate.
// byteCounter is an io.Writer that counts the total bytes written through it.
type byteCounter struct{ n *int64 }

func (c byteCounter) Write(p []byte) (int, error) {
	*c.n += int64(len(p))

	return len(p), nil
}

type MessageService struct {
	tx        outbound.Transactor
	repo      outbound.MessageRepository
	incidents outbound.IncidentRepository
	counter   outbound.MessageCounter
	access    outbound.IncidentAccessChecker
	clock     outbound.Clock
	ids       outbound.IDs
	notifier  outbound.EventNotifier
	blobs     outbound.BlobStore
	queries   outbound.Queries
	tracer    trace.Tracer
}

func NewMessageService(
	tx outbound.Transactor,
	repo outbound.MessageRepository,
	incidents outbound.IncidentRepository,
	counter outbound.MessageCounter,
	access outbound.IncidentAccessChecker,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *MessageService {
	return &MessageService{
		tx: tx, repo: repo, incidents: incidents, access: access,
		counter: counter, clock: clock, ids: ids, notifier: notifier,
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// WithBlobStore sets the BlobStore used for attachment persistence.
func (s *MessageService) WithBlobStore(blobs outbound.BlobStore) *MessageService {
	s.blobs = blobs
	return s
}

// WithQueries sets the read-model Queries used for attachment lookups.
func (s *MessageService) WithQueries(queries outbound.Queries) *MessageService {
	s.queries = queries
	return s
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

	slog.DebugContext(ctx, "recording message",
		slog.String("incident_id", incidentID.String()), slog.String("actor", actor.Sub))

	msgID := shared.MessageID(s.ids.New())

	at := s.clock.Now()
	if msgTime == nil {
		msgTime = &at
	}

	var state inbound.MessageState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, incidentID, access.IncidentWrite); err != nil {
			return err
		}

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
		logIfUnexpected(ctx, "RecordMessage", err, slog.String("incident_id", incidentID.String()))

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

	slog.DebugContext(ctx, "correcting message",
		slog.String("message_id", id.String()), slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var state inbound.MessageState

	var txErr error
	for attempt := range maxAttachRetries {
		txErr = s.tx.WithinTx(ctx, func(ctx context.Context) error {
			msg, err := s.repo.Load(ctx, id)
			if err != nil {
				return err
			}

			if err := requireIncidentAccess(ctx, s.access, actor, msg.IncidentID(), access.IncidentWrite); err != nil {
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
		if txErr == nil {
			break
		}

		if !isOptimisticConflict(txErr) || attempt == maxAttachRetries-1 {
			break
		}

		slog.DebugContext(ctx, "correct message optimistic conflict, retrying",
			slog.Int("attempt", attempt+1), slog.String("message_id", id.String()))
	}

	if err := txErr; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "CorrectMessage", err, slog.String("id", id.String()))

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

	slog.DebugContext(ctx, "triaging message",
		slog.String("message_id", id.String()),
		slog.String("triage", string(triage)),
		slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var state inbound.MessageState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, msg.IncidentID(), access.IncidentWrite); err != nil {
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
					return shared.ValidationError{
						Field:   "divisionId",
						Message: "division does not belong to this incident",
					}
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
		logIfUnexpected(ctx, "TriageMessage", err, slog.String("id", id.String()))

		return inbound.MessageState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, nil
}

// DeleteMessage soft-deletes a message and schedules best-effort blob deletion.
func (s *MessageService) DeleteMessage(ctx context.Context, id shared.MessageID, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "MessageService.DeleteMessage",
		trace.WithAttributes(attribute.String("message.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "deleting message",
		slog.String("message_id", id.String()), slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var blobKeys []string

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, msg.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		if err := s.requireIncidentOpen(ctx, msg.IncidentID()); err != nil {
			return err
		}

		// Collect blob keys before deletion so we can purge after commit.
		for _, a := range msg.Attachments() {
			blobKeys = append(blobKeys, a.StorageKey)
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
		logIfUnexpected(ctx, "DeleteMessage", err, slog.String("id", id.String()))

		return err
	}

	_ = s.notifier.Notify(ctx)

	// Best-effort blob deletion after the commit. Orphaned blobs are recoverable;
	// a row pointing at a deleted blob is not.
	if s.blobs != nil {
		for _, key := range blobKeys {
			if err := s.blobs.Delete(ctx, key); err != nil {
				slog.WarnContext(ctx, "failed to delete blob after message deletion",
					slog.String("key", key), slog.String("err", err.Error()))
			}
		}
	}

	return nil
}

// AttachFile streams a file onto an existing message.
func (s *MessageService) AttachFile(
	ctx context.Context,
	messageID shared.MessageID,
	input inbound.AttachFileInput,
	actor identity.Actor,
) (inbound.AttachmentState, error) {
	ctx, span := s.tracer.Start(ctx, "MessageService.AttachFile",
		trace.WithAttributes(attribute.String("message.id", messageID.String())))
	defer span.End()

	slog.DebugContext(ctx, "attaching file",
		slog.String("message_id", messageID.String()), slog.String("actor", actor.Sub))

	if s.blobs == nil {
		err := fmt.Errorf("attachments not configured")
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, err
	}

	attachmentID := shared.AttachmentID(s.ids.New())
	at := s.clock.Now()

	// Load message before writing any bytes to get incidentID for the access check
	// and to derive the storage key.
	var incidentID shared.IncidentID

	if err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		msg, err := s.repo.Load(ctx, messageID)
		if err != nil {
			return err
		}

		incidentID = msg.IncidentID()

		if err := requireIncidentAccess(ctx, s.access, actor, incidentID, access.IncidentWrite); err != nil {
			return err
		}

		return s.requireIncidentOpen(ctx, incidentID)
	}); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "AttachFile.precheck", err, slog.String("message_id", messageID.String()))

		return inbound.AttachmentState{}, err
	}

	storageKey := fmt.Sprintf("incidents/%s/%s", incidentID, attachmentID)

	// Write blob before opening the event-store transaction.
	// Compute checksum and measure actual byte count in one streaming pass.
	h := sha256.New()

	var bytesWritten int64

	checksumReader := io.TeeReader(input.Content, io.MultiWriter(h, byteCounter{&bytesWritten}))

	if err := s.blobs.Put(ctx, storageKey, checksumReader, input.Size, input.ContentType); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, err
	}

	// Use the measured byte count instead of the caller-supplied hint (which may be -1
	// when size is unknown at upload time, e.g. multipart streaming without Content-Length).
	actualSize := bytesWritten
	checksum := "sha256:" + hex.EncodeToString(h.Sum(nil))

	var state inbound.AttachmentState

	// Retry on optimistic-concurrency conflict. Blob is already written and keyed
	// by attachmentID, so retrying is safe (AddAttachment is idempotent on duplicate id).
	var txErr error
	for attempt := range maxAttachRetries {
		txErr = s.tx.WithinTx(ctx, func(ctx context.Context) error {
			msg, err := s.repo.Load(ctx, messageID)
			if err != nil {
				return err
			}

			if err := requireIncidentAccess(ctx, s.access, actor, msg.IncidentID(), access.IncidentWrite); err != nil {
				return err
			}

			if err := s.requireIncidentOpen(ctx, msg.IncidentID()); err != nil {
				return err
			}

			if err := msg.AddAttachment(
				attachmentID,
				input.Filename,
				input.ContentType,
				actualSize,
				checksum,
				storageKey,
				actor.Sub,
				at,
				actor.Sub,
			); err != nil {
				return err
			}

			if _, err = s.repo.Save(ctx, msg); err != nil {
				return err
			}

			state = attachmentToState(
				attachmentID,
				messageID,
				msg.IncidentID(),
				input,
				checksum,
				storageKey,
				actor.Sub,
				at,
			)

			return nil
		})
		if txErr == nil {
			break
		}

		if !isOptimisticConflict(txErr) || attempt == maxAttachRetries-1 {
			break
		}

		slog.DebugContext(ctx, "attach file optimistic conflict, retrying",
			slog.Int("attempt", attempt+1), slog.String("message_id", messageID.String()))
	}

	if txErr != nil {
		// Compensating delete: best-effort remove the blob we wrote.
		if delErr := s.blobs.Delete(ctx, storageKey); delErr != nil {
			slog.WarnContext(ctx, "compensating blob delete failed",
				slog.String("key", storageKey), slog.String("err", delErr.Error()))
		}

		span.RecordError(txErr)
		span.SetStatus(codes.Error, txErr.Error())
		logIfUnexpected(ctx, "AttachFile", txErr, slog.String("message_id", messageID.String()))

		return inbound.AttachmentState{}, txErr
	}

	span.SetAttributes(attribute.String("attachment.id", attachmentID.String()))

	_ = s.notifier.Notify(ctx)

	return state, nil
}

// RemoveAttachment removes an attachment from a message and deletes its blob after commit.
func (s *MessageService) RemoveAttachment(
	ctx context.Context,
	messageID shared.MessageID,
	attachmentID shared.AttachmentID,
	actor identity.Actor,
) error {
	ctx, span := s.tracer.Start(ctx, "MessageService.RemoveAttachment",
		trace.WithAttributes(
			attribute.String("message.id", messageID.String()),
			attribute.String("attachment.id", attachmentID.String()),
		))
	defer span.End()

	slog.DebugContext(ctx, "removing attachment",
		slog.String("message_id", messageID.String()),
		slog.String("attachment_id", attachmentID.String()),
		slog.String("actor", actor.Sub))

	if s.blobs == nil {
		err := fmt.Errorf("attachments not configured")
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return err
	}

	at := s.clock.Now()

	var storageKey string

	var txErr error
	for attempt := range maxAttachRetries {
		storageKey = ""

		txErr = s.tx.WithinTx(ctx, func(ctx context.Context) error {
			msg, err := s.repo.Load(ctx, messageID)
			if err != nil {
				return err
			}

			if err := requireIncidentAccess(ctx, s.access, actor, msg.IncidentID(), access.IncidentWrite); err != nil {
				return err
			}

			if err := s.requireIncidentOpen(ctx, msg.IncidentID()); err != nil {
				return err
			}

			// Resolve storage key before removal.
			for _, a := range msg.Attachments() {
				if a.ID == attachmentID {
					storageKey = a.StorageKey
					break
				}
			}

			if err := msg.RemoveAttachment(attachmentID, actor.Sub, at, actor.Sub); err != nil {
				return err
			}

			_, err = s.repo.Save(ctx, msg)

			return err
		})
		if txErr == nil {
			break
		}

		if !isOptimisticConflict(txErr) || attempt == maxAttachRetries-1 {
			break
		}

		slog.DebugContext(ctx, "remove attachment optimistic conflict, retrying",
			slog.Int("attempt", attempt+1), slog.String("message_id", messageID.String()))
	}

	if err := txErr; err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "RemoveAttachment", err,
			slog.String("message_id", messageID.String()),
			slog.String("attachment_id", attachmentID.String()))

		return err
	}

	_ = s.notifier.Notify(ctx)

	// Delete blob after commit — never before. A committed row must not point at a deleted blob.
	if storageKey != "" {
		if err := s.blobs.Delete(ctx, storageKey); err != nil {
			slog.WarnContext(ctx, "failed to delete blob after attachment removal",
				slog.String("key", storageKey), slog.String("err", err.Error()))
		}
	}

	return nil
}

// OpenAttachment resolves attachment metadata and opens its blob.
func (s *MessageService) OpenAttachment(
	ctx context.Context,
	attachmentID shared.AttachmentID,
	actor identity.Actor,
) (inbound.AttachmentState, io.ReadSeekCloser, error) {
	ctx, span := s.tracer.Start(ctx, "MessageService.OpenAttachment",
		trace.WithAttributes(attribute.String("attachment.id", attachmentID.String())))
	defer span.End()

	slog.DebugContext(ctx, "opening attachment",
		slog.String("attachment_id", attachmentID.String()), slog.String("actor", actor.Sub))

	if s.blobs == nil || s.queries == nil {
		err := fmt.Errorf("attachments not configured")
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, nil, err
	}

	row, err := s.queries.GetAttachment(ctx, uuid.UUID(attachmentID))
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, nil, err
	}

	if err := requireIncidentAccess(
		ctx,
		s.access,
		actor,
		shared.IncidentID(row.IncidentID),
		access.IncidentRead,
	); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, nil, err
	}

	rc, err := s.blobs.Get(ctx, row.StorageKey)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.AttachmentState{}, nil, err
	}

	state := inbound.AttachmentState{
		ID:          shared.AttachmentID(row.ID),
		MessageID:   shared.MessageID(row.MessageID),
		IncidentID:  shared.IncidentID(row.IncidentID),
		Filename:    row.Filename,
		ContentType: row.ContentType,
		Size:        row.Size,
		Checksum:    row.Checksum,
		StorageKey:  row.StorageKey,
		UploaderSub: row.UploaderSub,
		CreatedAt:   row.CreatedAt,
	}

	return state, rc, nil
}

// isOptimisticConflict reports whether err is an optimistic concurrency conflict
// from the event store — safe to retry.
func isOptimisticConflict(err error) bool {
	// The event store returns shared.ErrConflict on version mismatch.
	return errors.Is(err, shared.ErrConflict)
}

func attachmentToState(
	id shared.AttachmentID,
	messageID shared.MessageID,
	incidentID shared.IncidentID,
	input inbound.AttachFileInput,
	checksum, storageKey, uploaderSub string,
	at time.Time,
) inbound.AttachmentState {
	return inbound.AttachmentState{
		ID:          id,
		MessageID:   messageID,
		IncidentID:  incidentID,
		Filename:    input.Filename,
		ContentType: input.ContentType,
		Size:        input.Size,
		Checksum:    checksum,
		StorageKey:  storageKey,
		UploaderSub: uploaderSub,
		CreatedAt:   at,
	}
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

	attachments := msg.Attachments()
	attStates := make([]inbound.AttachmentState, len(attachments))

	for i, a := range attachments {
		attStates[i] = inbound.AttachmentState{
			ID:          a.ID,
			MessageID:   shared.MessageID(msg.Root().ID()),
			IncidentID:  msg.IncidentID(),
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Size:        a.Size,
			Checksum:    a.Checksum,
			StorageKey:  a.StorageKey,
			UploaderSub: a.UploaderSub,
			CreatedAt:   a.AddedAt,
		}
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
		Attachments:    attStates,
	}
}
