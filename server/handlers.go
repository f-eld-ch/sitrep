package server

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (s *Server) health(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ready(c echo.Context) error {
	if s.isShuttingDown.Load() {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ready"})
}
