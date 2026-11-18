package cli

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tilestore/mbtiles"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/tileupstream/swisstopo"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

const minTilesUpdateInterval = time.Minute

// tilesConfig is the map.tiles.* configuration.
type tilesConfig struct {
	dir          string
	autoDownload bool
	interval     time.Duration
	partMaxAge   time.Duration
}

func readTilesConfig(v *viper.Viper) (tilesConfig, error) {
	cfg := tilesConfig{
		dir:          v.GetString("map.tiles.dir"),
		autoDownload: v.GetBool("map.tiles.auto-download"),
		interval:     v.GetDuration("map.tiles.update-interval"),
		partMaxAge:   v.GetDuration("map.tiles.part-max-age"),
	}

	if cfg.dir == "" {
		return cfg, errors.New("map.tiles.dir must not be empty")
	}

	if cfg.interval < minTilesUpdateInterval {
		return cfg, fmt.Errorf(
			"map.tiles.update-interval must be at least %s, got %s",
			minTilesUpdateInterval,
			cfg.interval,
		)
	}

	if cfg.partMaxAge <= 0 {
		return cfg, fmt.Errorf("map.tiles.part-max-age must be positive, got %s", cfg.partMaxAge)
	}

	return cfg, nil
}

// newTileSyncService wires the swisstopo download and the on-disk archive into the sync use case.
func newTileSyncService(cfg tilesConfig) inbound.TileSyncService {
	return service.NewTileSyncService(swisstopo.New(), mbtiles.NewArchive(cfg.dir), cfg.partMaxAge)
}

func newTilesCmd(v *viper.Viper) *cobra.Command {
	var dir string

	tilesCmd := &cobra.Command{
		Use:   "tiles",
		Short: "Manage the local swisstopo vector tile archives",
		Long: `Downloads and maintains the swisstopo vector tile archives (MBTiles) that sitrep serves
from map.tiles.dir, so the map works without internet access. The server can do the same by
itself with map.tiles.auto-download; these commands are for a first download, for hosts that
update on a schedule of their own, and for checking what is installed.`,
	}

	tilesCmd.PersistentFlags().StringVar(&dir, "dir", "", "tile directory (default: map.tiles.dir)")

	// load resolves the configuration, letting --dir override map.tiles.dir.
	load := func(cmd *cobra.Command) (tilesConfig, error) {
		cfg, err := readTilesConfig(v)
		if err != nil {
			return cfg, err
		}

		if cmd.Flags().Changed("dir") {
			cfg.dir = dir
		}

		return cfg, nil
	}

	tilesCmd.AddCommand(
		&cobra.Command{
			Use:   "download",
			Short: "Download or update the tile archives (about 2.5 GB the first time)",
			Long: `Downloads the base and relief archives from swisstopo into the tile directory. An archive that is
already up to date is skipped, an interrupted download is resumed, and an older version is replaced
once the new one is complete and checked. Progress is logged.`,
			Args: cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				cfg, err := load(cmd)
				if err != nil {
					return err
				}

				report, err := newTileSyncService(cfg).Sync(cmd.Context())
				if err != nil {
					return err
				}

				failed := 0

				for _, ts := range report.Tilesets {
					line := fmt.Sprintf("%-26s %s", ts.Tileset, ts.Outcome)
					if ts.Bytes > 0 {
						line += " (" + humanSize(ts.Bytes) + " downloaded)"
					}

					if ts.Err != nil {
						failed++
						line += ": " + ts.Err.Error()
					}

					cmd.Println(line)
				}

				if failed > 0 {
					return fmt.Errorf("%d of %d tilesets could not be updated", failed, len(report.Tilesets))
				}

				return nil
			},
		},
		&cobra.Command{
			Use:   "status",
			Short: "Show the installed archives and whether swisstopo has a newer version",
			Args:  cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				cfg, err := load(cmd)
				if err != nil {
					return err
				}

				statuses, err := newTileSyncService(cfg).Status(cmd.Context())
				if err != nil {
					return err
				}

				cmd.Printf("tile directory: %s\n\n", cfg.dir)

				for _, st := range statuses {
					cmd.Println(st.Tileset)
					cmd.Printf("  installed:    %s\n", installedText(st))
					cmd.Printf("  upstream:     %s\n", upstreamText(st))

					if st.PartSize > 0 {
						cmd.Printf("  partial file: %s (resumed by the next download)\n", humanSize(st.PartSize))
					}
				}

				return nil
			},
		},
		&cobra.Command{
			Use:   "prune",
			Short: "Remove archives and partial downloads that are no longer needed",
			Long: `Removes the archives of tilesets that are not served any more, partial downloads older than
map.tiles.part-max-age, and orphaned bookkeeping files. Other files in the tile directory are never touched.`,
			Args: cobra.NoArgs,
			RunE: func(cmd *cobra.Command, _ []string) error {
				cfg, err := load(cmd)
				if err != nil {
					return err
				}

				removed, err := newTileSyncService(cfg).Prune(cmd.Context())
				if err != nil {
					return err
				}

				if len(removed) == 0 {
					cmd.Println("nothing to remove")

					return nil
				}

				var total int64

				for _, f := range removed {
					total += f.Size

					cmd.Printf("removed %s (%s)\n", f.Path, humanSize(f.Size))
				}

				cmd.Printf("%d files, %s freed\n", len(removed), humanSize(total))

				return nil
			},
		},
	)

	return tilesCmd
}

