package service_test

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// failingBlobs is a blob store whose operations can be made to fail.
type failingBlobs struct {
	*memBlobStore

	putErr, getErr, deleteErr error
	deleted                   []string
}

func (b *failingBlobs) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error {
	if b.putErr != nil {
		return b.putErr
	}

	return b.memBlobStore.Put(ctx, key, r, size, contentType)
}

func (b *failingBlobs) Get(ctx context.Context, key string) (io.ReadSeekCloser, error) {
	if b.getErr != nil {
		return nil, b.getErr
	}

	return b.memBlobStore.Get(ctx, key)
}

func (b *failingBlobs) Delete(ctx context.Context, key string) error {
	b.deleted = append(b.deleted, key)

	if b.deleteErr != nil {
		return b.deleteErr
	}

	return b.memBlobStore.Delete(ctx, key)
}

// failingCounter cannot hand out message numbers.
type failingCounter struct{}

func (failingCounter) Next(context.Context, shared.IncidentID) (int, error) { return 0, errBoom }

// messageRig is a message service on an incident that has one division, one message triaged to
// it and one attachment on it, with repositories that can be made to fail.
type messageRig struct {
	incidentRig

	messages   *faultyMessages
	blobs      *failingBlobs
	svc        *service.MessageService
	incidentID shared.IncidentID
	division   shared.DivisionID
	msg        shared.MessageID
	attachment shared.AttachmentID
}

func newMessageRig(t *testing.T) messageRig {
	t.Helper()

	blobs := &failingBlobs{memBlobStore: newMemBlobStore(0)}
	r := newIncidentRig(t, service.WithBlobStore(blobs))
	_, messages, _, _ := repos(r.store)
	rig := messageRig{
		incidentRig: r,
		messages:    &faultyMessages{MessageRepository: messages},
		blobs:       blobs,
	}
	rig.svc = r.factory.MessageService(rig.messages, r.incidents)

	res, err := r.svc.CreateIncident(ctx(), "Hochwasser", nil,
		[]incident.DivisionData{{Name: "Alpha", Description: "Zug 1"}}, nil, testActor)
	require.NoError(t, err)

	rig.incidentID = res.IncidentID
	rig.division = res.Divisions[1].ID

	state, err := rig.svc.RecordMessage(ctx(), rig.incidentID,
		"Pegel steigt", "Beobachter", "", "Führungsstab", "", shared.MediumRadio, nil, testActor)
	require.NoError(t, err)

	rig.msg = state.ID

	_, err = rig.svc.TriageMessage(ctx(), rig.msg, shared.TriageDone, shared.PriorityNormal,
		[]shared.DivisionID{rig.division}, nil, testActor)
	require.NoError(t, err)

	att, err := rig.svc.AttachFile(ctx(), rig.msg, fileInput("a.png", "image/png", []byte("x")), testActor)
	require.NoError(t, err)

	rig.attachment = att.ID
	rig.messages.saves = 0 // what the tests count starts here

	return rig
}

type messageOp struct {
	name string
	run  func(r messageRig, id shared.MessageID) error
}

func messageOps() []messageOp {
	return []messageOp{
		{"CorrectMessage", func(r messageRig, id shared.MessageID) error {
			content := "Pegel sinkt"
			_, err := r.svc.CorrectMessage(ctx(), id, &content, nil, nil, nil, nil, nil, nil, testActor)

			return err
		}},
		{"TriageMessage", func(r messageRig, id shared.MessageID) error {
			_, err := r.svc.TriageMessage(ctx(), id, shared.TriageDone, shared.PriorityHigh,
				[]shared.DivisionID{r.division}, nil, testActor)

			return err
		}},
		{"AcknowledgeMessage", func(r messageRig, id shared.MessageID) error {
			_, err := r.svc.AcknowledgeMessage(ctx(), id, r.division, testActor)

			return err
		}},
		{"RevokeMessageAcknowledgement", func(r messageRig, id shared.MessageID) error {
			_, err := r.svc.RevokeMessageAcknowledgement(ctx(), id, r.division, testActor)

			return err
		}},
		{"DeleteMessage", func(r messageRig, id shared.MessageID) error {
			return r.svc.DeleteMessage(ctx(), id, testActor)
		}},
		{"AttachFile", func(r messageRig, id shared.MessageID) error {
			_, err := r.svc.AttachFile(ctx(), id, fileInput("b.png", "image/png", []byte("y")), testActor)

			return err
		}},
		{"RemoveAttachment", func(r messageRig, id shared.MessageID) error {
			return r.svc.RemoveAttachment(ctx(), id, r.attachment, testActor)
		}},
	}
}

