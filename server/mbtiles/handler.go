package mbtiles

import (
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/twpayne/go-mbtiles"
	_ "modernc.org/sqlite" // Register sqlite database driver.
)

type Handler struct {
	Relief  *mbtiles.Reader
	Basemap *mbtiles.Reader
}

func NewHandler(s *echo.Echo) *Handler {
	handler := &Handler{}
	var err error

	handler.Relief, err = mbtiles.NewReader("sqlite", "./ch.swisstopo.relief.vt.mbtiles")
	if err != nil {
		slog.Error("failed to open relief mbtiles", "error", err)
		return nil
	}

	handler.Basemap, err = mbtiles.NewReader("sqlite", "./ch.swisstopo.base.vt.mbtiles")
	if err != nil {
		slog.Error("failed to open basemap mbtiles", "error", err)
		return nil
	}

	s.GET("/map/tiles/ch.swisstopo.relief.vt", echo.WrapHandler(http.StripPrefix("/map/tiles/ch.swisstopo.relief.vt", handler.Relief)))
	s.GET("/map/tiles/ch.swisstopo.basemap.vt", echo.WrapHandler(http.StripPrefix("/map/tiles/ch.swisstopo.basemap.vt", handler.Basemap)))
	// todo handle tiles.json requests

	return handler
}

func (h *Handler) Close() {
	slog.Info("closing mbtiles handlers")
	h.Relief.Close()
	h.Basemap.Close()
}
