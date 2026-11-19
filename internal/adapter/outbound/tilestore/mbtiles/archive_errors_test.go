package mbtiles

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func TestArchive_DiscardPartRemovesThePartAndItsSidecar(t *testing.T) {
	a := NewArchive(t.TempDir())
	writePart(t, a, `"v1"`, []byte("some bytes"))

	before, err := a.Part(t.Context(), testSet)
	require.NoError(t, err)
	require.True(t, before.Present)
	require.Equal(t, `"v1"`, before.ETag)

	require.NoError(t, a.DiscardPart(t.Context(), testSet))

	after, err := a.Part(t.Context(), testSet)
	require.NoError(t, err)
	assert.False(t, after.Present)
	assert.NoFileExists(t, a.partMetaPath(testSet))

	require.NoError(t, a.DiscardPart(t.Context(), testSet), "discarding nothing is fine")
}

func TestArchive_DiscardPartReportsFilesItCannotRemove(t *testing.T) {
	a := NewArchive(t.TempDir())

	// A non-empty directory where the part should be cannot be removed with os.Remove.
	require.NoError(t, os.MkdirAll(filepath.Join(a.partPath(testSet), "child"), 0o750))

	require.Error(t, a.DiscardPart(t.Context(), testSet))
}

func TestArchive_OpenPartErrors(t *testing.T) {
	t.Run("the directory cannot be created", func(t *testing.T) {
		blocker := filepath.Join(t.TempDir(), "file")
		require.NoError(t, os.WriteFile(blocker, []byte("x"), 0o600))

		_, err := NewArchive(blocker).OpenPart(t.Context(), testSet, `"v1"`, 10, false)

		require.Error(t, err)
	})

	t.Run("the sidecar cannot be written", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		require.NoError(t, os.MkdirAll(a.partMetaPath(testSet), 0o750))

		_, err := a.OpenPart(t.Context(), testSet, `"v1"`, 10, false)

		require.Error(t, err)
	})

	t.Run("the part cannot be opened", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		require.NoError(t, os.MkdirAll(a.partPath(testSet), 0o750))

		_, err := a.OpenPart(t.Context(), testSet, `"v1"`, 10, false)

		require.Error(t, err)
	})

	t.Run("resuming without a sidecar means the upstream changed", func(t *testing.T) {
		_, err := NewArchive(t.TempDir()).OpenPart(t.Context(), testSet, `"v1"`, 10, true)

		require.ErrorIs(t, err, outbound.ErrUpstreamChanged)
	})
}

func TestArchive_CommitErrors(t *testing.T) {
	t.Run("without a part", func(t *testing.T) {
		err := NewArchive(t.TempDir()).Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: 10})

		require.ErrorIs(t, err, outbound.ErrInvalidArchive)
	})

	t.Run("the archive cannot be put in place", func(t *testing.T) {
		data := validArchiveBytes(t)
		a := NewArchive(t.TempDir())
		writePart(t, a, `"v1"`, data)
		// A non-empty directory at the target makes the rename fail.
		require.NoError(t, os.MkdirAll(filepath.Join(a.path(testSet), "child"), 0o750))

		err := a.Commit(t.Context(), testSet, outbound.RemoteTileInfo{ETag: `"v1"`, Size: int64(len(data))})

		require.Error(t, err)
		assert.NoFileExists(t, a.path(testSet)+extTmp, "the temporary sidecar is cleaned up")
	})
}

func TestArchive_PruneErrors(t *testing.T) {
	t.Run("the directory is a file", func(t *testing.T) {
		file := filepath.Join(t.TempDir(), "file")
		require.NoError(t, os.WriteFile(file, []byte("x"), 0o600))

		_, err := NewArchive(file).Prune(t.Context(), nil, 0)

		require.Error(t, err)
	})

	t.Run("files that are not ours stay", func(t *testing.T) {
		a := NewArchive(t.TempDir())
		dir := filepath.Dir(a.path(testSet))
		require.NoError(t, os.MkdirAll(dir, 0o750))

		foreign := filepath.Join(dir, testSet.Name+".mbtiles.notes")
		require.NoError(t, os.WriteFile(foreign, []byte("keep me"), 0o600))

		removed, err := a.Prune(t.Context(), nil, 0)

		require.NoError(t, err)
		assert.Empty(t, removed)
		assert.FileExists(t, foreign)
	})
}

func TestSidecarWithGarbageIsIgnored(t *testing.T) {
	path := filepath.Join(t.TempDir(), "x.meta")

	_, ok := readSidecar(path)
	assert.False(t, ok, "missing file")

	require.NoError(t, os.WriteFile(path, []byte("{not json"), 0o600))

	_, ok = readSidecar(path)
	assert.False(t, ok, "invalid JSON")

	require.Error(t, writeSidecar(filepath.Join(t.TempDir(), "missing", "x.meta"), sidecar{}))
}

func TestMetadataParsing(t *testing.T) {
	assert.Equal(t, 7, atoi(" 7 ", 0))
	assert.Equal(t, 14, atoi("x", 14))
	assert.Equal(t, 3, atoi("", 3))

	assert.Equal(t, []float64{5.9, 45.8, 10.5, 47.8}, floats("5.9, 45.8,10.5,47.8"))
	assert.Nil(t, floats(""))
	assert.Nil(t, floats("5.9,north"))
}

func TestHumanBytes(t *testing.T) {
	assert.Equal(t, "10 B", humanBytes(10))
	assert.Equal(t, "1 KiB", humanBytes(1024))
	assert.Equal(t, "992.5 MiB", humanBytes(992*1024*1024+512*1024))
	assert.Equal(t, "2 GiB", humanBytes(2<<30))
}
