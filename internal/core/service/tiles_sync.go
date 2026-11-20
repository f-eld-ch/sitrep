package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ inbound.TileSyncService = (*TileSyncService)(nil)

const (
	// diskHeadroom is the extra free space required on top of the bytes still to download.
	diskHeadroomDivisor = 10 // 10 %
	// progressStepPercent is how many percent of the download pass between progress log lines.
	progressStepPercent = 10
)

// TileSyncService downloads the swisstopo archives and keeps them up to date.
//
// Per tileset there is at most one installed archive and one partial download on disk: an
// update is downloaded under a temporary name and atomically replaces the old archive, so old
// versions never pile up.
type TileSyncService struct {
	upstream   outbound.TileUpstream
	archive    outbound.TileArchive
	partMaxAge time.Duration
	tracer     trace.Tracer
	runs       metric.Int64Counter
	bytes      metric.Int64Counter
	size       metric.Int64Gauge
	log        *slog.Logger

	running sync.Mutex
}

// NewTileSyncService builds a TileSyncService. Partial downloads older than partMaxAge are
// removed by Prune.
func NewTileSyncService(
	upstream outbound.TileUpstream,
	archive outbound.TileArchive,
	partMaxAge time.Duration,
) *TileSyncService {
	meter := otel.Meter("sitrep/service")
	runs, _ := meter.Int64Counter("tiles.sync.runs",
		metric.WithDescription("Tile archive sync runs per tileset by outcome"),
		metric.WithUnit("{run}"))
	bytes, _ := meter.Int64Counter("tiles.sync.bytes",
		metric.WithDescription("Bytes downloaded while syncing tile archives"),
		metric.WithUnit("By"))
	size, _ := meter.Int64Gauge("tiles.local.size",
		metric.WithDescription("Size of the installed tile archive per tileset"),
		metric.WithUnit("By"))

	return &TileSyncService{
		upstream:   upstream,
		archive:    archive,
		partMaxAge: partMaxAge,
		tracer:     otel.Tracer("github.com/f-eld-ch/sitrep/service"),
		runs:       runs,
		bytes:      bytes,
		size:       size,
		log:        slog.Default().WithGroup("tilesync"),
	}
}

// Sync implements inbound.TileSyncService.
func (s *TileSyncService) Sync(ctx context.Context) (inbound.SyncReport, error) {
	if !s.running.TryLock() {
		return inbound.SyncReport{}, inbound.ErrSyncInProgress
	}
	defer s.running.Unlock()

	ctx, span := s.tracer.Start(ctx, "TileSyncService.Sync")
	defer span.End()

	var report inbound.SyncReport

	for _, ts := range maptile.Supported {
		if ctx.Err() != nil {
			span.RecordError(ctx.Err())
			span.SetStatus(codes.Error, ctx.Err().Error())

			return report, ctx.Err()
		}

		report.Tilesets = append(report.Tilesets, s.syncTileset(ctx, ts))
	}

	return report, nil
}

func (s *TileSyncService) syncTileset(ctx context.Context, ts maptile.Tileset) inbound.TilesetSync {
	ctx, span := s.tracer.Start(ctx, "TileSyncService.syncTileset",
		trace.WithAttributes(attribute.String("tileset", ts.String())))
	defer span.End()

	res := s.doSync(ctx, ts, span)

	span.SetAttributes(
		attribute.String("tiles.outcome", string(res.Outcome)),
		attribute.Int64("tiles.bytes", res.Bytes),
	)

	if res.Err != nil {
		span.RecordError(res.Err)
		span.SetStatus(codes.Error, res.Err.Error())
	}

	s.runs.Add(ctx, 1, metric.WithAttributes(
		attribute.String("tileset", ts.String()), attribute.String("outcome", string(res.Outcome))))

	if res.Bytes > 0 {
		s.bytes.Add(ctx, res.Bytes, metric.WithAttributes(attribute.String("tileset", ts.String())))
	}

	if local, err := s.archive.Local(ctx, ts); err == nil && local.Present {
		s.size.Record(ctx, local.Size, metric.WithAttributes(attribute.String("tileset", ts.String())))
	}

	return res
}

