package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// stubMessages implements only the attachment methods of inbound.MessageService; any other
// call panics on the nil embedded interface, which would flag an unexpected dependency.
type stubMessages struct {
	inbound.MessageService

	attachErr  error
	attachID   shared.AttachmentID
	gotMsgID   shared.MessageID
	gotInput   inbound.AttachFileInput
	gotContent []byte
	gotActor   identity.Actor

	openState inbound.AttachmentState
	openBody  string
	openErr   error
}

func (s *stubMessages) AttachFile(
	_ context.Context,
	id shared.MessageID,
	in inbound.AttachFileInput,
	actor identity.Actor,
) (inbound.AttachmentState, error) {
	s.gotMsgID = id
	s.gotInput = in
	s.gotActor = actor

	content, err := io.ReadAll(in.Content)
	if err != nil {
		return inbound.AttachmentState{}, err
	}

	s.gotContent = content

	if s.attachErr != nil {
		return inbound.AttachmentState{}, s.attachErr
	}

	return inbound.AttachmentState{ID: s.attachID, Filename: in.Filename, ContentType: in.ContentType}, nil
}

type readSeekCloser struct{ *strings.Reader }

func (readSeekCloser) Close() error { return nil }

func (s *stubMessages) OpenAttachment(
	_ context.Context,
	_ shared.AttachmentID,
	_ identity.Actor,
) (inbound.AttachmentState, io.ReadSeekCloser, error) {
	if s.openErr != nil {
		return inbound.AttachmentState{}, nil, s.openErr
	}

	return s.openState, readSeekCloser{strings.NewReader(s.openBody)}, nil
}

// pngBytes is a valid PNG signature followed by padding; http.DetectContentType sniffs image/png.
func pngBytes() []byte {
	return append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 32)...)
}

func serve(t *testing.T, stack Stack, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()

	srv, err := NewServer(WithApiV2(stack))
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)

	return rec
}

func TestUploadAttachment_Success(t *testing.T) {
	attID := shared.AttachmentID(uuid.New())
	msgs := &stubMessages{attachID: attID}
	msgID := uuid.New().String()
	data := pngBytes()

	rec := serve(t, Stack{Messages: msgs, MaxAttachmentSize: 1024}, uploadRequest(t, msgID, "map.png", data, true))

	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	assert.Equal(t, "/api/v2/attachments/"+attID.String(), got["URL"])

	assert.Equal(t, msgID, msgs.gotMsgID.String())
	assert.Equal(t, "map.png", msgs.gotInput.Filename)
	assert.Equal(t, "image/png", msgs.gotInput.ContentType)
	assert.Equal(t, int64(1024), msgs.gotInput.Size)
	assert.Equal(t, data, msgs.gotContent, "peeked bytes and the remainder must both reach the service")
	assert.Equal(t, "local-user", msgs.gotActor.Sub)
}

func TestUploadAttachment_StreamIsBoundedToMaxSizePlusOne(t *testing.T) {
	msgs := &stubMessages{attachID: shared.AttachmentID(uuid.New())}

	data := append(pngBytes(), bytes.Repeat([]byte{1}, 500)...)

	rec := serve(t, Stack{Messages: msgs, MaxAttachmentSize: 100},
		uploadRequest(t, uuid.New().String(), "big.png", data, true))

	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Len(t, msgs.gotContent, 101, "service sees at most max+1 bytes so it can detect an oversize upload")
}

