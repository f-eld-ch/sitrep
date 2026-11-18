package mbtiles

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// validArchiveBytes returns the bytes of a small valid MBTiles file.
func validArchiveBytes(t *testing.T) []byte {
	t.Helper()

	p := filepath.Join(t.TempDir(), "src.mbtiles")
	writeArchive(t, p, map[[3]int]string{{3, 2, 6}: "tile-3-2-1"}, "Basiskarte_v1.0.0")

	b, err := os.ReadFile(p) //nolint:gosec // test file in a temp directory
	require.NoError(t, err)

	return b
}

func writePart(t *testing.T, a *Archive, etag string, data []byte, resume bool) {
	t.Helper()

	w, err := a.OpenPart(t.Context(), testSet, etag, int64(len(data)), resume)
	require.NoError(t, err)
	_, err = w.Write(data)
	require.NoError(t, err)
	require.NoError(t, w.Close())
}

func TestArchive_LocalAndPartAreEmptyInitially(t *testing.T) {
	a := NewArchive(filepath.Join(t.TempDir(), "does-not-exist-yet"))

	local, err := a.Local(t.Context(), testSet)
	require.NoError(t, err)
	assert.False(t, local.Present)

	part, err := a.Part(t.Context(), testSet)
	require.NoError(t, err)
	assert.False(t, part.Present)
}

func TestArchive_DownloadInTwoPartsResumesAndInstalls(t *testing.T) {
	data := validArchiveBytes(t)
	a := NewArchive(t.TempDir())
	half := len(data) / 2

	// First attempt: the connection breaks after half the file.
	w, err := a.OpenPart(t.Context(), testSet, `"v1"`, int64(len(data)), false)
	require.NoError(t, err)
	_, err = w.Write(data[:half])
	require.NoError(t, err)
	require.NoError(t, w.Close())

	part, err := a.Part(t.Context(), testSet)
	require.NoError(t, err)
	assert.True(t, part.Present)
	assert.Equal(t, `"v1"`, part.ETag)
	assert.EqualValues(t, half, part.Size)

	// Second attempt resumes from where it stopped.
	w, err = a.OpenPart(t.Context(), testSet, `"v1"`, int64(len(data)), true)
	require.NoError(t, err)
	_, err = w.Write(data[half:])
	require.NoError(t, err)
	require.NoError(t, w.Close())

	require.NoError(t, a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(data))}))

	local, err := a.Local(t.Context(), testSet)
	require.NoError(t, err)
	assert.True(t, local.Present)
	assert.Equal(t, `"v1"`, local.ETag)
	assert.EqualValues(t, len(data), local.Size)

	// The part and its sidecar are gone: one archive file, one sidecar.
	part, err = a.Part(t.Context(), testSet)
	require.NoError(t, err)
	assert.False(t, part.Present)

	entries, err := os.ReadDir(filepath.Dir(a.path(testSet)))
	require.NoError(t, err)

	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}

	assert.ElementsMatch(t, []string{"ch.swisstopo.base.vt.mbtiles", "ch.swisstopo.base.vt.mbtiles.meta.json"}, names)

	// And the store can serve from what was installed.
	s := New(a.dir)

	t.Cleanup(func() { _ = s.Close() })

	got, err := s.Tile(t.Context(), testSet, maptile.Coord{Z: 3, X: 2, Y: 1})
	require.NoError(t, err)
	assert.Equal(t, "tile-3-2-1", string(got))
}

func TestArchive_ResumeWithOtherETagIsRefused(t *testing.T) {
	a := NewArchive(t.TempDir())
	writePart(t, a, `"v1"`, []byte("abc"), false)

	_, err := a.OpenPart(t.Context(), testSet, `"v2"`, 100, true)
	require.ErrorIs(t, err, outbound.ErrUpstreamChanged)
}

func TestArchive_NonResumeStartsOver(t *testing.T) {
	a := NewArchive(t.TempDir())
	writePart(t, a, `"v1"`, []byte("old-old-old"), false)
	writePart(t, a, `"v2"`, []byte("new"), false)

	part, err := a.Part(t.Context(), testSet)
	require.NoError(t, err)
	assert.EqualValues(t, 3, part.Size)
	assert.Equal(t, `"v2"`, part.ETag)
}

