package outbound

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
)

// ErrTilesetNotAvailable is returned by TileStore when there is no local archive
// for the tileset (never downloaded or still downloading). The service then
// falls back to the public swisstopo tiles.
var ErrTilesetNotAvailable = errors.New("tileset not available locally")

// TileArchiveInfo describes a local tile archive.
type TileArchiveInfo struct {
	// ETag identifies this version of the archive (stable while the file is
	// unchanged); it is part of every tile's HTTP ETag.
	ETag string
	// TileJSON carries the archive metadata (zooms, bounds, vector layers).
	// Tiles and Attribution are filled in by the service.
	TileJSON maptile.TileJSON
	// Size is the archive file size and ModTime when it was installed (the file modification time).
	Size    int64
	ModTime time.Time
}

// TileStore is the driven port for reading vector tiles from local archives.
// Implementations must be safe for concurrent use and must never write to the archive.
type TileStore interface {
	// Info returns metadata for the local archive of ts, or ErrTilesetNotAvailable.
	Info(ctx context.Context, ts maptile.Tileset) (TileArchiveInfo, error)

	// Tile returns the gzip-compressed MVT bytes at c.
	// It returns ErrTilesetNotAvailable when there is no local archive and
	// maptile.ErrTileNotFound when the archive has no tile at c.
	Tile(ctx context.Context, ts maptile.Tileset, c maptile.Coord) ([]byte, error)

	// Refresh re-checks the local archives now, so an archive that was just installed or removed
	// takes effect immediately instead of at the next request.
	Refresh(ctx context.Context)
}

var (
	// ErrInvalidArchive is returned by TileArchive.Commit when the downloaded file is not a
	// usable archive (wrong size, not SQLite, no metadata or tiles table).
	ErrInvalidArchive = errors.New("downloaded archive is invalid")
	// ErrUpstreamChanged is returned by TileArchive.OpenPart when a partial download belongs to
	// a different version of the archive than the one being fetched.
	ErrUpstreamChanged = errors.New("upstream archive changed since the partial download")
)

// RemoteTileInfo describes an archive on the upstream server.
type RemoteTileInfo struct {
	ETag         string
	Size         int64
	LastModified time.Time
}

// TileFetch is an open download of an upstream archive.
type TileFetch struct {
	// Body streams the archive from the requested offset (or from 0 when !Resumed). Close it.
	Body io.ReadCloser
	// Resumed is true when the server honoured the offset. When false, Body starts at byte 0
	// even if an offset was requested.
	Resumed bool
	// ETag and Size describe the archive that is actually being sent.
	ETag string
	Size int64
}

// TileUpstream is the driven port for the public swisstopo archive downloads.
type TileUpstream interface {
	// Head returns the current ETag and size of the archive for ts.
	Head(ctx context.Context, ts maptile.Tileset) (RemoteTileInfo, error)

	// Fetch starts downloading the archive. With offset > 0 it asks to resume, but only if
	// the archive still has the given etag.
	Fetch(ctx context.Context, ts maptile.Tileset, offset int64, etag string) (TileFetch, error)
}

// LocalTileInfo describes the archive installed for a tileset.
type LocalTileInfo struct {
	Present      bool
	ETag         string // upstream ETag it was downloaded as; empty for a file copied in by hand
	Size         int64
	DownloadedAt time.Time
}

// PartInfo describes a partial download.
type PartInfo struct {
	Present bool
	ETag    string
	Size    int64
	ModTime time.Time
}

// PrunedFile is a file removed by TileArchive.Prune.
type PrunedFile struct {
	Path string
	Size int64
}

// TileArchive is the driven port for installing archives. It only manages the files a
// download creates; it never touches anything else in the tile directory.
type TileArchive interface {
	// Local describes the installed archive for ts (Present is false when there is none).
	Local(ctx context.Context, ts maptile.Tileset) (LocalTileInfo, error)

	// Part describes a partial download for ts, if any.
	Part(ctx context.Context, ts maptile.Tileset) (PartInfo, error)

	// OpenPart opens the partial download for writing. With resume it appends to the existing
	// part, which must belong to etag (else ErrUpstreamChanged); otherwise it starts over.
	// Close flushes the data to disk.
	OpenPart(ctx context.Context, ts maptile.Tileset, etag string, size int64, resume bool) (io.WriteCloser, error)

	// Commit validates the partial download against remote and atomically replaces the
	// installed archive with it. It returns ErrInvalidArchive when validation fails; the part
	// is then left in place for the caller to discard.
	Commit(ctx context.Context, ts maptile.Tileset, remote RemoteTileInfo) error

	// DiscardPart removes the partial download for ts.
	DiscardPart(ctx context.Context, ts maptile.Tileset) error

	// FreeSpace returns the free bytes on the volume holding the tile directory.
	FreeSpace(ctx context.Context) (uint64, error)

	// Prune removes files this archive manages that are no longer needed: archives of tilesets
	// not in keep, partial downloads older than partMaxAge, and orphaned sidecar files.
	Prune(ctx context.Context, keep []maptile.Tileset, partMaxAge time.Duration) ([]PrunedFile, error)
}
