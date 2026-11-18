package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tilestore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
)

var tileTestSet = maptile.Tileset{Name: "ch.swisstopo.base.vt", Version: "v1.0.0"}

func newTileService(t *testing.T) (*TileService, *inmem.Store) {
	t.Helper()

	store := inmem.New()

	return NewTileService(store), store
}

func TestTileService_TileJSON_UpstreamWithoutArchive(t *testing.T) {
	svc, _ := newTileService(t)

	got, err := svc.TileJSON(t.Context(), tileTestSet, "https://sitrep.example/api/v2/tiles")
	require.NoError(t, err)

	assert.False(t, got.Local)
	assert.Equal(
		t,
		[]string{"https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf"},
		got.TileJSON.Tiles,
	)
	assert.Equal(t, maptile.Attribution, got.TileJSON.Attribution)
	assert.Equal(t, "xyz", got.TileJSON.Scheme)
}

func TestTileService_TileJSON_LocalOverridesSchemeAndAttribution(t *testing.T) {
	svc, store := newTileService(t)
	store.Put(
		tileTestSet,
		`"e1"`,
		maptile.TileJSON{Name: "Basiskarte", Scheme: "tms", Attribution: "© swisstopo", MaxZoom: 14},
		nil,
	)

	got, err := svc.TileJSON(t.Context(), tileTestSet, "https://sitrep.example/api/v2/tiles/")
	require.NoError(t, err)

	assert.True(t, got.Local)
	assert.Equal(
		t,
		[]string{"https://sitrep.example/api/v2/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf"},
		got.TileJSON.Tiles,
	)
	assert.Equal(t, "xyz", got.TileJSON.Scheme, "the metadata says tms but we serve xyz")
	assert.Equal(t, maptile.Attribution, got.TileJSON.Attribution, "full source reference, not just © swisstopo")
	assert.Equal(t, 14, got.TileJSON.MaxZoom)
}

func TestTileService_Tile(t *testing.T) {
	svc, store := newTileService(t)
	c := maptile.Coord{Z: 3, X: 2, Y: 1}

	t.Run("no archive redirects upstream with the coordinate filled in", func(t *testing.T) {
		got, err := svc.Tile(t.Context(), tileTestSet, c)
		require.NoError(t, err)

		assert.True(t, got.Redirect)
		assert.Equal(t, "https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/3/2/1.pbf", got.RedirectURL)
	})

	store.Put(tileTestSet, `"e1"`, maptile.TileJSON{}, map[maptile.Coord][]byte{c: []byte("pbf")})

	t.Run("local tile", func(t *testing.T) {
		got, err := svc.Tile(t.Context(), tileTestSet, c)
		require.NoError(t, err)

		assert.False(t, got.Redirect)
		assert.False(t, got.Empty)
		assert.Equal(t, []byte("pbf"), got.Data)
		assert.Equal(t, `"e1"`, got.ETag)
	})

	t.Run("missing tile in a local archive is empty, not a redirect", func(t *testing.T) {
		got, err := svc.Tile(t.Context(), tileTestSet, maptile.Coord{Z: 3, X: 0, Y: 0})
		require.NoError(t, err)

		assert.True(t, got.Empty)
		assert.False(t, got.Redirect)
	})
}

func TestTileService_ETag(t *testing.T) {
	svc, store := newTileService(t)
	assert.Empty(t, svc.ETag(t.Context(), tileTestSet))

	store.Put(tileTestSet, `"e7"`, maptile.TileJSON{}, nil)
	assert.Equal(t, `"e7"`, svc.ETag(t.Context(), tileTestSet))
}

// The redirect URL is built from the tileset and coordinate; invalid ones must never produce one.
func TestTileService_RejectsUnknownTilesetsAndCoordinates(t *testing.T) {
	svc, _ := newTileService(t)

	evil := maptile.Tileset{Name: "ch.swisstopo.base.vt/../../x", Version: "v1.0.0"}

	_, err := svc.Tile(t.Context(), evil, maptile.Coord{Z: 1, X: 0, Y: 0})
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	_, err = svc.TileJSON(t.Context(), evil, "https://x/api/v2/tiles")
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	got, err := svc.Tile(t.Context(), tileTestSet, maptile.Coord{Z: 2, X: 99, Y: 0})
	require.ErrorIs(t, err, maptile.ErrInvalidCoord)
	assert.False(t, got.Redirect)
	assert.Empty(t, got.RedirectURL)
}

func TestTileService_RedirectAlwaysTargetsTheSwisstopoHost(t *testing.T) {
	svc, _ := newTileService(t)

	for _, ts := range maptile.Supported {
		got, err := svc.Tile(t.Context(), ts, maptile.Coord{Z: 14, X: 8561, Y: 10668})
		require.NoError(t, err)
		assert.Regexp(
			t,
			`^https://vectortiles\.geo\.admin\.ch/tiles/[a-z.]+/v1\.0\.0/14/8561/10668\.pbf$`,
			got.RedirectURL,
		)
	}
}

func TestTileService_LocalStatus(t *testing.T) {
	svc, store := newTileService(t)
	store.Put(maptile.Supported[0], `"e1"`, maptile.TileJSON{}, nil)

	got := svc.LocalStatus(t.Context())
	require.Len(t, got, 2)

	assert.True(t, got[0].Ready)
	require.NoError(t, got[0].Err)

	assert.False(t, got[1].Ready, "no archive for relief: served from swisstopo")
	require.NoError(t, got[1].Err, "a missing archive is not an error")
}

func TestTileService_RefreshDelegatesToTheStore(t *testing.T) {
	svc, _ := newTileService(t)
	svc.Refresh(t.Context()) // must not panic; the in-memory store is always current
}

// failingStore fails every read with err.
type failingStore struct {
	inmem.Store
	err error
}

func (f *failingStore) Tile(context.Context, maptile.Tileset, maptile.Coord) ([]byte, error) {
	return nil, f.err
}

func TestTileService_ClientAbortIsNotLogged(t *testing.T) {
	var logs bytes.Buffer

	old := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	_, err := NewTileService(&failingStore{err: fmt.Errorf("read tile: %w", context.Canceled)}).
		Tile(t.Context(), tileTestSet, maptile.Coord{Z: 1, X: 0, Y: 0})
	require.ErrorIs(t, err, context.Canceled, "the caller still sees the error")
	assert.Empty(t, logs.String())

	// A real failure is still logged.
	_, err = NewTileService(&failingStore{err: errors.New("disk on fire")}).
		Tile(t.Context(), tileTestSet, maptile.Coord{Z: 1, X: 0, Y: 0})
	require.Error(t, err)
	assert.Contains(t, logs.String(), "disk on fire")
}