func TestUploadAttachment_ErrorMapping(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{"not supported", shared.ErrNotSupported, http.StatusNotImplemented},
		{"too large", outbound.ErrBlobTooLarge, http.StatusRequestEntityTooLarge},
		{"not found", shared.ErrNotFound, http.StatusNotFound},
		{"forbidden", shared.ErrForbidden, http.StatusForbidden},
		{"invalid input", shared.ErrInvalidInput, http.StatusBadRequest},
		{"unexpected", errors.New("disk exploded: /var/secret/path"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msgs := &stubMessages{attachErr: tt.err}
			rec := serve(t, Stack{Messages: msgs},
				uploadRequest(t, uuid.New().String(), "a.png", pngBytes(), true))

			assert.Equal(t, tt.want, rec.Code)

			if tt.want == http.StatusInternalServerError {
				assert.NotContains(t, rec.Body.String(), "/var/secret/path", "internal errors must not leak")
				assert.JSONEq(t, `{"error":"internal server error"}`, rec.Body.String())
			}
		})
	}
}

func TestUploadAttachment_BadRequests(t *testing.T) {
	t.Run("invalid message id", func(t *testing.T) {
		rec := serve(t, Stack{Messages: &stubMessages{}}, uploadRequest(t, "nope", "a.png", pngBytes(), true))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "invalid message id")
	})

	t.Run("not multipart", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
			"/api/v2/messages/"+uuid.New().String()+"/attachments", strings.NewReader("{}"))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Sitrep-Upload", "1")

		rec := serve(t, Stack{Messages: &stubMessages{}}, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "multipart")
	})

	t.Run("multipart without a part", func(t *testing.T) {
		rec := serve(t, Stack{Messages: &stubMessages{}},
			uploadRequest(t, uuid.New().String(), "", nil, true))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "no file part")
	})

	t.Run("html is rejected even when named .png", func(t *testing.T) {
		msgs := &stubMessages{}
		rec := serve(t, Stack{Messages: msgs},
			uploadRequest(t, uuid.New().String(), "x.png", []byte("<html><script>alert(1)</script></html>"), true))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
		assert.Contains(t, rec.Body.String(), "text/html")
		assert.Nil(t, msgs.gotContent)
	})

	t.Run("svg is rejected", func(t *testing.T) {
		rec := serve(
			t,
			Stack{Messages: &stubMessages{}},
			uploadRequest(
				t,
				uuid.New().String(),
				"x.svg",
				[]byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`),
				true,
			),
		)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}

func downloadRequest(id string) *http.Request {
	return httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v2/attachments/"+id, nil)
}

func TestDownloadAttachment_Headers(t *testing.T) {
	tests := []struct {
		name            string
		filename        string
		contentType     string
		wantDisposition string
	}{
		{"image is inline", "map.png", "image/png", `inline; filename="map.png"; filename*=UTF-8''map.png`},
		{"pdf is inline", "a b.pdf", "application/pdf", `inline; filename="a b.pdf"; filename*=UTF-8''a%20b.pdf`},
		{"zip is a download", "x.zip", "application/zip", `attachment; filename="x.zip"; filename*=UTF-8''x.zip`},
		{
			"hostile filename is sanitised", "../../etc/pa\"ss\r\nwd.png", "image/png",
			`inline; filename="pa_ss__wd.png"; filename*=UTF-8''pa_ss__wd.png`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msgs := &stubMessages{
				openState: inbound.AttachmentState{Filename: tt.filename, ContentType: tt.contentType},
				openBody:  "file-bytes",
			}

			rec := serve(t, Stack{Messages: msgs}, downloadRequest(uuid.New().String()))

			require.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "file-bytes", rec.Body.String())
			assert.Equal(t, tt.wantDisposition, rec.Header().Get("Content-Disposition"))
			assert.Equal(t, tt.contentType, rec.Header().Get("Content-Type"))
			assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		})
	}
}

func TestDownloadAttachment_ErrorMapping(t *testing.T) {
	tests := []struct {
		err  error
		want int
	}{
		{shared.ErrNotFound, http.StatusNotFound},
		{shared.ErrForbidden, http.StatusForbidden},
		{errors.New("boom"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.err.Error(), func(t *testing.T) {
			rec := serve(t, Stack{Messages: &stubMessages{openErr: tt.err}}, downloadRequest(uuid.New().String()))
			assert.Equal(t, tt.want, rec.Code)
			assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		})
	}
}
