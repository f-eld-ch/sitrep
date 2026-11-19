package service

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var errTiles = errors.New("tile storage failed")

// failingTileStore cannot read the archive.
type failingTileStore struct {
	outbound.TileStore

	err error
}

func (s failingTileStore) Info(context.Context, maptile.Tileset) (outbound.TileArchiveInfo, error) {
	return outbound.TileArchiveInfo{}, s.err
}

func TestTileService_ReportsAnArchiveThatCannotBeRead(t *testing.T) {
	svc := NewTileService(failingTileStore{err: errTiles})

	t.Run("TileJSON", func(t *testing.T) {
		got, err := svc.TileJSON(t.Context(), tileTestSet, "https://sitrep.example/api/v2/tiles")
		require.ErrorIs(t, err, errTiles)
		assert.Equal(t, inbound.TileJSONState{}, got)
	})

	t.Run("TileJSON when the request was cancelled", func(t *testing.T) {
		cancelled := NewTileService(failingTileStore{err: context.Canceled})

		_, err := cancelled.TileJSON(t.Context(), tileTestSet, "https://sitrep.example/api/v2/tiles")
		require.ErrorIs(t, err, context.Canceled)
	})

	t.Run("TileJSON for a tileset that is not served", func(t *testing.T) {
		_, err := svc.TileJSON(t.Context(), maptile.Tileset{Name: "../etc", Version: "x"}, "https://x")
		require.Error(t, err)
	})

	t.Run("LocalStatus names the broken archives and leaves the rest alone", func(t *testing.T) {
		got := svc.LocalStatus(t.Context())

		require.Len(t, got, len(maptile.Supported))

		for _, l := range got {
			require.ErrorIs(t, l.Err, errTiles)
			assert.False(t, l.Ready)
		}
	})
}

// brokenArchive is an archive that fails where told to; the rest behaves like fakeArchive.
type brokenArchive struct {
	*fakeArchive

	localErr, partErr, openErr, pruneErr, freeErr error
	closeErr                                      error
}

func (a *brokenArchive) Local(ctx context.Context, ts maptile.Tileset) (outbound.LocalTileInfo, error) {
	if a.localErr != nil {
		return outbound.LocalTileInfo{}, a.localErr
	}

	return a.fakeArchive.Local(ctx, ts)
}

func (a *brokenArchive) Part(ctx context.Context, ts maptile.Tileset) (outbound.PartInfo, error) {
	if a.partErr != nil {
		return outbound.PartInfo{}, a.partErr
	}

	return a.fakeArchive.Part(ctx, ts)
}

func (a *brokenArchive) OpenPart(
	ctx context.Context, ts maptile.Tileset, etag string, size int64, resume bool,
) (io.WriteCloser, error) {
	if a.openErr != nil {
		return nil, a.openErr
	}

	w, err := a.fakeArchive.OpenPart(ctx, ts, etag, size, resume)
	if err != nil || a.closeErr == nil {
		return w, err
	}

	return closeFails{WriteCloser: w, err: a.closeErr}, nil
}

func (a *brokenArchive) Prune(
	ctx context.Context, keep []maptile.Tileset, age time.Duration,
) ([]outbound.PrunedFile, error) {
	if a.pruneErr != nil {
		return nil, a.pruneErr
	}

	return a.fakeArchive.Prune(ctx, keep, age)
}

func (a *brokenArchive) FreeSpace(ctx context.Context) (uint64, error) {
	if a.freeErr != nil {
		return 0, a.freeErr
	}

	return a.fakeArchive.FreeSpace(ctx)
}

// closeFails writes, but cannot flush.
type closeFails struct {
	io.WriteCloser

	err error
}

func (c closeFails) Close() error { return c.err }

func newBrokenSync(t *testing.T) (*TileSyncService, *fakeUpstream, *brokenArchive) {
	t.Helper()

	up, ar := newFakeUpstream(), &brokenArchive{fakeArchive: newFakeArchive()}
	up.publish(baseTS, `"b1"`, "BASE-ARCHIVE-BYTES")
	up.publish(reliefTS, `"r1"`, "RELIEF-ARCHIVE-BYTES")

	return NewTileSyncService(up, ar, 7*24*time.Hour), up, ar
}

func TestTileSync_ReportsWhatItCannotDo(t *testing.T) {
	tests := []struct {
		name   string
		break_ func(a *brokenArchive)
		step   string
	}{
		{
			"the installed archive cannot be read",
			func(a *brokenArchive) { a.localErr = errTiles },
			"read local archive",
		},
		{
			"the partial download cannot be read",
			func(a *brokenArchive) { a.partErr = errTiles },
			"read partial download",
		},
		{
			"the partial download cannot be opened",
			func(a *brokenArchive) { a.openErr = errTiles },
			"open partial download",
		},
		{
			"the partial download cannot be flushed",
			func(a *brokenArchive) { a.closeErr = errTiles },
			"flush partial download",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, _, ar := newBrokenSync(t)
			tt.break_(ar)

			report, err := svc.Sync(t.Context())
			require.NoError(t, err)

			for _, ts := range report.Tilesets {
				assert.Equal(t, inbound.SyncFailed, ts.Outcome)
				require.ErrorIs(t, ts.Err, errTiles)
				assert.ErrorContains(t, ts.Err, tt.step)
			}
		})
	}

	t.Run("free space that cannot be determined does not stop the download", func(t *testing.T) {
		svc, _, ar := newBrokenSync(t)
		ar.freeErr = errTiles

		report, err := svc.Sync(t.Context())
		require.NoError(t, err)
		assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[baseTS.Name])
	})
}

func TestTileSync_StatusAndPruneReportStorageFailures(t *testing.T) {
	t.Run("Status when the installed archive cannot be read", func(t *testing.T) {
		svc, _, ar := newBrokenSync(t)
		ar.localErr = errTiles

		st, err := svc.Status(t.Context())
		require.ErrorIs(t, err, errTiles)
		assert.Nil(t, st)
	})

	t.Run("Status shows how much of a partial download there is", func(t *testing.T) {
		svc, _, ar := newBrokenSync(t)
		ar.parts[baseTS] = &fakePart{etag: `"b1"`}
		ar.parts[baseTS].buf.WriteString("BASE")

		st, err := svc.Status(t.Context())
		require.NoError(t, err)
		assert.Equal(t, int64(4), st[0].PartSize)
	})

	t.Run("Status leaves out a partial download it cannot read", func(t *testing.T) {
		svc, _, ar := newBrokenSync(t)
		ar.partErr = errTiles

		st, err := svc.Status(t.Context())
		require.NoError(t, err)
		assert.Zero(t, st[0].PartSize)
	})

	t.Run("Prune when the files cannot be removed", func(t *testing.T) {
		svc, _, ar := newBrokenSync(t)
		ar.pruneErr = errTiles

		removed, err := svc.Prune(t.Context())
		require.ErrorIs(t, err, errTiles)
		assert.Nil(t, removed)
	})
}

func TestProgressWriter_UnknownSizeIsNotProgress(t *testing.T) {
	assert.Zero(t, (&progressWriter{total: 0, done: 10}).percent())
	assert.Zero(t, (&progressWriter{total: -1, done: 10}).percent())
	assert.Equal(t, 100, (&progressWriter{total: 10, done: 25}).percent(), "never more than a hundred")
}
