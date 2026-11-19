package inmem_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tilestore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	base    = maptile.Tileset{Name: "base", Version: "v1"}
	imagery = maptile.Tileset{Name: "imagery", Version: "v2"}
)

func TestStore_UnknownTilesetIsNotAvailable(t *testing.T) {
	s := inmem.New()

	_, err := s.Info(t.Context(), base)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)

	_, err = s.Tile(t.Context(), base, maptile.Coord{Z: 1, X: 0, Y: 0})
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)
}

func TestStore_PutInfoAndTile(t *testing.T) {
	s := inmem.New()
	tj := maptile.TileJSON{Name: "Base map", Version: "1.0.0"}
	origin := maptile.Coord{Z: 2, X: 1, Y: 3}

	s.Put(base, "etag-1", tj, map[maptile.Coord][]byte{origin: []byte("tile-bytes")})

	info, err := s.Info(t.Context(), base)
	require.NoError(t, err)
	assert.Equal(t, "etag-1", info.ETag)
	assert.Equal(t, tj, info.TileJSON)

	data, err := s.Tile(t.Context(), base, origin)
	require.NoError(t, err)
	assert.Equal(t, []byte("tile-bytes"), data)

	_, err = s.Tile(t.Context(), base, maptile.Coord{Z: 2, X: 1, Y: 4})
	require.ErrorIs(t, err, maptile.ErrTileNotFound, "a known archive without that tile")

	_, err = s.Info(t.Context(), imagery)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable, "archives are per tileset")
}

func TestStore_PutReplacesTheArchive(t *testing.T) {
	s := inmem.New()
	origin := maptile.Coord{Z: 0, X: 0, Y: 0}

	s.Put(base, "old", maptile.TileJSON{}, map[maptile.Coord][]byte{origin: []byte("old")})
	s.Put(base, "new", maptile.TileJSON{}, map[maptile.Coord][]byte{})

	info, err := s.Info(t.Context(), base)
	require.NoError(t, err)
	assert.Equal(t, "new", info.ETag)

	_, err = s.Tile(t.Context(), base, origin)
	require.ErrorIs(t, err, maptile.ErrTileNotFound, "the old tiles are gone")
}

func TestStore_RemoveMakesTheTilesetUnavailable(t *testing.T) {
	s := inmem.New()
	origin := maptile.Coord{Z: 0, X: 0, Y: 0}

	s.Put(base, "e", maptile.TileJSON{}, map[maptile.Coord][]byte{origin: []byte("x")})
	s.Put(imagery, "e", maptile.TileJSON{}, map[maptile.Coord][]byte{origin: []byte("y")})

	s.Remove(base)

	_, err := s.Info(t.Context(), base)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)

	_, err = s.Tile(t.Context(), base, origin)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)

	_, err = s.Tile(t.Context(), imagery, origin)
	require.NoError(t, err, "other tilesets are untouched")

	assert.NotPanics(t, func() { s.Remove(base) }, "removing an absent tileset is fine")
}

func TestStore_RefreshChangesNothing(t *testing.T) {
	s := inmem.New()
	origin := maptile.Coord{Z: 0, X: 0, Y: 0}

	s.Put(base, "e", maptile.TileJSON{}, map[maptile.Coord][]byte{origin: []byte("x")})
	s.Refresh(t.Context())

	data, err := s.Tile(t.Context(), base, origin)
	require.NoError(t, err)
	assert.Equal(t, []byte("x"), data, "an in-memory store is always current")
}