func TestArchive_CommitRejectsBadFiles(t *testing.T) {
	data := validArchiveBytes(t)

	t.Run("wrong size", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		writePart(t, a, `"v1"`, data[:len(data)-1], false)

		err := a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(data))})
		require.ErrorIs(t, err, outbound.ErrInvalidArchive)
	})

	t.Run("not an archive", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		garbage := []byte("this is not a sqlite database at all, just text")
		writePart(t, a, `"v1"`, garbage, false)

		err := a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(garbage))})
		require.ErrorIs(t, err, outbound.ErrInvalidArchive)
	})

	t.Run("a failed commit keeps the installed archive", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		writePart(t, a, `"v1"`, data, false)
		require.NoError(
			t,
			a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(data))}),
		)

		writePart(t, a, `"v2"`, []byte("garbage"), false)
		require.ErrorIs(t, a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v2"`, Size: 7}),
			outbound.ErrInvalidArchive)

		local, err := a.Local(t.Context(), testSet)
		require.NoError(t, err)
		assert.Equal(t, `"v1"`, local.ETag)
	})
}

func TestArchive_UpdateReplacesWithoutLeavingOldFiles(t *testing.T) {
	a := NewArchive(t.TempDir())
	v1 := validArchiveBytes(t)
	writePart(t, a, `"v1"`, v1, false)
	require.NoError(t, a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(v1))}))

	p := filepath.Join(t.TempDir(), "v2.mbtiles")
	writeArchive(t, p, map[[3]int]string{{3, 2, 6}: "newer-and-longer-tile"}, "v2")

	v2, err := os.ReadFile(p) //nolint:gosec // test file in a temp directory
	require.NoError(t, err)

	writePart(t, a, `"v2"`, v2, false)
	require.NoError(t, a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v2"`, Size: int64(len(v2))}))

	entries, err := os.ReadDir(filepath.Dir(a.path(testSet)))
	require.NoError(t, err)
	assert.Len(t, entries, 2, "exactly the archive and its sidecar, no old version")

	local, err := a.Local(t.Context(), testSet)
	require.NoError(t, err)
	assert.Equal(t, `"v2"`, local.ETag)
}

func TestArchive_HandCopiedFileHasUnknownVersion(t *testing.T) {
	a := NewArchive(t.TempDir())
	writeArchive(t, a.path(testSet), map[[3]int]string{{0, 0, 0}: "x"}, "n")

	local, err := a.Local(t.Context(), testSet)
	require.NoError(t, err)
	assert.True(t, local.Present)
	assert.Empty(t, local.ETag, "no sidecar: upstream version unknown")
}

func TestArchive_SidecarForADifferentFileIsIgnored(t *testing.T) {
	a := NewArchive(t.TempDir())
	data := validArchiveBytes(t)
	writePart(t, a, `"v1"`, data, false)
	require.NoError(t, a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(data))}))

	// Someone replaces the archive by hand; the old sidecar no longer matches its size.
	writeArchive(
		t,
		a.path(testSet),
		map[[3]int]string{{0, 0, 0}: "a-completely-different-and-bigger-tile-payload"},
		"n",
	)

	local, err := a.Local(t.Context(), testSet)
	require.NoError(t, err)
	assert.Empty(t, local.ETag)
}

func TestArchive_FreeSpaceWorksBeforeTheDirectoryExists(t *testing.T) {
	a := NewArchive(filepath.Join(t.TempDir(), "a", "b", "c"))

	free, err := a.FreeSpace(t.Context())
	require.NoError(t, err)
	assert.Positive(t, free)
}

// write creates a file with the given age.
func write(t *testing.T, path string, age time.Duration) {
	t.Helper()
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))
	require.NoError(t, os.WriteFile(path, []byte("12345"), 0o600))

	old := time.Now().Add(-age)
	require.NoError(t, os.Chtimes(path, old, old))
}

func exists(path string) bool {
	_, err := os.Stat(path)

	return err == nil
}

func TestArchive_Prune(t *testing.T) {
	dir := t.TempDir()
	a := NewArchive(dir)
	keep := []maptile.Tileset{testSet}
	base := a.path(testSet)
	week := 7 * 24 * time.Hour

	// Current files that must stay.
	write(t, base, 0)
	write(t, base+extMeta, 0)
	write(t, base+extPart, time.Hour)                                   // recent part
	write(t, base+extPartMeta, time.Hour)                               // its sidecar
	write(t, filepath.Join(filepath.Dir(base), "README.txt"), 100*week) // not ours

	// Tileset and version that are not served any more.
	old := maptile.Tileset{Name: "ch.swisstopo.base.vt", Version: "v0.9.0"}
	write(t, a.path(old), 0)
	write(t, a.path(old)+extMeta, 0)

	// A tileset directory that is not one of ours at all must not be touched.
	write(t, filepath.Join(dir, "something-else", "v1", "data.bin"), 100*week)
	write(t, filepath.Join(dir, "something-else", "v1", "foo.mbtiles"), 100*week)

	removed, err := a.Prune(t.Context(), keep, week)
	require.NoError(t, err)

	var paths []string
	for _, r := range removed {
		paths = append(paths, r.Path)
	}

	// Only the not-served version is removed (archive + sidecar), and its now-empty directory.
	assert.ElementsMatch(t, []string{a.path(old), a.path(old) + extMeta}, paths)
	assert.False(t, exists(filepath.Dir(a.path(old))), "empty version directory is removed")

	for _, p := range []string{
		base, base + extMeta, base + extPart, base + extPartMeta,
		filepath.Join(filepath.Dir(base), "README.txt"),
	} {
		assert.True(t, exists(p), "must stay: %s", p)
	}

	// "something-else" is a tileset dir we don't know, and its files follow the same rule:
	// foo.mbtiles has no <name>.mbtiles prefix match, so it is not ours either.
	assert.True(t, exists(filepath.Join(dir, "something-else", "v1", "data.bin")))
}

