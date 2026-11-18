package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v5"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// tilesPath is the route prefix of the tile endpoints below /api/v2.
const tilesPath = "/api/v2/tiles"

// isTilePath reports whether path is below the tile endpoint. isTileDataPath narrows it to .pbf tile
// requests, which are skipped by
// tracing (a map view requests dozens of them).
func isTilePath(path string) bool { return strings.HasPrefix(path, tilesPath+"/") }

func isTileDataPath(path string) bool { return isTilePath(path) && strings.HasSuffix(path, ".pbf") }

// registerTiles mounts the tile endpoints on the authenticated /api/v2 group.
func registerTiles(g *echo.Group, svc inbound.TileService) {
	g.GET("/tiles/:name/:version/tiles.json", tileJSONHandler(svc))
	g.GET("/tiles/:name/:version/:z/:x/:file", tileHandler(svc))
}

func tileErrorToHTTP(c *echo.Context, err error) error {
	switch {
	case errors.Is(err, maptile.ErrUnknownTileset):
		return c.JSON(http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, maptile.ErrInvalidCoord):
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		slog.ErrorContext(c.Request().Context(), "tile handler error", slog.String("error", err.Error()))
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// tileJSONResponse is the TileJSON 2.1 wire format.
type tileJSONResponse struct {
	TileJSON     string          `json:"tilejson"`
	Name         string          `json:"name,omitempty"`
	Description  string          `json:"description,omitempty"`
	Version      string          `json:"version,omitempty"`
	Attribution  string          `json:"attribution"`
	Scheme       string          `json:"scheme"`
	Format       string          `json:"format,omitempty"`
	MinZoom      int             `json:"minzoom"`
	MaxZoom      int             `json:"maxzoom"`
	Bounds       []float64       `json:"bounds,omitempty"`
	Center       []float64       `json:"center,omitempty"`
	Tiles        []string        `json:"tiles"`
	VectorLayers json.RawMessage `json:"vector_layers,omitempty"`
}

func tileJSONHandler(svc inbound.TileService) echo.HandlerFunc {
	return func(c *echo.Context) error {
		ts, err := maptile.ParseTileset(c.Param("name"), c.Param("version"))
		if err != nil {
			return tileErrorToHTTP(c, err)
		}

		// Tile URLs go to the map's web worker, which cannot resolve relative URLs,
		// so they must be absolute. Echo honours X-Forwarded-Proto only for requests from
		// loopback or private-network peers (an ingress controller), which is what we want.
		base := c.Scheme() + "://" + c.Request().Host + tilesPath

		state, err := svc.TileJSON(c.Request().Context(), ts, base)
		if err != nil {
			return tileErrorToHTTP(c, err)
		}

		tj := state.TileJSON

		c.Response().Header().Set("Cache-Control", "private, no-cache")

		return c.JSON(http.StatusOK, tileJSONResponse{
			TileJSON:     tj.TileJSON,
			Name:         tj.Name,
			Description:  tj.Description,
			Version:      tj.Version,
			Attribution:  tj.Attribution,
			Scheme:       tj.Scheme,
			Format:       tj.Format,
			MinZoom:      tj.MinZoom,
			MaxZoom:      tj.MaxZoom,
			Bounds:       tj.Bounds,
			Center:       tj.Center,
			Tiles:        tj.Tiles,
			VectorLayers: tj.VectorLayers,
		})
	}
}

// tileETag derives the HTTP ETag of one tile from the archive ETag, so a
// conditional request is answered without reading the archive.
func tileETag(archiveETag string, c maptile.Coord) string {
	return `"` + strings.Trim(
		archiveETag,
		`"`,
	) + "-" + strconv.Itoa(
		c.Z,
	) + "-" + strconv.Itoa(
		c.X,
	) + "-" + strconv.Itoa(
		c.Y,
	) + `"`
}

func etagMatches(header, etag string) bool {
	for v := range strings.SplitSeq(header, ",") {
		v = strings.TrimPrefix(strings.TrimSpace(v), "W/")
		if v == "*" || v == etag {
			return true
		}
	}

	return false
}

func tileHandler(svc inbound.TileService) echo.HandlerFunc {
	return func(c *echo.Context) error {
		ctx := c.Request().Context()

		ts, err := maptile.ParseTileset(c.Param("name"), c.Param("version"))
		if err != nil {
			return tileErrorToHTTP(c, err)
		}

		yStr, ok := strings.CutSuffix(c.Param("file"), ".pbf")
		if !ok {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
		}

		z, errZ := strconv.Atoi(c.Param("z"))
		x, errX := strconv.Atoi(c.Param("x"))
		y, errY := strconv.Atoi(yStr)

		if errZ != nil || errX != nil || errY != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid tile coordinate"})
		}

		coord, err := maptile.NewCoord(z, x, y)
		if err != nil {
			return tileErrorToHTTP(c, err)
		}

		h := c.Response().Header()

		// Answer a conditional request from the archive ETag alone.
		if archive := svc.ETag(ctx, ts); archive != "" {
			etag := tileETag(archive, coord)
			if etagMatches(c.Request().Header.Get("If-None-Match"), etag) {
				h.Set("ETag", etag)
				h.Set("Cache-Control", "private, max-age=86400")

				return c.NoContent(http.StatusNotModified)
			}
		}

		tile, err := svc.Tile(ctx, ts, coord)
		if err != nil {
			return tileErrorToHTTP(c, err)
		}

		if tile.Redirect {
			// Never cache: once the download finishes the browser must use the local tiles.
			h.Set("Cache-Control", "no-store")

			return c.Redirect(http.StatusFound, tile.RedirectURL)
		}

		h.Set("ETag", tileETag(tile.ETag, coord))
		h.Set("Cache-Control", "private, max-age=86400")

		if tile.Empty {
			return c.NoContent(http.StatusNoContent)
		}

		// The tiles are stored gzip-compressed; send them as they are.
		if len(tile.Data) > 2 && tile.Data[0] == 0x1f && tile.Data[1] == 0x8b {
			h.Set("Content-Encoding", "gzip")
		}

		return c.Blob(http.StatusOK, "application/x-protobuf", tile.Data)
	}
}
