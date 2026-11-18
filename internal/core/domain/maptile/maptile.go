// Package maptile holds the pure types for serving vector map tiles: which
// tilesets exist, how a tile is addressed and what TileJSON describes it.
// It has no infrastructure imports.
package maptile

import (
	"errors"
	"fmt"
)

// Attribution is the source reference that swisstopo requires for the Base Map, in English.
// The upstream TileJSON only carries "© swisstopo", so we always send the full string. The map UI
// shows the same reference in the app language instead (ui/src/views/map/swisstopoAttribution.ts:
// swisstopo publishes it in German, French, Italian and English); this text is for other clients.
const Attribution = "© swisstopo, © FDFA, © FOEN, © FOCP, © SAC, © Naturefriends Switzerland, © opentransportdata.swiss"

// MaxZoom is the highest zoom level a coordinate may address.
const MaxZoom = 22

var (
	// ErrUnknownTileset is returned for a tileset that is not served.
	ErrUnknownTileset = errors.New("unknown tileset")
	// ErrInvalidCoord is returned for a z/x/y outside the tile grid.
	ErrInvalidCoord = errors.New("invalid tile coordinate")
	// ErrTileNotFound is returned when a local archive has no tile at a coordinate.
	ErrTileNotFound = errors.New("tile not found")
)

// Tileset identifies one published swisstopo vector tileset.
type Tileset struct {
	Name    string
	Version string
}

// String returns "<name>/<version>".
func (t Tileset) String() string { return t.Name + "/" + t.Version }

// Supported lists the tilesets SitRep can serve. swisstopo publishes only v1.0.0
// of each and updates the data in place, so the list is fixed. Add a version here
// together with the checked-in map styles when swisstopo publishes one.
var Supported = []Tileset{
	{Name: "ch.swisstopo.base.vt", Version: "v1.0.0"},
	{Name: "ch.swisstopo.relief.vt", Version: "v1.0.0"},
}

// Validate reports ErrUnknownTileset unless t is one of the Supported tilesets. Adapters call it
// before building a URL or a file path from the tileset, so nothing but the known names and
// versions can ever reach the remote server or the file system, whatever the caller passes.
func (t Tileset) Validate() error {
	_, err := ParseTileset(t.Name, t.Version)

	return err
}

// ParseTileset returns the supported tileset for name and version, or
// ErrUnknownTileset. Anything not in Supported is rejected, which also keeps
// path traversal out of file names derived from it.
func ParseTileset(name, version string) (Tileset, error) {
	for _, t := range Supported {
		if t.Name == name && t.Version == version {
			return t, nil
		}
	}

	return Tileset{}, fmt.Errorf("%w: %s/%s", ErrUnknownTileset, name, version)
}

// Coord addresses a tile in the XYZ scheme (y grows southwards).
type Coord struct {
	Z, X, Y int
}

// NewCoord validates z/x/y against the tile grid.
func NewCoord(z, x, y int) (Coord, error) {
	if z < 0 || z > MaxZoom {
		return Coord{}, fmt.Errorf("%w: zoom %d", ErrInvalidCoord, z)
	}

	limit := 1 << z
	if x < 0 || x >= limit || y < 0 || y >= limit {
		return Coord{}, fmt.Errorf("%w: %d/%d/%d", ErrInvalidCoord, z, x, y)
	}

	return Coord{Z: z, X: x, Y: y}, nil
}

// TMSRow converts the XYZ row to the TMS row that MBTiles stores.
func (c Coord) TMSRow() int { return (1 << c.Z) - 1 - c.Y }

// TileJSON describes a tileset for MapLibre (TileJSON 2.1, XYZ scheme).
type TileJSON struct {
	TileJSON     string
	Name         string
	Description  string
	Version      string
	Attribution  string
	Scheme       string
	Format       string
	MinZoom      int
	MaxZoom      int
	Bounds       []float64
	Center       []float64
	Tiles        []string
	VectorLayers []byte // raw JSON array, copied from the archive metadata
}

// UpstreamTileURL returns the public swisstopo URL template for a tileset.
func UpstreamTileURL(t Tileset) string {
	return "https://vectortiles.geo.admin.ch/tiles/" + t.Name + "/" + t.Version + "/{z}/{x}/{y}.pbf"
}
