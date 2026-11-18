package swisstopo

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
)

var ts = maptile.Tileset{Name: "ch.swisstopo.base.vt", Version: "v1.0.0"}

const payload = "0123456789abcdefghij" // 20 bytes

// fakeS3 serves an archive with an ETag, Range and If-Range support, like swisstopo's CDN.
func fakeS3(t *testing.T, etag *string, honourRange bool) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/tiles/ch.swisstopo.base.vt/v1.0.0/ch.swisstopo.base.vt.mbtiles" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("ETag", *etag)
		w.Header().Set("Last-Modified", "Mon, 08 Jun 2026 15:32:04 GMT")

		rng := r.Header.Get("Range")
		if honourRange && rng != "" && (r.Header.Get("If-Range") == "" || r.Header.Get("If-Range") == *etag) {
			var start int

			_, _ = fmt.Sscanf(rng, "bytes=%d-", &start)
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, len(payload)-1, len(payload)))
			w.Header().Set("Content-Length", strconv.Itoa(len(payload)-start))
			w.WriteHeader(http.StatusPartialContent)

			if r.Method != http.MethodHead {
				_, _ = io.WriteString(w, payload[start:])
			}

			return
		}

		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))

		if r.Method != http.MethodHead {
			_, _ = io.WriteString(w, payload)
		}
	}))
}

func TestClient_Head(t *testing.T) {
	etag := `"abc-12"`
	srv := fakeS3(t, &etag, true)
	t.Cleanup(srv.Close)

	info, err := New(WithBaseURL(srv.URL)).Head(t.Context(), ts)
	require.NoError(t, err)

	assert.Equal(t, `"abc-12"`, info.ETag)
	assert.EqualValues(t, len(payload), info.Size)
	assert.Equal(t, 2026, info.LastModified.Year())
}

func TestClient_Head_Errors(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	t.Cleanup(srv.Close)

	_, err := New(WithBaseURL(srv.URL)).Head(t.Context(), ts)
	require.ErrorContains(t, err, "404")
}

func TestClient_Fetch_Full(t *testing.T) {
	etag := `"v1"`
	srv := fakeS3(t, &etag, true)
	t.Cleanup(srv.Close)

	f, err := New(WithBaseURL(srv.URL)).Fetch(t.Context(), ts, 0, "")
	require.NoError(t, err)

	defer func() { _ = f.Body.Close() }()

	body, err := io.ReadAll(f.Body)
	require.NoError(t, err)

	assert.False(t, f.Resumed)
	assert.Equal(t, payload, string(body))
	assert.Equal(t, `"v1"`, f.ETag)
	assert.EqualValues(t, len(payload), f.Size)
}

func TestClient_Fetch_Resumes(t *testing.T) {
	etag := `"v1"`
	srv := fakeS3(t, &etag, true)
	t.Cleanup(srv.Close)

	f, err := New(WithBaseURL(srv.URL)).Fetch(t.Context(), ts, 8, `"v1"`)
	require.NoError(t, err)

	defer func() { _ = f.Body.Close() }()

	body, err := io.ReadAll(f.Body)
	require.NoError(t, err)

	assert.True(t, f.Resumed)
	assert.Equal(t, payload[8:], string(body))
	assert.EqualValues(t, len(payload), f.Size, "total size from Content-Range, not the partial length")
}

func TestClient_Fetch_ChangedUpstreamSendsWholeFile(t *testing.T) {
	etag := `"v2"` // the part we hold is v1
	srv := fakeS3(t, &etag, true)
	t.Cleanup(srv.Close)

	f, err := New(WithBaseURL(srv.URL)).Fetch(t.Context(), ts, 8, `"v1"`)
	require.NoError(t, err)

	defer func() { _ = f.Body.Close() }()

	body, err := io.ReadAll(f.Body)
	require.NoError(t, err)

	assert.False(t, f.Resumed, "If-Range mismatch must not resume")
	assert.Equal(t, payload, string(body))
	assert.Equal(t, `"v2"`, f.ETag)
}

