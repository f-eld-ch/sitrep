package service

import (
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
