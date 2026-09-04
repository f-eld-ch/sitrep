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

// legacyGraphQLGone answers requests to the pre-26.9.0 Hasura-proxied GraphQL endpoint,
// which no longer exists.
//
// Without this route the request falls through to the SPA static middleware, which (HTML5
// fallback) serves index.html with a 200. A pre-26.9.0 client still running from a stale
// service worker cache then tries to JSON-parse that HTML and fails loudly and confusingly.
// Clear-Site-Data instructs the browser to drop the cached service worker and its caches, so
// the *next* navigation is guaranteed to fetch a current bundle instead of repeating the same
// broken request against the same stale worker.
func (s *Server) legacyGraphQLGone(c *echo.Context) error {
	c.Response().Header().Set("Clear-Site-Data", `"cache", "storage", "executionContexts"`)
	c.Response().Header().Set(echo.HeaderCacheControl, "no-store")

	// Chromium ignores Clear-Site-Data on 4xx/5xx responses, so this must be a 2xx to take
	// effect at all. 200 + an errors array is also just the normal GraphQL error convention.
	return c.JSON(http.StatusOK, map[string]any{
		"errors": []map[string]string{
			{"message": "this API was removed; reload the page to fetch the current version"},
		},
	})
}