func TestMessageService_CommandsReportFailures(t *testing.T) {
	for _, op := range messageOps() {
		t.Run(op.name+" without permission", func(t *testing.T) {
			r := newMessageRig(t)
			r.access.denied = true

			require.ErrorIs(t, op.run(r, r.msg), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r := newMessageRig(t)
			r.access.err = errBoom

			require.ErrorIs(t, op.run(r, r.msg), errBoom)
		})

		t.Run(op.name+" on a message that does not exist", func(t *testing.T) {
			r := newMessageRig(t)

			require.ErrorIs(t, op.run(r, shared.MessageID(newID())), shared.ErrNotFound)
		})

		t.Run(op.name+" on a message that was deleted", func(t *testing.T) {
			r := newMessageRig(t)
			require.NoError(t, r.svc.DeleteMessage(ctx(), r.msg, testActor))

			require.ErrorIs(t, op.run(r, r.msg), shared.ErrNotFound)
		})

		t.Run(op.name+" when the message cannot be loaded", func(t *testing.T) {
			r := newMessageRig(t)
			r.messages.load = errBoom

			require.ErrorIs(t, op.run(r, r.msg), errBoom)
		})

		t.Run(op.name+" when the message cannot be saved", func(t *testing.T) {
			r := newMessageRig(t)
			r.messages.save = errBoom

			require.ErrorIs(t, op.run(r, r.msg), errBoom)
		})

		t.Run(op.name+" on a closed incident", func(t *testing.T) {
			r := newMessageRig(t)
			_, err := r.incidentRig.svc.CloseIncident(ctx(), r.incidentID, testActor)
			require.NoError(t, err)

			require.ErrorIs(t, op.run(r, r.msg), shared.ErrIncidentNotOpen)
		})

		t.Run(op.name+" when the incident cannot be loaded", func(t *testing.T) {
			r := newMessageRig(t)
			r.incidents.load = errBoom

			require.ErrorIs(t, op.run(r, r.msg), errBoom)
		})
	}
}

func TestMessageService_RecordMessage_Failures(t *testing.T) {
	record := func(r messageRig, content string, msgTime *time.Time) error {
		_, err := r.svc.RecordMessage(ctx(), r.incidentID,
			content, "Sender", "", "Empfänger", "", shared.MediumRadio, msgTime, testActor)

		return err
	}

	t.Run("without permission", func(t *testing.T) {
		r := newMessageRig(t)
		r.access.denied = true

		require.ErrorIs(t, record(r, "Inhalt", nil), shared.ErrForbidden)
	})

	t.Run("on a closed incident", func(t *testing.T) {
		r := newMessageRig(t)
		_, err := r.incidentRig.svc.CloseIncident(ctx(), r.incidentID, testActor)
		require.NoError(t, err)

		require.ErrorIs(t, record(r, "Inhalt", nil), shared.ErrIncidentNotOpen)
	})

	t.Run("on an incident that does not exist", func(t *testing.T) {
		r := newMessageRig(t)

		_, err := r.svc.RecordMessage(ctx(), shared.IncidentID(newID()),
			"Inhalt", "Sender", "", "Empfänger", "", shared.MediumRadio, nil, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("without content", func(t *testing.T) {
		r := newMessageRig(t)

		require.ErrorIs(t, record(r, " ", nil), shared.ErrInvalidInput)
	})

	t.Run("from the future", func(t *testing.T) {
		r := newMessageRig(t)
		future := testAt.Add(time.Hour)

		require.ErrorIs(t, record(r, "Inhalt", &future), shared.ErrInvalidInput)
	})

	t.Run("that cannot be saved", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.save = errBoom

		require.ErrorIs(t, record(r, "Inhalt", nil), errBoom)
	})

	t.Run("when no number can be assigned", func(t *testing.T) {
		store := newIncidentRig(t, service.WithMessageCounter(failingCounter{}))
		_, messages, _, _ := repos(store.store)
		svc := store.factory.MessageService(messages, store.incidents)
		incidentID := store.create(t, "Einsatz")

		_, err := svc.RecordMessage(ctx(), incidentID,
			"Inhalt", "Sender", "", "Empfänger", "", shared.MediumRadio, nil, testActor)
		require.ErrorIs(t, err, errBoom)
	})
}

func TestMessageService_RetriesAfterAConflict(t *testing.T) {
	t.Run("a correction goes through once the other writer is done", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 2
		content := "Pegel sinkt"

		state, err := r.svc.CorrectMessage(ctx(), r.msg, &content, nil, nil, nil, nil, nil, nil, testActor)
		require.NoError(t, err)
		assert.Equal(t, "Pegel sinkt", state.Content)
		assert.Len(t, state.Attachments, 1, "the state carries the attachments")
		assert.Equal(t, 3, r.messages.saves)
	})

	t.Run("a correction gives up after three attempts", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 10
		content := "Pegel sinkt"

		_, err := r.svc.CorrectMessage(ctx(), r.msg, &content, nil, nil, nil, nil, nil, nil, testActor)
		require.ErrorIs(t, err, shared.ErrConflict)
		assert.Equal(t, 3, r.messages.saves)
	})

	t.Run("an attachment goes through once the other writer is done", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 1

		_, err := r.svc.AttachFile(ctx(), r.msg, fileInput("b.png", "image/png", []byte("y")), testActor)
		require.NoError(t, err)
		assert.Equal(t, 2, r.blobs.count(), "the blob is written once, not per attempt")
	})

	t.Run("an attachment that never goes through leaves no blob behind", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 10
		before := r.blobs.count()

		_, err := r.svc.AttachFile(ctx(), r.msg, fileInput("b.png", "image/png", []byte("y")), testActor)
		require.ErrorIs(t, err, shared.ErrConflict)
		assert.Equal(t, before, r.blobs.count())
	})

	t.Run("a removal goes through once the other writer is done", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 1

		require.NoError(t, r.svc.RemoveAttachment(ctx(), r.msg, r.attachment, testActor))
		assert.Zero(t, r.blobs.count())
	})

	t.Run("a removal gives up after three attempts", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.conflicts = 10

		require.ErrorIs(t, r.svc.RemoveAttachment(ctx(), r.msg, r.attachment, testActor), shared.ErrConflict)
		assert.Equal(t, 1, r.blobs.count(), "the blob stays as long as the attachment does")
	})
}

