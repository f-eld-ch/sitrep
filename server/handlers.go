package server

import (
	"net/http"

	"github.com/labstack/echo/v5"
)

type readinessResponse struct {
	Status         string `json:"status"`
	Listening      bool   `json:"listening"`
	ProjectorReady bool   `json:"projector_ready"`
	ShuttingDown   bool   `json:"shutting_down"`
}

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
	shuttingDown := s.isShuttingDown.Load()
	listening := s.listening.Load()
	projectorReady := s.projectorReady == nil || s.projectorReady()

	response := readinessResponse{
		Listening:      listening,
		ProjectorReady: projectorReady,
		ShuttingDown:   shuttingDown,
	}
	if shuttingDown || !listening || !projectorReady {
		response.Status = "unavailable"
		return c.JSON(http.StatusServiceUnavailable, response)
	}

	response.Status = "ready"

	return c.JSON(http.StatusOK, response)
}
