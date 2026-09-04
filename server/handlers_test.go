package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"syscall"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type rejectingEnforcer struct{}

func (rejectingEnforcer) RequireLogin(_ echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error { return c.NoContent(http.StatusUnauthorized) }
}

func (rejectingEnforcer) SignInHandler(*echo.Context) error   { return nil }
func (rejectingEnforcer) SignOutHandler(*echo.Context) error  { return nil }
func (rejectingEnforcer) UserInfoHandler(*echo.Context) error { return nil }
func (rejectingEnforcer) CallbackHandler(*echo.Context) error { return nil }

func TestShutdownSignals(t *testing.T) {
	want := []os.Signal{os.Interrupt, syscall.SIGTERM}
	assert.Equal(t, want, shutdownSignals())
}

func TestAPIV2UsesFinalEnforcer(t *testing.T) {
	s, err := NewServer(
		WithApiV2(Stack{}),
		WithEnforcer(rejectingEnforcer{}),
	)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v2/health", nil)
	s.router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// The update prompt in the UI compares this response against its own compiled-in version
// to decide which changelog to link to, so an empty or malformed body silently sends users
// to the wrong release notes.
func TestBuildInfo(t *testing.T) {
	tests := []struct {
		name        string
		version     string
		sha         string
		wantVersion string
		wantSha     string
	}{
		{
			name:        "reports the injected build identity",
			version:     "v1.2.3",
			sha:         "abc1234",
			wantVersion: "v1.2.3",
			wantSha:     "abc1234",
		},
		{
			// A missing -ldflags leaves main.go's defaults in place. Serving them verbatim
			// is what makes a broken release build obvious instead of looking plausible.
			name:        "passes through unset build identity rather than inventing one",
			version:     "dev",
			sha:         "dev",
			wantVersion: "dev",
			wantSha:     "dev",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, err := newTestServer(WithVersion(tt.version, tt.sha))
			require.NoError(t, err)

			rec := httptest.NewRecorder()
			ctx := echo.New().
				NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil), rec)

			require.NoError(t, s.buildInfo(ctx))
			require.Equal(t, http.StatusOK, rec.Code)

			var got map[string]string
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))

			assert.Equal(t, tt.wantVersion, got["version"])
			assert.Equal(t, tt.wantSha, got["sha"])
		})
	}
}

// Without WithVersion the fields are the zero value, and the endpoint would answer with
// empty strings. Asserting it keeps that distinguishable from a real version.
func TestBuildInfoWithoutVersionOption(t *testing.T) {
	s, err := newTestServer()
	require.NoError(t, err)

	rec := httptest.NewRecorder()

	ctx := echo.New().
		NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil), rec)
	require.NoError(t, s.buildInfo(ctx))

	var got map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))

	assert.Contains(t, got, "version", "expected a version key even when unset, so clients can rely on the shape")
	assert.Contains(t, got, "sha", "expected a sha key even when unset, so clients can rely on the shape")
}

// Pre-26.9.0 clients call this removed endpoint from a stale cached bundle. Asserting the
// exact response guards against a regression back to the SPA fallback serving index.html,
// which is what a JSON-parsing old client chokes on.
func TestLegacyGraphQLGone(t *testing.T) {
	s, err := NewServer()
	require.NoError(t, err)

	for _, path := range []string{"/v1/graphql", "/v1/graphql/ws"} {
		t.Run(path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, path, nil)
			s.router.ServeHTTP(rec, req)

			require.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, `"cache", "storage", "executionContexts"`, rec.Header().Get("Clear-Site-Data"))
			assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))

			var got map[string]any
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
			assert.Contains(t, got, "errors")
		})
	}
}

// The static SPA fallback must still catch genuinely unknown paths; only the removed
// legacy endpoint gets the Clear-Site-Data treatment.
//
// Doesn't assert the SPA fallback's status code: CI runs this without a real UI build (see
// build.yaml's placeholder ui/build dir), so index.html is missing there and the static
// middleware answers 500, whereas a real build answers 200. Either way, this route isn't
// legacyGraphQLGone, which is the only thing worth asserting here.
func TestUnrelatedUnmatchedPathStillFallsBackToSPA(t *testing.T) {
	s, err := NewServer()
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/some/unknown/route", nil)
	s.router.ServeHTTP(rec, req)

	assert.Empty(t, rec.Header().Get("Clear-Site-Data"))
}

func newTestServer(opts ...Option) (*Server, error) {
	s := &Server{}
	for _, opt := range opts {
		if err := opt(s); err != nil {
			return nil, err
		}
	}

	return s, nil
}
