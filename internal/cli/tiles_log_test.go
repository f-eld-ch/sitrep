package cli

import (
	"bytes"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tilestore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

func TestLogTilesAtStartup(t *testing.T) {
	var buf bytes.Buffer

	old := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	store := inmem.New()
	store.Put(maptile.Supported[0], `"e1"`, maptile.TileJSON{}, nil)

	logTilesAtStartup(t.Context(), service.NewTileService(store), tilesConfig{dir: "/var/lib/sitrep/tiles"})

	out := buf.String()
	assert.Contains(t, out, "serving map tiles from local archive")
	assert.Contains(t, out, "ch.swisstopo.base.vt/v1.0.0")
	assert.Contains(t, out, "no local tile archive, the map uses swisstopo online")
	assert.Contains(t, out, "ch.swisstopo.relief.vt/v1.0.0")
}

func TestHumanAge(t *testing.T) {
	assert.Equal(t, "0 minutes", humanAge(20*time.Second))
	assert.Equal(t, "12 minutes", humanAge(12*time.Minute+5*time.Second))
	assert.Equal(t, "3 hours", humanAge(3*time.Hour))
	assert.Equal(t, "12 days", humanAge(12*24*time.Hour+5*time.Hour))
}

func TestLogTilesAtStartup_WithAutoDownloadSaysADownloadIsComing(t *testing.T) {
	var buf bytes.Buffer

	old := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(old) })

	logTilesAtStartup(t.Context(), service.NewTileService(inmem.New()),
		tilesConfig{dir: "/var/lib/sitrep/tiles", autoDownload: true})

	out := buf.String()
	assert.Contains(t, out, "downloading it in the background")
	assert.Contains(t, out, "until it is ready")
	assert.NotContains(t, out, "set map.tiles.auto-download", "it is already set: no hint to set it")
}

func TestUpdaterJitter(t *testing.T) {
	ready := inbound.TilesetLocal{Ready: true}
	missing := inbound.TilesetLocal{Ready: false}

	assert.Equal(t, time.Minute, updaterJitter([]inbound.TilesetLocal{ready, ready}), "routine check: spread the load")
	assert.Zero(t, updaterJitter([]inbound.TilesetLocal{ready, missing}), "an archive is missing: download right away")
	assert.Zero(t, updaterJitter([]inbound.TilesetLocal{missing, missing}))
}
