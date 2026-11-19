package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/server/auth"
)

func TestWithPortAndAddress(t *testing.T) {
	s, err := NewServer(WithAddress("127.0.0.1"), WithPort(9123))
	require.NoError(t, err)

	assert.Equal(t, "127.0.0.1:9123", s.Addr)
}

func TestDefaultListenAddress(t *testing.T) {
	s, err := NewServer()
	require.NoError(t, err)

	assert.Equal(t, ":8081", s.Addr)
}

func TestAllowedOriginsControlCORS(t *testing.T) {
	get := func(s *Server, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/health", nil)
		req.Header.Set("Origin", origin)

		rec := httptest.NewRecorder()
		s.router.ServeHTTP(rec, req)

		return rec
	}

	t.Run("no origins configured: same-origin only", func(t *testing.T) {
		s, err := NewServer()
		require.NoError(t, err)

		assert.Empty(t, get(s, "https://evil.example").Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("configured origin is allowed, others are not", func(t *testing.T) {
		s, err := NewServer(WithAllowedOrigins([]string{"https://app.example"}))
		require.NoError(t, err)

		assert.Equal(
			t,
			"https://app.example",
			get(s, "https://app.example").Header().Get("Access-Control-Allow-Origin"),
		)
		assert.Empty(t, get(s, "https://evil.example").Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestWithOidcSetsEnforcer(t *testing.T) {
	client := &auth.OIDCClient{}

	s, err := NewServer(WithOidc(client))
	require.NoError(t, err)

	assert.Same(t, client, s.Enforcer)
}

func TestReadyIsUnavailableWhileShuttingDown(t *testing.T) {
	s, err := NewServer()
	require.NoError(t, err)

	s.isShuttingDown.Store(true)

	rec := httptest.NewRecorder()
	s.router.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/ready", nil))

	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
	assert.JSONEq(t, `{"status":"unavailable"}`, rec.Body.String())
}

func TestCacheControlMiddleware(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		status int
		want   string
	}{
		{"hashed assets are immutable", "/assets/app.js", http.StatusOK, "public, max-age=31536000, immutable"},
		{"map files cache for a week", "/map/x.pmtiles", http.StatusOK, "public, max-age=604800"},
		{"attachments are never cached", "/api/v2/attachments/1", http.StatusOK, "no-store"},
		{"other pages are never cached", "/index.html", http.StatusOK, "no-store"},
		{"missing assets are not cached as immutable", "/assets/missing.js", http.StatusNotFound, "no-store"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := echo.New()
			e.Use(cacheControlMiddleWare)
			e.GET("/*", func(c *echo.Context) error { return c.String(tt.status, "x") })

			rec := httptest.NewRecorder()
			e.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, tt.path, nil))

			assert.Equal(t, tt.want, rec.Header().Get("Cache-Control"))
		})
	}
}

func TestLogAndPresentError(t *testing.T) {
	ctx := graphql.WithOperationContext(context.Background(), &graphql.OperationContext{OperationName: "Op"})

	tests := []struct {
		name     string
		err      error
		wantCode string
		wantMsg  string
	}{
		{"not found", shared.ErrNotFound, "NOT_FOUND", ""},
		{"not open", shared.ErrIncidentNotOpen, "INCIDENT_NOT_OPEN", ""},
		{"not closed", shared.ErrIncidentNotClosed, "INCIDENT_NOT_CLOSED", ""},
		{"deleted", shared.ErrIncidentDeleted, "INCIDENT_DELETED", ""},
		{"already closed", shared.ErrAlreadyClosed, "ALREADY_CLOSED", ""},
		{"already open", shared.ErrAlreadyOpen, "ALREADY_OPEN", ""},
		{"forbidden", shared.ErrForbidden, "FORBIDDEN", ""},
		{"invalid input", shared.ErrInvalidInput, "INVALID_INPUT", ""},
		{"invalid parent", shared.ErrInvalidParent, "INVALID_PARENT_INCIDENT", ""},
		{"merged schadenplatz", shared.ErrSchadenplatzMerged, "SCHADENPLATZ_MERGED", ""},
		{"conflict", shared.ErrConflict, "CONFLICT", ""},
		{"timeline", shared.ErrMessageTimeLocked, "MESSAGE_TIME_LOCKED", ""},
		{"wrapped domain error", fmt.Errorf("ctx: %w", shared.ErrNotFound), "NOT_FOUND", ""},
		{
			"unexpected errors are hidden", errors.New("pq: password authentication failed"),
			"INTERNAL_ERROR", "internal server error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := logAndPresentError(ctx, tt.err)

			require.NotNil(t, got)
			assert.Equal(t, tt.wantCode, got.Extensions["code"])

			if tt.wantMsg != "" {
				assert.Equal(t, tt.wantMsg, got.Message)
			}
		})
	}

	t.Run("introspection disabled passes through", func(t *testing.T) {
		in := &gqlerror.Error{Message: "introspection disabled"}
		assert.Same(t, in, logAndPresentError(ctx, in))
	})
}
