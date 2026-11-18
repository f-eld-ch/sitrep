package outbound

import (
	"context"
	"errors"

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
}
