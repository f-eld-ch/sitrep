package service_test

import (
	"bytes"
	"context"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	inmemqueries "github.com/f-eld-ch/sitrep/internal/adapter/outbound/queries/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// ── in-memory BlobStore ────────────────────────────────────────────────────────

type memBlobStore struct {
	mu      sync.RWMutex
	blobs   map[string][]byte
	maxSize int64 // 0 = unlimited
}

func newMemBlobStore(maxSize int64) *memBlobStore {
	return &memBlobStore{blobs: make(map[string][]byte), maxSize: maxSize}
}

var _ outbound.BlobStore = (*memBlobStore)(nil)

func (s *memBlobStore) Put(_ context.Context, key string, r io.Reader, size int64, _ string) error {
	limit := size + 1
	if s.maxSize > 0 {
		limit = s.maxSize + 1
	}

	data, err := io.ReadAll(io.LimitReader(r, limit))
	if err != nil {
		return err
	}

	if s.maxSize > 0 && int64(len(data)) > s.maxSize {
		return outbound.ErrBlobTooLarge
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.blobs[key] = data

	return nil
}

func (s *memBlobStore) Get(_ context.Context, key string) (io.ReadSeekCloser, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, ok := s.blobs[key]
	if !ok {
		return nil, outbound.ErrBlobNotFound
	}

	return nopRSC{bytes.NewReader(data)}, nil
}

func (s *memBlobStore) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.blobs, key)

	return nil
}

func (s *memBlobStore) DeletePrefix(_ context.Context, prefix string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for k := range s.blobs {
		if strings.HasPrefix(k, prefix) {
			delete(s.blobs, k)
		}
	}

	return nil
}

func (s *memBlobStore) count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return len(s.blobs)
}

// nopRSC wraps *bytes.Reader to satisfy io.ReadSeekCloser.
type nopRSC struct{ *bytes.Reader }

func (nopRSC) Close() error { return nil }

// ── test stack with attachments ────────────────────────────────────────────────

type attachStack struct {
	incidents *service.IncidentService
	messages  *service.MessageService
	blobs     *memBlobStore
	proj      *projection.Projector
}

// newAttachStack wires a complete inmem stack with a blob store and
// projector-backed Queries so all three attachment methods can be tested.
// maxBlobSize of 0 means unlimited.
func newAttachStack(t *testing.T, maxBlobSize int64) *attachStack {
	t.Helper()

	store := inmem.NewEventStore()

	incH := projection.NewIncidentHandler()
	divH := projection.NewIncidentDivisionHandler()
	msgH := projection.NewMessageHandler()
	layerH := projection.NewLayerFeaturesHandler()

	proj := projection.NewProjector(store, []projection.Handler{incH, divH, msgH, layerH})
	queries := inmemqueries.NewQueries(incH, divH, msgH, layerH)
	blobs := newMemBlobStore(maxBlobSize)

	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
		service.WithIncidentHierarchyGuard(inmem.NewIncidentHierarchyGuard(store)),
		service.WithBlobStore(blobs),
		service.WithQueries(queries),
	)

	incidents := eventstore.NewIncidentRepository(store)
	messages := eventstore.NewMessageRepository(store)
	layers := eventstore.NewLayerRepository(store)

	return &attachStack{
		incidents: factory.IncidentService(incidents, layers),
		messages:  factory.MessageService(messages, incidents),
		blobs:     blobs,
		proj:      proj,
	}
}

func (s *attachStack) catchUp(t *testing.T) {
	t.Helper()
	require.NoError(t, s.proj.CatchUp(ctx()))
}

func fileInput(name, ct string, content []byte) inbound.AttachFileInput {
	return inbound.AttachFileInput{
		Filename:    name,
		ContentType: ct,
		Size:        int64(len(content)),
		Content:     bytes.NewReader(content),
	}
}

// ── AttachFile ─────────────────────────────────────────────────────────────────

