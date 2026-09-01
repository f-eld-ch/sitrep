package server

import (
	"net/http"

	"github.com/labstack/echo/v5"
)

func (s *Server) health(c *echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// version reports the build this binary was produced from.
//
// The UI is embedded here, so a client comparing this against its own compiled-in version
// learns whether the server is serving something newer than the page it is running.
func (s *Server) buildInfo(c *echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"version": s.version,
		"sha":     s.sha,
	})
}

func (s *Server) ready(c *echo.Context) error {
	if s.isShuttingDown.Load() {
		return c.JSON(http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ready"})
}
