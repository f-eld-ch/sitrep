package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
)

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
			ctx := echo.New().NewContext(httptest.NewRequest(http.MethodGet, "/version", nil), rec)

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
	ctx := echo.New().NewContext(httptest.NewRequest(http.MethodGet, "/version", nil), rec)
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