func TestClient_Fetch_ServerWithoutRangeSupport(t *testing.T) {
	etag := `"v1"`
	srv := fakeS3(t, &etag, false)
	t.Cleanup(srv.Close)

	f, err := New(WithBaseURL(srv.URL)).Fetch(t.Context(), ts, 8, `"v1"`)
	require.NoError(t, err)

	defer func() { _ = f.Body.Close() }()

	body, _ := io.ReadAll(f.Body)
	assert.False(t, f.Resumed)
	assert.Equal(t, payload, string(body))
}

func TestClient_Fetch_StalledDownloadIsAborted(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Content-Length", "100")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "abc")
		w.(http.Flusher).Flush()
		<-r.Context().Done() // never sends the rest
	}))
	t.Cleanup(srv.Close)

	c := New(WithBaseURL(srv.URL))

	f, err := c.Fetch(t.Context(), ts, 0, "")
	require.NoError(t, err)

	// Replace the production idle timeout by a short one.
	f.Body.(*idleBody).idle = 100 * time.Millisecond
	f.Body.(*idleBody).timer.Reset(100 * time.Millisecond)

	_, err = io.ReadAll(f.Body)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "stalled")
}

func TestParseContentRange(t *testing.T) {
	s, total, ok := parseContentRange("bytes 100-999/1000")
	assert.True(t, ok)
	assert.EqualValues(t, 100, s)
	assert.EqualValues(t, 1000, total)

	_, _, ok = parseContentRange("bytes */1000")
	assert.False(t, ok)
	_, _, ok = parseContentRange("garbage")
	assert.False(t, ok)
}

// countingServer counts the requests it receives.
func countingServer(t *testing.T, h http.HandlerFunc) (*httptest.Server, *atomic.Int32) {
	t.Helper()

	var n atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		h(w, r)
	}))
	t.Cleanup(srv.Close)

	return srv, &n
}

func TestClient_OnlyKnownTilesetsReachTheRemote(t *testing.T) {
	srv, hits := countingServer(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	c := New(WithBaseURL(srv.URL))

	for _, bad := range []maptile.Tileset{
		{Name: "../../admin", Version: "v1.0.0"},
		{Name: "ch.swisstopo.base.vt", Version: "v1.0.0/../../secret"},
		{Name: "ch.swisstopo.base.vt?x=1", Version: "v1.0.0"},
		{Name: "other.vt", Version: "v1"},
		{},
	} {
		_, err := c.Head(t.Context(), bad)
		require.ErrorIs(t, err, maptile.ErrUnknownTileset, "Head %+v", bad)

		_, err = c.Fetch(t.Context(), bad, 0, "")
		require.ErrorIs(t, err, maptile.ErrUnknownTileset, "Fetch %+v", bad)
	}

	assert.Zero(t, hits.Load(), "an invalid tileset must not cause any request")
}

func TestClient_RefusesRedirectsToAnotherHost(t *testing.T) {
	other, otherHits := countingServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("ETag", `"evil"`)
		w.Header().Set("Content-Length", "4")
		_, _ = io.WriteString(w, "evil")
	})

	srv, _ := countingServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/anything", http.StatusFound)
	})

	c := New(WithBaseURL(srv.URL))

	_, err := c.Head(t.Context(), ts)
	require.ErrorContains(t, err, "refusing redirect")

	_, err = c.Fetch(t.Context(), ts, 0, "")
	require.ErrorContains(t, err, "refusing redirect")

	assert.Zero(t, otherHits.Load(), "the other host must never be contacted")
}

func TestClient_RedirectLoopIsStopped(t *testing.T) {
	srv, hits := countingServer(t, nil)
	srv.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Redirect(w, r, "/loop", http.StatusFound) // same host, forever
	})

	_, err := New(WithBaseURL(srv.URL)).Head(t.Context(), ts)
	require.ErrorContains(t, err, "redirects")
	assert.LessOrEqual(t, hits.Load(), int32(maxRedirects+2))
}