func TestMessageService_AttachFile(t *testing.T) {
	t.Run("stores blob and returns populated state", func(t *testing.T) {
		s := newAttachStack(t, 0)

		incRes, err := s.incidents.CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
		require.NoError(t, err)

		msgRes, err := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"Status", "A", "", "B", "", shared.MediumRadio, nil, testActor)
		require.NoError(t, err)

		content := []byte("hello attachment")
		state, err := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("test.txt", "text/plain", content), testActor)
		require.NoError(t, err)

		assert.Equal(t, "test.txt", state.Filename)
		assert.Equal(t, "text/plain", state.ContentType)
		assert.Equal(t, int64(len(content)), state.Size)
		assert.True(t, strings.HasPrefix(state.Checksum, "sha256:"), "checksum should use sha256 prefix")
		assert.Equal(t, msgRes.ID, state.MessageID)
		assert.Equal(t, incRes.IncidentID, state.IncidentID)
		assert.Equal(t, 1, s.blobs.count())
	})

	t.Run("ErrNotSupported when no blob store configured", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incSvc := factory.IncidentService(incidents, layers)
		msgSvc := factory.MessageService(messages, incidents)

		incRes, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		msgRes, _ := msgSvc.RecordMessage(ctx(), incRes.IncidentID,
			"msg", "X", "", "Y", "", shared.MediumRadio, nil, testActor)

		_, err := msgSvc.AttachFile(ctx(), msgRes.ID,
			fileInput("f.txt", "text/plain", []byte("data")), testActor)
		assert.ErrorIs(t, err, shared.ErrNotSupported)
	})

	t.Run("ErrBlobTooLarge when file exceeds configured max size", func(t *testing.T) {
		const maxBytes = 10
		s := newAttachStack(t, maxBytes)

		incRes, _ := s.incidents.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"msg", "X", "", "Y", "", shared.MediumRadio, nil, testActor)

		oversized := bytes.Repeat([]byte("x"), maxBytes+1)
		_, err := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("big.bin", "application/octet-stream", oversized), testActor)
		assert.ErrorIs(t, err, outbound.ErrBlobTooLarge)
		// Compensating delete must have removed the partial blob.
		assert.Equal(t, 0, s.blobs.count())
	})

	t.Run("ErrNotFound for unknown message", func(t *testing.T) {
		s := newAttachStack(t, 0)

		_, err := s.messages.AttachFile(ctx(), shared.MessageID(newID()),
			fileInput("f.txt", "text/plain", []byte("x")), testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("ErrIncidentNotOpen on closed incident", func(t *testing.T) {
		s := newAttachStack(t, 0)

		incRes, _ := s.incidents.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
		msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"msg", "X", "", "Y", "", shared.MediumRadio, nil, testActor)
		_, _ = s.incidents.CloseIncident(ctx(), incRes.IncidentID, testActor)

		_, err := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("f.txt", "text/plain", []byte("x")), testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})
}

// ── RemoveAttachment ───────────────────────────────────────────────────────────

func TestMessageService_RemoveAttachment(t *testing.T) {
	t.Run("removes attachment and deletes blob", func(t *testing.T) {
		s := newAttachStack(t, 0)

		incRes, _ := s.incidents.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"Pegel", "A", "", "B", "", shared.MediumRadio, nil, testActor)

		state, err := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("photo.jpg", "image/jpeg", []byte("imgdata")), testActor)
		require.NoError(t, err)
		assert.Equal(t, 1, s.blobs.count())

		require.NoError(t, s.messages.RemoveAttachment(ctx(), msgRes.ID, state.ID, testActor))
		assert.Equal(t, 0, s.blobs.count(), "blob must be deleted after event commits")
	})

	t.Run("ErrNotSupported when no blob store configured", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incSvc := factory.IncidentService(incidents, layers)
		msgSvc := factory.MessageService(messages, incidents)

		incRes, _ := incSvc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		msgRes, _ := msgSvc.RecordMessage(ctx(), incRes.IncidentID,
			"msg", "X", "", "Y", "", shared.MediumRadio, nil, testActor)

		err := msgSvc.RemoveAttachment(ctx(), msgRes.ID, shared.AttachmentID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotSupported)
	})

	t.Run("ErrIncidentNotOpen on closed incident", func(t *testing.T) {
		s := newAttachStack(t, 0)

		incRes, _ := s.incidents.CreateIncident(ctx(), "Closed", nil, nil, nil, testActor)
		msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"msg", "X", "", "Y", "", shared.MediumRadio, nil, testActor)
		state, _ := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("f.txt", "text/plain", []byte("data")), testActor)
		_, _ = s.incidents.CloseIncident(ctx(), incRes.IncidentID, testActor)

		err := s.messages.RemoveAttachment(ctx(), msgRes.ID, state.ID, testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})
}