func installedText(st inbound.TilesetStatus) string {
	if !st.Installed {
		return "no (the map uses swisstopo online)"
	}

	s := humanSize(st.LocalSize)
	if !st.DownloadedAt.IsZero() {
		s += ", downloaded " + st.DownloadedAt.Local().Format("2006-01-02 15:04")
	}

	if st.LocalETag == "" {
		s += ", version unknown (not downloaded by sitrep)"
	}

	return s
}

func upstreamText(st inbound.TilesetStatus) string {
	switch {
	case st.RemoteErr != "":
		return "unreachable: " + st.RemoteErr
	case st.UpToDate:
		return "up to date"
	case st.Installed:
		return "a different version is available (" + humanSize(st.RemoteSize) + "); run `sitrep tiles download`"
	default:
		return humanSize(st.RemoteSize) + " available; run `sitrep tiles download`"
	}
}

func humanSize(n int64) string {
	const unit = 1024

	if n < unit {
		return fmt.Sprintf("%d B", n)
	}

	div, exp := int64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}

	return strings.TrimSuffix(fmt.Sprintf("%.1f", float64(n)/float64(div)), ".0") + " " + string("KMGT"[exp]) + "iB"
}

// logTilesAtStartup reports, once, which tilesets are served from local archives and how old
// they are, so an operator sees at a glance whether the map works offline.
func logTilesAtStartup(ctx context.Context, svc inbound.TileService, cfg tilesConfig) {
	for _, l := range svc.LocalStatus(ctx) {
		switch {
		case l.Err != nil:
			slog.WarnContext(ctx, "local tile archive cannot be used; tile requests for it will fail",
				slog.String("tileset", l.Tileset.String()),
				slog.String("dir", cfg.dir),
				slog.String("error", l.Err.Error()))
		case l.Ready:
			slog.InfoContext(ctx, "serving map tiles from local archive",
				slog.String("tileset", l.Tileset.String()),
				slog.String("size", humanSize(l.Size)),
				slog.Time("installed_at", l.InstalledAt),
				slog.String("age", humanAge(time.Since(l.InstalledAt))),
				slog.Bool("auto_download", cfg.autoDownload))
		case cfg.autoDownload:
			slog.InfoContext(ctx, "no local tile archive yet, downloading it in the background; "+
				"the map uses swisstopo online until it is ready",
				slog.String("tileset", l.Tileset.String()),
				slog.String("dir", cfg.dir),
				slog.Bool("auto_download", true))
		default:
			slog.InfoContext(ctx, "no local tile archive, the map uses swisstopo online",
				slog.String("tileset", l.Tileset.String()),
				slog.String("dir", cfg.dir),
				slog.Bool("auto_download", false),
				slog.String("hint", "run `sitrep tiles download` or set map.tiles.auto-download"))
		}
	}
}

// humanAge renders a duration as minutes, hours or days, whichever reads best.
func humanAge(d time.Duration) string {
	switch {
	case d < time.Hour:
		return fmt.Sprintf("%d minutes", int(d.Minutes()))
	case d < 48*time.Hour:
		return fmt.Sprintf("%d hours", int(d.Hours()))
	default:
		return fmt.Sprintf("%d days", int(d.Hours()/24))
	}
}

// updaterJitter is the random delay before the updater's first run. It spreads the load on
// swisstopo when many instances start together, which only matters for routine update checks:
// when an archive is missing the first download is wanted right away, because the map is
// running on swisstopo until it is there.
func updaterJitter(local []inbound.TilesetLocal) time.Duration {
	for _, l := range local {
		if !l.Ready {
			return 0
		}
	}

	return time.Minute
}