func TestArchive_PruneStaleAndOrphanedFiles(t *testing.T) {
	a := NewArchive(t.TempDir())
	base := a.path(testSet)
	week := 7 * 24 * time.Hour

	write(t, base, 0)
	write(t, base+extPart, 8*24*time.Hour)     // part not touched for over a week
	write(t, base+extPartMeta, 8*24*time.Hour) // follows its part
	write(t, base+extTmp, 2*time.Hour)         // leftover temporary sidecar

	removed, err := a.Prune(t.Context(), []maptile.Tileset{testSet}, week)
	require.NoError(t, err)

	assert.Len(t, removed, 3)
	assert.True(t, exists(base))
	assert.False(t, exists(base+extPart))
	assert.False(t, exists(base+extPartMeta))
	assert.False(t, exists(base+extTmp))
}

func TestArchive_PruneRemovesOrphanSidecars(t *testing.T) {
	a := NewArchive(t.TempDir())
	base := a.path(testSet)

	write(t, base+extMeta, 0)     // sidecar without an archive
	write(t, base+extPartMeta, 0) // part sidecar without a part

	removed, err := a.Prune(t.Context(), []maptile.Tileset{testSet}, 7*24*time.Hour)
	require.NoError(t, err)
	assert.Len(t, removed, 2)
}

func TestArchive_PruneWithoutDirectoryIsNoop(t *testing.T) {
	a := NewArchive(filepath.Join(t.TempDir(), "nothing"))

	removed, err := a.Prune(t.Context(), []maptile.Tileset{testSet}, time.Hour)
	require.NoError(t, err)
	assert.Empty(t, removed)
}

// The adapters build file paths from the tileset, so only the known tilesets may reach them.
func TestArchiveAndStore_RejectUnknownTilesetsBeforeTouchingTheFileSystem(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "tiles")
	a := NewArchive(dir)
	s := New(dir)

	t.Cleanup(func() { _ = s.Close() })

	evil := maptile.Tileset{Name: "../../escape", Version: "v1.0.0"}

	_, err := a.Local(t.Context(), evil)
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	_, err = a.Part(t.Context(), evil)
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	_, err = a.OpenPart(t.Context(), evil, `"x"`, 1, false)
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	require.ErrorIs(t, a.Commit(t.Context(), evil, outbound.RemoteTileInfo{}), maptile.ErrUnknownTileset)
	require.ErrorIs(t, a.DiscardPart(t.Context(), evil), maptile.ErrUnknownTileset)

	_, err = s.Info(t.Context(), evil)
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	_, err = s.Tile(t.Context(), evil, maptile.Coord{})
	require.ErrorIs(t, err, maptile.ErrUnknownTileset)

	// Nothing was created, neither below the tile directory nor next to it.
	entries, err := os.ReadDir(root)
	require.NoError(t, err)
	assert.Empty(t, entries)
}

// Prune walks directories that exist on disk; a symlink must never be followed out of the tile directory.
func TestArchive_PruneDoesNotFollowSymlinks(t *testing.T) {
	outside := t.TempDir()
	victim := filepath.Join(outside, "v1.0.0", "ch.swisstopo.base.vt.mbtiles")
	write(t, victim, 100*24*time.Hour)

	dir := t.TempDir()
	require.NoError(t, os.Symlink(outside, filepath.Join(dir, "ch.swisstopo.base.vt")))

	removed, err := NewArchive(dir).Prune(t.Context(), nil, time.Hour) // nothing is kept
	require.NoError(t, err)

	assert.Empty(t, removed)
	assert.True(t, exists(victim), "a file behind a symlink must survive")
}