func TestMessageService_TriageAndAcknowledgeCheckTheDivision(t *testing.T) {
	r := newMessageRig(t)
	stranger := shared.DivisionID(newID())

	_, err := r.svc.TriageMessage(ctx(), r.msg, shared.TriageDone, shared.PriorityNormal,
		[]shared.DivisionID{stranger}, nil, testActor)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = r.svc.AcknowledgeMessage(ctx(), r.msg, stranger, testActor)
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	_, err = r.svc.RevokeMessageAcknowledgement(ctx(), r.msg, stranger, testActor)
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

func TestMessageService_AttachFile_Failures(t *testing.T) {
	t.Run("a blob that cannot be written", func(t *testing.T) {
		r := newMessageRig(t)
		r.blobs.putErr = errBoom

		_, err := r.svc.AttachFile(ctx(), r.msg, fileInput("b.png", "image/png", []byte("y")), testActor)
		require.ErrorIs(t, err, errBoom)

		state, err := r.messages.MessageRepository.Load(ctx(), r.msg)
		require.NoError(t, err)
		assert.Len(t, state.Attachments(), 1, "no attachment without a blob")
	})

	t.Run("a file that is not allowed leaves no blob behind", func(t *testing.T) {
		r := newMessageRig(t)
		before := r.blobs.count()

		_, err := r.svc.AttachFile(ctx(), r.msg, fileInput("b.svg", "image/svg+xml", []byte("<svg/>")), testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Equal(t, before, r.blobs.count())
	})

	t.Run("a blob that cannot be cleaned up does not hide the cause", func(t *testing.T) {
		r := newMessageRig(t)
		r.messages.save = errBoom
		r.blobs.deleteErr = errBoom

		_, err := r.svc.AttachFile(ctx(), r.msg, fileInput("b.png", "image/png", []byte("y")), testActor)
		require.ErrorIs(t, err, errBoom)
		assert.Len(t, r.blobs.deleted, 1, "a clean up was tried")
	})

	t.Run("without a blob store attachments are not supported", func(t *testing.T) {
		r := newIncidentRig(t)
		_, messages, _, _ := repos(r.store)
		svc := r.factory.MessageService(messages, r.incidents)

		_, err := svc.AttachFile(
			ctx(),
			shared.MessageID(newID()),
			fileInput("b.png", "image/png", []byte("y")),
			testActor,
		)
		require.ErrorIs(t, err, shared.ErrNotSupported)
		require.ErrorIs(
			t,
			svc.RemoveAttachment(ctx(), shared.MessageID(newID()), shared.AttachmentID(newID()), testActor),
			shared.ErrNotSupported,
		)

		_, rc, err := svc.OpenAttachment(ctx(), shared.AttachmentID(newID()), testActor)
		require.ErrorIs(t, err, shared.ErrNotSupported)
		assert.Nil(t, rc)
	})
}

func TestMessageService_RemoveAttachment_Failures(t *testing.T) {
	t.Run("an attachment that is not on the message", func(t *testing.T) {
		r := newMessageRig(t)

		err := r.svc.RemoveAttachment(ctx(), r.msg, shared.AttachmentID(newID()), testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
		assert.Equal(t, 1, r.blobs.count())
	})

	t.Run("a blob that cannot be deleted does not undo the removal", func(t *testing.T) {
		r := newMessageRig(t)
		r.blobs.deleteErr = errBoom

		require.NoError(t, r.svc.RemoveAttachment(ctx(), r.msg, r.attachment, testActor))
		assert.Len(t, r.blobs.deleted, 1)

		msg, err := r.messages.MessageRepository.Load(ctx(), r.msg)
		require.NoError(t, err)
		assert.Empty(t, msg.Attachments())
	})
}

func TestMessageService_DeleteMessage_BlobFailure(t *testing.T) {
	r := newMessageRig(t)
	r.blobs.deleteErr = errBoom

	require.NoError(t, r.svc.DeleteMessage(ctx(), r.msg, testActor), "the blobs are cleaned up on a best effort basis")
	assert.Len(t, r.blobs.deleted, 1)
}

// attachmentQueries knows one attachment.
type attachmentQueries struct {
	outbound.Queries

	row *outbound.AttachmentRM
	err error
}

func (q attachmentQueries) GetAttachment(context.Context, uuid.UUID) (*outbound.AttachmentRM, error) {
	return q.row, q.err
}

func TestMessageService_OpenAttachment_Failures(t *testing.T) {
	open := func(t *testing.T, queries attachmentQueries, blobs outbound.BlobStore, mutate func(*accessState)) error {
		t.Helper()

		r := newIncidentRig(t, service.WithBlobStore(blobs), service.WithQueries(queries))
		_, messages, _, _ := repos(r.store)
		svc := r.factory.MessageService(messages, r.incidents)

		if mutate != nil {
			mutate(r.access)
		}

		_, rc, err := svc.OpenAttachment(ctx(), shared.AttachmentID(newID()), testActor)
		assert.Nil(t, rc)

		return err
	}

	row := &outbound.AttachmentRM{ID: newID(), IncidentID: newID(), StorageKey: "incidents/x/y"}

	t.Run("an attachment that is not known", func(t *testing.T) {
		err := open(t, attachmentQueries{err: shared.ErrNotFound}, newMemBlobStore(0), nil)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("an incident the actor may not read", func(t *testing.T) {
		err := open(t, attachmentQueries{row: row}, newMemBlobStore(0), func(a *accessState) { a.denied = true })
		require.ErrorIs(t, err, shared.ErrForbidden)
	})

	t.Run("a blob that is gone", func(t *testing.T) {
		err := open(t, attachmentQueries{row: row}, newMemBlobStore(0), nil)
		require.ErrorIs(t, err, outbound.ErrBlobNotFound)
	})
}