// ── OpenAttachment ─────────────────────────────────────────────────────────────

func TestMessageService_OpenAttachment(t *testing.T) {
	t.Run("resolves metadata and streams blob content", func(t *testing.T) {
		s := newAttachStack(t, 0)

		incRes, _ := s.incidents.CreateIncident(ctx(), "Lage", nil, nil, nil, testActor)
		msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
			"Bericht", "A", "", "B", "", shared.MediumRadio, nil, testActor)

		content := []byte("pdf content")
		state, err := s.messages.AttachFile(ctx(), msgRes.ID,
			fileInput("report.pdf", "application/pdf", content), testActor)
		require.NoError(t, err)

		// Project events into read model before querying.
		s.catchUp(t)

		meta, rc, err := s.messages.OpenAttachment(ctx(), state.ID, testActor)
		require.NoError(t, err)
		defer rc.Close()

		assert.Equal(t, state.ID, meta.ID)
		assert.Equal(t, "report.pdf", meta.Filename)
		assert.Equal(t, "application/pdf", meta.ContentType)
		assert.Equal(t, int64(len(content)), meta.Size)

		got, readErr := io.ReadAll(rc)
		require.NoError(t, readErr)
		assert.Equal(t, content, got)
	})

	t.Run("ErrNotFound for unknown attachment", func(t *testing.T) {
		s := newAttachStack(t, 0)

		_, _, err := s.messages.OpenAttachment(ctx(), shared.AttachmentID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("ErrNotSupported when no blob store configured", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, messages, layers, _ := repos(store)
		incSvc := factory.IncidentService(incidents, layers)
		msgSvc := factory.MessageService(messages, incidents)
		_, _ = incSvc, msgSvc

		_, _, err := msgSvc.OpenAttachment(ctx(), shared.AttachmentID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotSupported)
	})
}

// ── DeleteMessage blob cleanup ─────────────────────────────────────────────────

func TestMessageService_DeleteMessage_CleansUpBlobs(t *testing.T) {
	s := newAttachStack(t, 0)

	incRes, _ := s.incidents.CreateIncident(ctx(), "Archive", nil, nil, nil, testActor)
	msgRes, _ := s.messages.RecordMessage(ctx(), incRes.IncidentID,
		"Mit Anhängen", "A", "", "B", "", shared.MediumRadio, nil, testActor)

	_, err := s.messages.AttachFile(ctx(), msgRes.ID,
		fileInput("a.txt", "text/plain", []byte("aaa")), testActor)
	require.NoError(t, err)
	_, err = s.messages.AttachFile(ctx(), msgRes.ID,
		fileInput("b.txt", "text/plain", []byte("bbb")), testActor)
	require.NoError(t, err)
	assert.Equal(t, 2, s.blobs.count())

	require.NoError(t, s.messages.DeleteMessage(ctx(), msgRes.ID, testActor))
	assert.Equal(t, 0, s.blobs.count(), "all attachment blobs must be removed when message is deleted")
}
