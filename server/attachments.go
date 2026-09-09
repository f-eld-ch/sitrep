package server

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v5"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// allowedContentTypes is the set of MIME types permitted for attachments.
// SVG and HTML are intentionally excluded to prevent stored XSS.
var allowedContentTypes = map[string]bool{
	"image/jpeg":               true,
	"image/png":                true,
	"image/gif":                true,
	"image/webp":               true,
	"image/avif":               true,
	"image/tiff":               true,
	"image/bmp":                true,
	"application/pdf":          true,
	"text/plain":               true,
	"application/zip":          true,
	"application/vnd.ms-excel": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   true,
	"application/vnd.ms-powerpoint":                                             true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"application/vnd.oasis.opendocument.text":                                   true,
	"application/vnd.oasis.opendocument.spreadsheet":                            true,
	"application/vnd.oasis.opendocument.presentation":                           true,
}

// unsafeFilenameChars strips characters that are dangerous in Content-Disposition filenames.
var unsafeFilenameChars = regexp.MustCompile(`[^\w\-. ]`)

func sanitizeFilename(name string) string {
	// strip path components
	name = name[strings.LastIndexAny(name, `/\`)+1:]

	name = unsafeFilenameChars.ReplaceAllString(name, "_")
	if name == "" {
		return "attachment"
	}

	return name
}

// attachmentErrorToHTTP maps domain errors to HTTP status codes.
func attachmentErrorToHTTP(c *echo.Context, err error) error {
	switch {
	case errors.Is(err, shared.ErrNotFound):
		return c.JSON(http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, shared.ErrForbidden):
		return c.JSON(http.StatusForbidden, map[string]string{"error": err.Error()})
	case errors.Is(err, shared.ErrInvalidInput):
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		slog.ErrorContext(c.Request().Context(), "attachment handler error", slog.String("error", err.Error()))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// uploadAttachment handles POST /api/v2/messages/:id/attachments.
func uploadAttachment(messages inbound.MessageService) echo.HandlerFunc {
	return func(c *echo.Context) error {
		// CSRF: multipart/form-data is a CORS-simple content type so no preflight fires.
		// Requiring this custom header forces a preflight on cross-origin requests.
		if c.Request().Header.Get("X-Sitrep-Upload") != "1" {
			return c.JSON(http.StatusForbidden, map[string]string{"error": "missing X-Sitrep-Upload header"})
		}

		actor, err := identity.ActorFrom(c.Request().Context())
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		}

		msgID, err := shared.ParseMessageID(c.Param("id"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid message id"})
		}

		mr, err := c.Request().MultipartReader()
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "expected multipart/form-data"})
		}

		part, err := mr.NextPart()
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file part in multipart body"})
		}

		defer func() { _ = part.Close() }()

		filename := part.FileName()
		if filename == "" {
			filename = part.FormName()
		}

		// Peek first 512 bytes for content-type detection.
		peek := make([]byte, 512)
		n, peekErr := io.ReadFull(part, peek)
		peek = peek[:n]

		if peekErr != nil && !errors.Is(peekErr, io.ErrUnexpectedEOF) && !errors.Is(peekErr, io.EOF) {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "failed to read upload"})
		}

		detectedType := http.DetectContentType(peek)
		// Strip parameters (e.g. "; charset=utf-8") for allowlist check.
		mediaType, _, _ := mime.ParseMediaType(detectedType)
		if !allowedContentTypes[mediaType] {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("content type %q is not allowed", mediaType),
			})
		}

		// Reconstruct the full stream: peeked bytes + remainder.
		fullReader := io.MultiReader(bytes.NewReader(peek), part)

		// Size is unknown when streaming; pass -1 and let the service's MaxAttachmentSize
		// check catch oversized uploads via the domain validation.
		state, err := messages.AttachFile(c.Request().Context(), msgID, inbound.AttachFileInput{
			Filename:    filename,
			ContentType: mediaType,
			Size:        -1,
			Content:     fullReader,
		}, actor)
		if err != nil {
			return attachmentErrorToHTTP(c, err)
		}

		state.URL = "/api/v2/attachments/" + state.ID.String()

		return c.JSON(http.StatusCreated, state)
	}
}

// downloadAttachment handles GET /api/v2/attachments/:id.
func downloadAttachment(messages inbound.MessageService) echo.HandlerFunc {
	return func(c *echo.Context) error {
		actor, err := identity.ActorFrom(c.Request().Context())
		if err != nil {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		}

		attID, err := shared.ParseAttachmentID(c.Param("id"))
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid attachment id"})
		}

		state, rc, err := messages.OpenAttachment(c.Request().Context(), attID, actor)
		if err != nil {
			return attachmentErrorToHTTP(c, err)
		}

		defer func() { _ = rc.Close() }()

		safe := sanitizeFilename(state.Filename)
		encoded := url.PathEscape(safe)

		header := c.Response().Header()
		header.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, safe, encoded))
		header.Set("X-Content-Type-Options", "nosniff")
		// Blobs are immutable (keyed by attachment UUID); aggressive caching is safe.
		header.Set("Cache-Control", "private, max-age=31536000, immutable")

		http.ServeContent(c.Response(), c.Request(), state.Filename, time.Time{}, rc)

		return nil
	}
}