func (s *TileSyncService) doSync(ctx context.Context, ts maptile.Tileset, span trace.Span) inbound.TilesetSync {
	fail := func(err error, what string) inbound.TilesetSync {
		if !errors.Is(err, context.Canceled) {
			s.log.WarnContext(ctx, "tile sync failed",
				slog.String("tileset", ts.String()), slog.String("step", what), slog.String("error", err.Error()))
		}

		return inbound.TilesetSync{Tileset: ts, Outcome: inbound.SyncFailed, Err: fmt.Errorf("%s: %w", what, err)}
	}

	remote, err := s.upstream.Head(ctx, ts)
	if err != nil {
		return fail(err, "check upstream")
	}

	local, err := s.archive.Local(ctx, ts)
	if err != nil {
		return fail(err, "read local archive")
	}

	span.SetAttributes(
		attribute.String("tiles.remote_etag", remote.ETag),
		attribute.String("tiles.local_etag", local.ETag),
	)

	if local.Present && local.ETag != "" && local.ETag == remote.ETag {
		s.log.DebugContext(ctx, "tileset up to date", slog.String("tileset", ts.String()))

		return inbound.TilesetSync{Tileset: ts, Outcome: inbound.SyncUpToDate}
	}

	part, err := s.archive.Part(ctx, ts)
	if err != nil {
		return fail(err, "read partial download")
	}

	// Resume only a part of this exact version that is not complete yet.
	var offset int64
	if part.Present && part.ETag == remote.ETag && part.Size > 0 && part.Size < remote.Size {
		offset = part.Size
	}

	if err := s.checkDiskSpace(ctx, ts, remote.Size-offset); err != nil {
		return inbound.TilesetSync{Tileset: ts, Outcome: inbound.SyncSkippedDiskSpace, Err: err}
	}

	return s.download(ctx, ts, remote, offset, fail)
}

func (s *TileSyncService) checkDiskSpace(ctx context.Context, ts maptile.Tileset, need int64) error {
	free, err := s.archive.FreeSpace(ctx)
	if err != nil {
		s.log.WarnContext(ctx, "cannot determine free disk space, downloading anyway",
			slog.String("error", err.Error()))

		return nil
	}

	required := uint64(max(need, 0))
	required += required / diskHeadroomDivisor

	if free < required {
		s.log.WarnContext(ctx, "not enough free disk space for the tile archive, keeping the current one",
			slog.String("tileset", ts.String()),
			slog.Int64("free_bytes", int64(free)),         //nolint:gosec // disk sizes fit int64
			slog.Int64("required_bytes", int64(required)), //nolint:gosec // disk sizes fit int64
		)

		return fmt.Errorf("need %d bytes, %d free", required, free)
	}

	return nil
}

func (s *TileSyncService) download(
	ctx context.Context,
	ts maptile.Tileset,
	remote outbound.RemoteTileInfo,
	offset int64,
	fail func(error, string) inbound.TilesetSync,
) inbound.TilesetSync {
	fetch, err := s.upstream.Fetch(ctx, ts, offset, remote.ETag)
	if err != nil {
		return fail(err, "start download")
	}

	defer func() { _ = fetch.Body.Close() }()

	w, err := s.archive.OpenPart(ctx, ts, fetch.ETag, fetch.Size, fetch.Resumed)
	if err != nil {
		return fail(err, "open partial download")
	}

	start := time.Now()

	s.log.InfoContext(ctx, "downloading tile archive",
		slog.String("tileset", ts.String()),
		slog.Int64("size_bytes", fetch.Size),
		slog.Bool("resumed", fetch.Resumed))

	pw := &progressWriter{w: w, ctx: ctx, log: s.log, ts: ts, total: fetch.Size}
	if fetch.Resumed {
		pw.done = offset
	}

	// The next line is due at the next full step above where the download starts.
	pw.nextPercent = pw.percent()/progressStepPercent*progressStepPercent + progressStepPercent

	// Never accept more than the server announced: a lying server must not fill the disk.
	remaining := fetch.Size - pw.done

	n, copyErr := io.Copy(pw, io.LimitReader(fetch.Body, remaining+1))
	if copyErr == nil && n > remaining {
		copyErr = fmt.Errorf("server sent more than the announced %d bytes", fetch.Size)
	}

	closeErr := w.Close()

	// A broken connection leaves the part in place; the next run resumes it.
	if copyErr != nil {
		return inbound.TilesetSync{
			Tileset: ts, Outcome: inbound.SyncFailed, Bytes: n,
			Err: fmt.Errorf("download: %w", copyErr),
		}
	}

	if closeErr != nil {
		return fail(closeErr, "flush partial download")
	}

	info := outbound.RemoteTileInfo{ETag: fetch.ETag, Size: fetch.Size, LastModified: remote.LastModified}
	if err := s.archive.Commit(ctx, ts, info); err != nil {
		if errors.Is(err, outbound.ErrInvalidArchive) {
			// A bad file must not be resumed again.
			_ = s.archive.DiscardPart(ctx, ts)
		}

		return inbound.TilesetSync{
			Tileset: ts, Outcome: inbound.SyncFailed, Bytes: n,
			Err: fmt.Errorf("install: %w", err),
		}
	}

	outcome := inbound.SyncDownloaded
	if fetch.Resumed {
		outcome = inbound.SyncResumed
	}

	s.log.InfoContext(ctx, "tile archive installed; the map serves it locally from now on",
		slog.String("tileset", ts.String()),
		slog.Int64("downloaded_bytes", n),
		slog.Duration("duration", time.Since(start).Round(time.Second)),
		slog.String("etag", fetch.ETag))

	return inbound.TilesetSync{Tileset: ts, Outcome: outcome, Bytes: n}
}

