package server

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uploadRequest builds a multipart POST request for the upload route.
func uploadRequest(t *testing.T, msgID string, filename string, body []byte, csrf bool) *http.Request {
	t.Helper()

	buf := &bytes.Buffer{}
	w := multipart.NewWriter(buf)

	if len(body) > 0 {
		part, err := w.CreateFormFile("file", filename)
		require.NoError(t, err)
		_, err = part.Write(body)
		require.NoError(t, err)
	}

	require.NoError(t, w.Close())

	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/api/v2/messages/"+msgID+"/attachments",
		buf,
	)
	req.Header.Set("Content-Type", w.FormDataContentType())

	if csrf {
		req.Header.Set("X-Sitrep-Upload", "1")
	}

	return req
}

func TestUploadAttachment_MissingCSRFHeader(t *testing.T) {
	srv, err := NewServer(WithApiV2(Stack{}))
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := uploadRequest(t, uuid.New().String(), "test.txt", []byte("hello"), false)
	srv.router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusForbidden, rec.Code)
}

func TestUploadAttachment_DisallowedContentType(t *testing.T) {
	// application/octet-stream is not in the allowlist.
	// A file starting with a null byte is detected as application/octet-stream.
	srv, err := NewServer(WithApiV2(Stack{}))
	require.NoError(t, err)

	binaryContent := []byte{0x00, 0x01, 0x02, 0x03}
	rec := httptest.NewRecorder()
	req := uploadRequest(t, uuid.New().String(), "bin.bin", binaryContent, true)
	srv.router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDownloadAttachment_InvalidID(t *testing.T) {
	srv, err := NewServer(WithApiV2(Stack{}))
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v2/attachments/not-a-uuid", nil)
	srv.router.ServeHTTP(rec, req)

	// RequireLogin injects a local actor; invalid UUID → 400.
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"report.pdf", "report.pdf"},
		{"my file.pdf", "my file.pdf"},
		{"../../etc/passwd", "passwd"},
		{"/var/log/secret", "secret"},
		{`C:\Windows\System32\file.exe`, "file.exe"},
		{"", "attachment"},
		{"<script>.js", "_script_.js"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.want, sanitizeFilename(tt.input))
		})
	}
}
