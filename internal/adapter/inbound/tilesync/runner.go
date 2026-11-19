// Package tilesync is the driving adapter that keeps the local tile archives up to date:
// it calls TileSyncService on start and then at a fixed interval, like the projector's
// background loops. It is only started when map.tiles.auto-download is enabled.
package tilesync

import (
	"context"
	"errors"
	"log/slog"
	"math/rand/v2"
	"strings"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// Runner runs TileSyncService periodically.
type Runner struct {
	svc      inbound.TileSyncService
	interval time.Duration
	jitter   time.Duration
	log      *slog.Logger
	after    func(context.Context)
}

// New returns a Runner that syncs every interval. The first run starts after a random delay
// of up to jitter, so many instances starting together do not hit swisstopo at the same moment.
func New(svc inbound.TileSyncService, interval, jitter time.Duration) *Runner {
	return &Runner{svc: svc, interval: interval, jitter: jitter, log: slog.Default().WithGroup("tilesync")}
}

// AfterSync sets a function that runs after every sync run (whatever its outcome). The server
// uses it to switch to a freshly downloaded archive right away.
func (r *Runner) AfterSync(f func(context.Context)) *Runner {
	r.after = f

	return r
}

// Run blocks until ctx is cancelled.
func (r *Runner) Run(ctx context.Context) {
	r.log.InfoContext(ctx, "tile updater started", slog.Duration("interval", r.interval))

	if r.jitter > 0 {
		if !sleep(ctx, rand.N(r.jitter)) { //nolint:gosec // spreading load, not security
			return
		}
	}

	for {
		r.runOnce(ctx)

		if !sleep(ctx, r.interval) {
			r.log.InfoContext(context.WithoutCancel(ctx), "tile updater stopped")

			return
		}
	}
}

func (r *Runner) runOnce(ctx context.Context) {
	// Remove leftovers first so a full disk does not block the download.
	if _, err := r.svc.Prune(ctx); err != nil && !errors.Is(err, context.Canceled) {
		r.log.WarnContext(ctx, "tile cleanup failed", slog.String("error", err.Error()))
	}

	report, err := r.svc.Sync(ctx)

	if r.after != nil {
		defer r.after(ctx)
	}

	switch {
	case errors.Is(err, inbound.ErrSyncInProgress):
		r.log.DebugContext(ctx, "tile sync already running, skipping")
	case err != nil:
		if !errors.Is(err, context.Canceled) {
			r.log.WarnContext(ctx, "tile sync failed", slog.String("error", err.Error()))
		}
	default:
		r.logSummary(ctx, report)

		for _, ts := range report.Tilesets {
			if ts.Outcome == inbound.SyncFailed || ts.Outcome == inbound.SyncSkippedDiskSpace {
				r.log.WarnContext(ctx, "tileset not updated, will retry",
					slog.String("tileset", ts.Tileset.String()),
					slog.String("outcome", string(ts.Outcome)),
					slog.String("error", errorText(ts.Err)))
			}
		}
	}
}

// errorText is err's message; a tileset outcome that should carry an error but does not is
// reported as unknown instead of crashing the updater.
func errorText(err error) string {
	if err == nil {
		return "unknown"
	}

	return err.Error()
}

// sleep waits for d or until ctx is cancelled; it reports whether the full time passed.
func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// logSummary logs one line per run, so a quiet "up to date" run is still visible.
func (r *Runner) logSummary(ctx context.Context, report inbound.SyncReport) {
	parts := make([]string, 0, len(report.Tilesets))
	for _, ts := range report.Tilesets {
		parts = append(parts, ts.Tileset.Name+"="+string(ts.Outcome))
	}

	r.log.InfoContext(ctx, "tile sync finished",
		slog.String("result", strings.Join(parts, " ")),
		slog.Duration("next_check_in", r.interval))
}
