package swisstopo

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClient_Head_RejectsAResponseWithoutETagOrSize(t *testing.T) {
	tests := map[string]http.HandlerFunc{
		"no etag": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Length", "10")
			_, _ = io.WriteString(w, payload[:10])
		},
		"no size": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("ETag", `"x"`)
		},
	}

	for name, h := range tests {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(h)
			t.Cleanup(srv.Close)

			_, err := New(WithBaseURL(srv.URL)).Head(t.Context(), ts)

			require.ErrorContains(t, err, "has no ETag or size")
		})
	}
}

func TestClient_UnreachableHost(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL

	srv.Close()

	_, err := New(WithBaseURL(url)).Head(t.Context(), ts)
	require.Error(t, err)

	_, err = New(WithBaseURL(url)).Fetch(t.Context(), ts, 0, "")
	require.Error(t, err)
}

func TestClient_Fetch_Errors(t *testing.T) {
	tests := []struct {
		name    string
		offset  int64
		handler http.HandlerFunc
		wantErr string
	}{
		{
			name:    "unexpected status",
			handler: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusForbidden) },
			wantErr: "unexpected status 403",
		},
		{
			name:   "partial content for another offset",
			offset: 5,
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("ETag", `"x"`)
				w.Header().Set("Content-Range", "bytes 0-19/20")
				w.WriteHeader(http.StatusPartialContent)
			},
			wantErr: "unexpected Content-Range",
		},
		{
			name:   "partial content without a Content-Range",
			offset: 5,
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("ETag", `"x"`)
				w.WriteHeader(http.StatusPartialContent)
			},
			wantErr: "unexpected Content-Range",
		},
		{
			name: "no etag",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				_, _ = io.WriteString(w, payload)
			},
			wantErr: "has no ETag or size",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(tt.handler)
			t.Cleanup(srv.Close)

			fetch, err := New(WithBaseURL(srv.URL)).Fetch(t.Context(), ts, tt.offset, `"x"`)

			require.ErrorContains(t, err, tt.wantErr)
			assert.Nil(t, fetch.Body)
		})
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestClient_WithHTTPClientIsUsed(t *testing.T) {
	etag := `"abc-12"`
	srv := fakeS3(t, &etag, true)
	t.Cleanup(srv.Close)

	var used atomic.Int32

	custom := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		used.Add(1)

		return http.DefaultTransport.RoundTrip(r)
	})}

	info, err := New(WithBaseURL(srv.URL+"/"), WithHTTPClient(custom)).Head(t.Context(), ts)

	require.NoError(t, err)
	assert.Equal(t, etag, info.ETag, "a trailing slash on the base URL is ignored")
	assert.EqualValues(t, 1, used.Load())
}
