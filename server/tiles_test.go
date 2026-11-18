package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tilestore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

const tileBase = "/api/v2/tiles/ch.swisstopo.base.vt/v1.0.0"

var baseSet = maptile.Tileset{Name: "ch.swisstopo.base.vt", Version: "v1.0.0"}

func tileServer(t *testing.T, store *inmem.Store) *Server {
	t.Helper()

	srv, err := NewServer(WithApiV2(Stack{Tiles: service.NewTileService(store)}))
	require.NoError(t, err)

	return srv
}

func get(t *testing.T, srv *Server, path string, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil)
	// A peer on a private network, like an ingress controller in the cluster.
	req.RemoteAddr = "10.1.2.3:41000"

	for k, v := range hdr {
		req.Header.Set(k, v)
	}

	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)

	return rec
}

func TestTiles_TileJSON_UpstreamWithoutArchive(t *testing.T) {
	srv := tileServer(t, inmem.New())

	rec := get(t, srv, tileBase+"/tiles.json", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "private, no-cache", rec.Header().Get("Cache-Control"))

	var tj tileJSONResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &tj))
	assert.Equal(
		t,
		[]string{"https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf"},
		tj.Tiles,
	)
	assert.Equal(t, "xyz", tj.Scheme)
	assert.Equal(t, maptile.Attribution, tj.Attribution)
}

func TestTiles_TileJSON_LocalUsesAbsoluteURLFromForwardedHeaders(t *testing.T) {
	store := inmem.New()
	store.Put(baseSet, `"e1"`, maptile.TileJSON{Name: "Basiskarte", MaxZoom: 14}, nil)
	srv := tileServer(t, store)

	rec := get(t, srv, tileBase+"/tiles.json", map[string]string{"X-Forwarded-Proto": "https"})
	require.Equal(t, http.StatusOK, rec.Code)

	var tj tileJSONResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &tj))
	assert.Equal(t, []string{"https://example.com/api/v2/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf"}, tj.Tiles)
}

func TestTiles_Tile(t *testing.T) {
	store := inmem.New()
	gz := []byte{0x1f, 0x8b, 0x08, 0x00, 0x01}
	store.Put(baseSet, `"e1"`, maptile.TileJSON{}, map[maptile.Coord][]byte{{Z: 3, X: 2, Y: 1}: gz})
	srv := tileServer(t, store)

	t.Run("gzip tile is sent as is, with caching headers", func(t *testing.T) {
		rec := get(t, srv, tileBase+"/3/2/1.pbf", nil)
		require.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "application/x-protobuf", rec.Header().Get("Content-Type"))
		assert.Equal(t, "gzip", rec.Header().Get("Content-Encoding"))
		assert.Equal(t, "private, max-age=86400", rec.Header().Get("Cache-Control"))
		assert.Equal(t, `"e1-3-2-1"`, rec.Header().Get("ETag"))
		assert.Equal(t, gz, rec.Body.Bytes())
	})

	t.Run("matching If-None-Match gives 304", func(t *testing.T) {
		rec := get(t, srv, tileBase+"/3/2/1.pbf", map[string]string{"If-None-Match": `"e1-3-2-1"`})
		assert.Equal(t, http.StatusNotModified, rec.Code)
		assert.Equal(t, "private, max-age=86400", rec.Header().Get("Cache-Control"))
	})

	t.Run("missing tile is 204", func(t *testing.T) {
		rec := get(t, srv, tileBase+"/3/0/0.pbf", nil)
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("unknown tileset is 404 JSON, not the HTML fallback", func(t *testing.T) {
		rec := get(t, srv, "/api/v2/tiles/org.openmaptiles.vt/v1.0.0/3/2/1.pbf", nil)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Contains(t, rec.Header().Get("Content-Type"), "application/json")
	})

	t.Run("bad coordinates are 400", func(t *testing.T) {
		assert.Equal(t, http.StatusBadRequest, get(t, srv, tileBase+"/3/9/1.pbf", nil).Code)
		assert.Equal(t, http.StatusBadRequest, get(t, srv, tileBase+"/x/2/1.pbf", nil).Code)
		assert.Equal(t, http.StatusNotFound, get(t, srv, tileBase+"/3/2/1.png", nil).Code)
	})
}

func TestTiles_RedirectsUpstreamWithoutArchive(t *testing.T) {
	srv := tileServer(t, inmem.New())

	rec := get(t, srv, tileBase+"/3/2/1.pbf", nil)
	require.Equal(t, http.StatusFound, rec.Code)
	assert.Equal(
		t,
		"https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/3/2/1.pbf",
		rec.Header().Get("Location"),
	)
	assert.Equal(
		t,
		"no-store",
		rec.Header().Get("Cache-Control"),
		"a cached redirect would pin the browser to upstream",
	)
}

func TestTiles_DisabledWhenNoService(t *testing.T) {
	srv, err := NewServer(WithApiV2(Stack{}))
	require.NoError(t, err)

	// The tile routes are not registered at all. (Do not assert on the response:
	// it depends on whether a UI build is embedded, which CI does not have.)
	for _, r := range srv.router.Router().Routes() {
		assert.NotContains(t, r.Path, "/tiles/")
	}
}

func TestTiles_TileJSON_IgnoresForwardedProtoFromPublicPeer(t *testing.T) {
	store := inmem.New()
	store.Put(baseSet, `"e1"`, maptile.TileJSON{}, nil)
	srv := tileServer(t, store)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tileBase+"/tiles.json", nil)
	req.RemoteAddr = "203.0.113.9:41000" // public address: forwarding headers must not be trusted
	req.Header.Set("X-Forwarded-Proto", "https")

	rec := httptest.NewRecorder()
	srv.router.ServeHTTP(rec, req)

	var tj tileJSONResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &tj))
	assert.Equal(t, "http://example.com/api/v2/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf", tj.Tiles[0])
}

// cancelledTiles is a TileService whose reads fail because the client went away.
type cancelledTiles struct{ inbound.TileService }

func (cancelledTiles) ETag(context.Context, maptile.Tileset) string { return "" }

func (cancelledTiles) Tile(context.Context, maptile.Tileset, maptile.Coord) (inbound.TileState, error) {
	return inbound.TileState{}, fmt.Errorf("read tile: %w", context.Canceled)
}

func TestTiles_ClientAbortIsNotAnError(t *testing.T) {
	var logs bytes.Buffer

	old := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	srv, err := NewServer(WithApiV2(Stack{Tiles: cancelledTiles{}}))
	require.NoError(t, err)

	rec := get(t, srv, tileBase+"/3/2/1.pbf", nil)

	assert.Equal(t, statusClientClosedRequest, rec.Code, "not a 500")
	assert.Empty(t, logs.String(), "an aborted request must not be logged as an error")
}
