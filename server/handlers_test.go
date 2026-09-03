package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"syscall"
	"testing"

	"github.com/labstack/echo/v5"
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
	if got := shutdownSignals(); !slices.Equal(got, want) {
		t.Errorf("shutdown signals: got %v, want %v", got, want)
	}
}

func TestReadyRequiresListenerAndProjector(t *testing.T) {
	tests := []struct {
		name           string
		listening      bool
		projectorReady bool
		wantStatus     int
		wantReady      bool
	}{
		{name: "listener not bound", wantStatus: http.StatusServiceUnavailable},
		{name: "projector catching up", listening: true, wantStatus: http.StatusServiceUnavailable},
		{
			name:           "ready to serve",
			listening:      true,
			projectorReady: true,
			wantStatus:     http.StatusOK,
			wantReady:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{projectorReady: func() bool { return tt.projectorReady }}
			s.listening.Store(tt.listening)

			rec := httptest.NewRecorder()
			ctx := echo.New().NewContext(
				httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/ready", nil),
				rec,
			)

			if err := s.ready(ctx); err != nil {
				t.Fatalf("ready: %v", err)
			}

			if rec.Code != tt.wantStatus {
				t.Errorf("status: got %d, want %d", rec.Code, tt.wantStatus)
			}

			var response struct {
				Status         string `json:"status"`
				Listening      bool   `json:"listening"`
				ProjectorReady bool   `json:"projector_ready"`
				ShuttingDown   bool   `json:"shutting_down"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
				t.Fatalf("ready response: %v", err)
			}

			wantState := "unavailable"
			if tt.wantReady {
				wantState = "ready"
			}

			if response.Status != wantState || response.Listening != tt.listening ||
				response.ProjectorReady != tt.projectorReady || response.ShuttingDown {
				t.Errorf("ready response: got %+v", response)
			}
		})
	}
}

func TestAPIV2UsesFinalEnforcer(t *testing.T) {
	s := NewServer(
		WithApiV2(Stack{}),
		WithEnforcer(rejectingEnforcer{}),
	)
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v2/health", nil)
	s.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("API-v2 status: got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
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
			if err != nil {
				t.Fatalf("building server: %v", err)
			}

			rec := httptest.NewRecorder()
			ctx := echo.New().
				NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil), rec)

			if err := s.buildInfo(ctx); err != nil {
				t.Fatalf("buildInfo returned an error: %v", err)
			}

			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d", rec.Code)
			}

			var got map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatalf("response is not valid JSON: %v (body %q)", err, rec.Body.String())
			}

			if got["version"] != tt.wantVersion {
				t.Errorf("version: got %q, want %q", got["version"], tt.wantVersion)
			}

			if got["sha"] != tt.wantSha {
				t.Errorf("sha: got %q, want %q", got["sha"], tt.wantSha)
			}
		})
	}
}

// Without WithVersion the fields are the zero value, and the endpoint would answer with
// empty strings. Asserting it keeps that distinguishable from a real version.
func TestBuildInfoWithoutVersionOption(t *testing.T) {
	s, err := newTestServer()
	if err != nil {
		t.Fatalf("building server: %v", err)
	}

	rec := httptest.NewRecorder()

	ctx := echo.New().
		NewContext(httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil), rec)
	if err := s.buildInfo(ctx); err != nil {
		t.Fatalf("buildInfo returned an error: %v", err)
	}

	var got map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}

	if _, ok := got["version"]; !ok {
		t.Error("expected a version key even when unset, so clients can rely on the shape")
	}

	if _, ok := got["sha"]; !ok {
		t.Error("expected a sha key even when unset, so clients can rely on the shape")
	}
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
