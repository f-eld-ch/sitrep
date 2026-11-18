package mbtiles

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var testSet = maptile.Tileset{Name: "ch.swisstopo.base.vt", Version: "v1.0.0"}

// writeArchive creates an MBTiles file with the dedup layout swisstopo publishes
// (map + images joined by a tiles view). tiles maps "z/x/tmsRow" to payload.
func writeArchive(t *testing.T, path string, tiles map[[3]int]string, name string) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))

	tmp := path + ".new"
	db, err := sql.Open("sqlite", tmp)
	require.NoError(t, err)

	stmts := []string{
		`CREATE TABLE metadata (name text, value text)`,
		`CREATE TABLE map (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_id TEXT)`,
		`CREATE TABLE images (tile_data blob, tile_id text)`,
		`CREATE UNIQUE INDEX map_index ON map (zoom_level, tile_column, tile_row)`,
		`CREATE UNIQUE INDEX images_id ON images (tile_id)`,
		`CREATE VIEW tiles AS SELECT map.zoom_level AS zoom_level, map.tile_column AS tile_column,
			map.tile_row AS tile_row, images.tile_data AS tile_data FROM map JOIN images ON images.tile_id = map.tile_id`,
	}
	for _, s := range stmts {
		_, err = db.ExecContext(t.Context(), s)
		require.NoError(t, err)
	}

	meta := map[string]string{
		"name": name, "version": "v1.0.0", "format": "pbf", "scheme": "tms",
		"minzoom": "0", "maxzoom": "14", "bounds": "3.57,44.18,13.66,48.88", "center": "8.6,46.5,7",
		"json": `{"vector_layers":[{"id":"water"}]}`,
	}
	for k, v := range meta {
		_, err = db.ExecContext(t.Context(), `INSERT INTO metadata VALUES (?, ?)`, k, v)
		require.NoError(t, err)
	}

	i := 0
	for k, payload := range tiles {
		id := string(rune('a' + i))
		i++
		_, err = db.ExecContext(t.Context(), `INSERT INTO images VALUES (?, ?)`, []byte(payload), id)
		require.NoError(t, err)
		_, err = db.ExecContext(t.Context(), `INSERT INTO map VALUES (?, ?, ?, ?)`, k[0], k[1], k[2], id)
		require.NoError(t, err)
	}

	require.NoError(t, db.Close())
	require.NoError(t, os.Rename(tmp, path))
}

func TestStore_NotAvailableWithoutFile(t *testing.T) {
	s := New(t.TempDir())
	t.Cleanup(func() { _ = s.Close() })

	_, err := s.Info(t.Context(), testSet)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)

	_, err = s.Tile(t.Context(), testSet, maptile.Coord{Z: 1, X: 0, Y: 0})
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)
}

func TestStore_TileFlipsYAndReportsMissing(t *testing.T) {
	s := New(t.TempDir())
	t.Cleanup(func() { _ = s.Close() })

	// XYZ 3/2/1 is TMS row 2^3-1-1 = 6.
	writeArchive(t, s.Path(testSet), map[[3]int]string{{3, 2, 6}: "tile-3-2-1"}, "Basiskarte_v1.0.0")

	got, err := s.Tile(t.Context(), testSet, maptile.Coord{Z: 3, X: 2, Y: 1})
	require.NoError(t, err)
	assert.Equal(t, "tile-3-2-1", string(got))

	_, err = s.Tile(t.Context(), testSet, maptile.Coord{Z: 3, X: 2, Y: 2})
	require.ErrorIs(t, err, maptile.ErrTileNotFound)
}

func TestStore_InfoReadsMetadata(t *testing.T) {
	s := New(t.TempDir())
	t.Cleanup(func() { _ = s.Close() })

	writeArchive(t, s.Path(testSet), map[[3]int]string{{0, 0, 0}: "x"}, "Basiskarte_v1.0.0")

	info, err := s.Info(t.Context(), testSet)
	require.NoError(t, err)

	assert.NotEmpty(t, info.ETag)
	assert.Equal(t, "Basiskarte_v1.0.0", info.TileJSON.Name)
	assert.Equal(t, 14, info.TileJSON.MaxZoom)
	assert.Equal(t, []float64{3.57, 44.18, 13.66, 48.88}, info.TileJSON.Bounds)
	assert.JSONEq(t, `[{"id":"water"}]`, string(info.TileJSON.VectorLayers))
}

func TestStore_PicksUpReplacedFile(t *testing.T) {
	s := New(t.TempDir())
	s.statEvery = 0

	t.Cleanup(func() { _ = s.Close() })

	path := s.Path(testSet)
	writeArchive(t, path, map[[3]int]string{{0, 0, 0}: "old"}, "old")

	before, err := s.Info(t.Context(), testSet)
	require.NoError(t, err)

	// Replace by rename (new inode), as the downloader does.
	writeArchive(t, path, map[[3]int]string{{0, 0, 0}: "new-and-longer"}, "new")

	got, err := s.Tile(t.Context(), testSet, maptile.Coord{Z: 0, X: 0, Y: 0})
	require.NoError(t, err)
	assert.Equal(t, "new-and-longer", string(got))

	after, err := s.Info(t.Context(), testSet)
	require.NoError(t, err)
	assert.NotEqual(t, before.ETag, after.ETag)
	assert.Equal(t, "new", after.TileJSON.Name)
}

func TestStore_BecomesUnavailableWhenFileRemoved(t *testing.T) {
	s := New(t.TempDir())
	s.statEvery = 0

	t.Cleanup(func() { _ = s.Close() })

	writeArchive(t, s.Path(testSet), map[[3]int]string{{0, 0, 0}: "x"}, "n")
	_, err := s.Info(t.Context(), testSet)
	require.NoError(t, err)

	require.NoError(t, os.Remove(s.Path(testSet)))

	_, err = s.Info(t.Context(), testSet)
	require.ErrorIs(t, err, outbound.ErrTilesetNotAvailable)
}

func TestStore_ConcurrentReadsAcrossSwap(t *testing.T) {
	s := New(t.TempDir())
	s.statEvery = 0

	t.Cleanup(func() { _ = s.Close() })

	path := s.Path(testSet)
	writeArchive(t, path, map[[3]int]string{{0, 0, 0}: "v1"}, "n")

	done := make(chan struct{})
	errs := make(chan error, 8)

	for range 8 {
		go func() {
			for {
				select {
				case <-done:
					errs <- nil
					return
				default:
				}

				if _, err := s.Tile(t.Context(), testSet, maptile.Coord{Z: 0, X: 0, Y: 0}); err != nil {
					errs <- err
					return
				}
			}
		}()
	}

	for range 5 {
		writeArchive(t, path, map[[3]int]string{{0, 0, 0}: "vN"}, "n")
	}

	close(done)

	for range 8 {
		require.NoError(t, <-errs)
	}
}

// A relative directory (e.g. "./.tiles" in config.yaml) must work: SQLite URIs need absolute paths.
func TestStore_RelativeDirectory(t *testing.T) {
	root := t.TempDir()
	t.Chdir(root)

	s := New("./.tiles")

	t.Cleanup(func() { _ = s.Close() })

	writeArchive(t, s.Path(testSet), map[[3]int]string{{3, 2, 6}: "relative-ok"}, "n")

	got, err := s.Tile(t.Context(), testSet, maptile.Coord{Z: 3, X: 2, Y: 1})
	require.NoError(t, err)
	assert.Equal(t, "relative-ok", string(got))
}