// Status implements inbound.TileSyncService.
func (s *TileSyncService) Status(ctx context.Context) ([]inbound.TilesetStatus, error) {
	ctx, span := s.tracer.Start(ctx, "TileSyncService.Status")
	defer span.End()

	out := make([]inbound.TilesetStatus, 0, len(maptile.Supported))

	for _, ts := range maptile.Supported {
		st := inbound.TilesetStatus{Tileset: ts}

		local, err := s.archive.Local(ctx, ts)
		if err != nil {
			span.RecordError(err)
			recordSpanError(span, err)

			return nil, err
		}

		st.Installed = local.Present
		st.LocalETag = local.ETag
		st.LocalSize = local.Size
		st.DownloadedAt = local.DownloadedAt

		if part, err := s.archive.Part(ctx, ts); err == nil && part.Present {
			st.PartSize = part.Size
		}

		if remote, err := s.upstream.Head(ctx, ts); err != nil {
			st.RemoteErr = err.Error()
		} else {
			st.RemoteETag = remote.ETag
			st.RemoteSize = remote.Size
			st.UpToDate = local.Present && local.ETag != "" && local.ETag == remote.ETag
		}

		out = append(out, st)
	}

	return out, nil
}

// Prune implements inbound.TileSyncService.
func (s *TileSyncService) Prune(ctx context.Context) ([]inbound.PrunedFile, error) {
	ctx, span := s.tracer.Start(ctx, "TileSyncService.Prune")
	defer span.End()

	removed, err := s.archive.Prune(ctx, maptile.Supported, s.partMaxAge)
	if err != nil {
		span.RecordError(err)
		recordSpanError(span, err)
		logIfUnexpected(ctx, "TileSyncService.Prune", err)

		return nil, err
	}

	out := make([]inbound.PrunedFile, 0, len(removed))
	for _, f := range removed {
		s.log.InfoContext(ctx, "removed stale tile file", slog.String("path", f.Path), slog.Int64("size_bytes", f.Size))

		out = append(out, inbound.PrunedFile{Path: f.Path, Size: f.Size})
	}

	span.SetAttributes(attribute.Int("tiles.pruned", len(out)))

	return out, nil
}

// progressWriter logs the download progress in steps of progressStepPercent.
type progressWriter struct {
	w           io.Writer
	ctx         context.Context //nolint:containedctx // only used for log correlation
	log         *slog.Logger
	ts          maptile.Tileset
	total       int64
	done        int64
	nextPercent int
}

// percent returns how much of the archive is done, 0 to 100.
func (p *progressWriter) percent() int {
	if p.total <= 0 {
		return 0
	}

	return int(min(p.done*100/p.total, 100))
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.w.Write(b)
	p.done += int64(n)

	if pct := p.percent(); pct >= p.nextPercent {
		p.log.InfoContext(p.ctx, "tile archive download progress",
			slog.String("tileset", p.ts.String()),
			slog.String("progress", strconv.Itoa(pct)+"%"),
			slog.Int64("done_bytes", p.done),
			slog.Int64("total_bytes", p.total))

		p.nextPercent = pct/progressStepPercent*progressStepPercent + progressStepPercent
	}

	return n, err
}
