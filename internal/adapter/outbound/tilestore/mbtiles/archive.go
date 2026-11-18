package mbtiles

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.TileArchive = (*Archive)(nil)

const (
	extMeta     = ".meta.json"     // sidecar of an installed archive
	extPart     = ".part"          // partial download
	extPartMeta = ".part.json"     // sidecar of a partial download
	extTmp      = ".meta.json.tmp" // sidecar being written
	flushEvery  = 64 << 20         // fsync and drop page cache every 64 MiB of a download
	dirMode     = 0o750
	fileMode    = 0o640
	tmpMaxAge   = time.Hour // a sidecar temp file older than this is a leftover
)

func archivePath(dir string, ts maptile.Tileset) string {
	return filepath.Join(dir, ts.Name, ts.Version, ts.Name+".mbtiles")
}

// sidecar is stored next to an archive (or a part) to remember which upstream version it is.
type sidecar struct {
	ETag         string    `json:"etag"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"last_modified,omitzero"`
	DownloadedAt time.Time `json:"downloaded_at,omitzero"`
	// ModTime is the archive file's modification time when it was installed. A file replaced by
	// hand (even by one of the same size, as SQLite files are whole pages) no longer matches.
	ModTime time.Time `json:"mod_time,omitzero"`
}

// Archive installs MBTiles archives into <dir>/<tileset>/<version>/ and keeps that directory tidy.
// Per tileset it manages exactly these files, and nothing else:
//
//	<name>.mbtiles              the installed archive
//	<name>.mbtiles.meta.json    its upstream ETag and size
//	<name>.mbtiles.part         a partial download
//	<name>.mbtiles.part.json    the ETag the partial download belongs to
type Archive struct {
	dir string
}

// NewArchive returns an Archive writing below dir. The directory is created on first use.
func NewArchive(dir string) *Archive {
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}

	return &Archive{dir: dir}
}

func (a *Archive) path(ts maptile.Tileset) string     { return archivePath(a.dir, ts) }
func (a *Archive) metaPath(ts maptile.Tileset) string { return a.path(ts) + extMeta }
func (a *Archive) partPath(ts maptile.Tileset) string { return a.path(ts) + extPart }
func (a *Archive) partMetaPath(ts maptile.Tileset) string {
	return a.path(ts) + extPartMeta
}

func readSidecar(path string) (sidecar, bool) {
	b, err := os.ReadFile(path) //nolint:gosec // built from a validated tileset below the configured directory
	if err != nil {
		return sidecar{}, false
	}

	var s sidecar
	if json.Unmarshal(b, &s) != nil {
		return sidecar{}, false
	}

	return s, true
}

func writeSidecar(path string, s sidecar) error {
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}

	return os.WriteFile(path, b, fileMode)
}

// Local implements outbound.TileArchive.
func (a *Archive) Local(_ context.Context, ts maptile.Tileset) (outbound.LocalTileInfo, error) {
	if err := ts.Validate(); err != nil {
		return outbound.LocalTileInfo{}, err
	}

	fi, err := os.Stat(a.path(ts))
	if errors.Is(err, fs.ErrNotExist) {
		return outbound.LocalTileInfo{}, nil
	}

	if err != nil {
		return outbound.LocalTileInfo{}, err
	}

	info := outbound.LocalTileInfo{Present: true, Size: fi.Size(), DownloadedAt: fi.ModTime()}

	// A file without a matching sidecar (copied in by hand) has an unknown upstream version.
	if sc, ok := readSidecar(a.metaPath(ts)); ok && sc.Size == fi.Size() && sc.ModTime.Equal(fi.ModTime()) {
		info.ETag = sc.ETag
		info.DownloadedAt = sc.DownloadedAt
	}

	return info, nil
}

// Part implements outbound.TileArchive.
func (a *Archive) Part(_ context.Context, ts maptile.Tileset) (outbound.PartInfo, error) {
	if err := ts.Validate(); err != nil {
		return outbound.PartInfo{}, err
	}

	fi, err := os.Stat(a.partPath(ts))
	if errors.Is(err, fs.ErrNotExist) {
		return outbound.PartInfo{}, nil
	}

	if err != nil {
		return outbound.PartInfo{}, err
	}

	info := outbound.PartInfo{Present: true, Size: fi.Size(), ModTime: fi.ModTime()}
	if sc, ok := readSidecar(a.partMetaPath(ts)); ok {
		info.ETag = sc.ETag
	}

	return info, nil
}

// OpenPart implements outbound.TileArchive.
func (a *Archive) OpenPart(
	_ context.Context,
	ts maptile.Tileset,
	etag string,
	size int64,
	resume bool,
) (io.WriteCloser, error) {
	if err := ts.Validate(); err != nil {
		return nil, err
	}

	if err := os.MkdirAll(filepath.Dir(a.path(ts)), dirMode); err != nil {
		return nil, err
	}

	flags := os.O_WRONLY | os.O_CREATE

	if resume {
		sc, ok := readSidecar(a.partMetaPath(ts))
		if !ok || sc.ETag != etag {
			return nil, outbound.ErrUpstreamChanged
		}
	} else {
		flags |= os.O_TRUNC
	}

	// The sidecar is written first, so a part is never without the version it belongs to.
	if err := writeSidecar(a.partMetaPath(ts), sidecar{ETag: etag, Size: size}); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(a.partPath(ts), flags, fileMode)
	if err != nil {
		return nil, err
	}

	off, err := f.Seek(0, io.SeekEnd)
	if err != nil {
		_ = f.Close()

		return nil, err
	}

	return &partWriter{f: f, off: off, flushedTo: off}, nil
}

// partWriter flushes to disk and drops the page cache as it goes, so downloading a gigabyte
// does not make the container's memory (page cache is charged to it) look full.
type partWriter struct {
	f         *os.File
	off       int64
	flushedTo int64
}

func (w *partWriter) Write(b []byte) (int, error) {
	n, err := w.f.Write(b)
	w.off += int64(n)

	if err == nil && w.off-w.flushedTo >= flushEvery {
		err = w.flush()
	}

	return n, err
}

func (w *partWriter) flush() error {
	if err := w.f.Sync(); err != nil {
		return err
	}

	dropCache(w.f, w.flushedTo, w.off-w.flushedTo)
	w.flushedTo = w.off

	return nil
}

func (w *partWriter) Close() error {
	flushErr := w.flush()

	return errors.Join(flushErr, w.f.Close())
}

// Commit implements outbound.TileArchive.
func (a *Archive) Commit(ctx context.Context, ts maptile.Tileset, remote outbound.RemoteTileInfo) error {
	if err := ts.Validate(); err != nil {
		return err
	}

	part := a.partPath(ts)

	fi, err := os.Stat(part)
	if err != nil {
		return fmt.Errorf("%w: %w", outbound.ErrInvalidArchive, err)
	}

	if fi.Size() != remote.Size {
		return fmt.Errorf("%w: size %d, expected %d", outbound.ErrInvalidArchive, fi.Size(), remote.Size)
	}

	if err := validate(ctx, part, fi); err != nil {
		return fmt.Errorf("%w: %w", outbound.ErrInvalidArchive, err)
	}

	// Sidecar first (under a temporary name), then the archive, then the sidecar: a crash
	// in between leaves a file whose sidecar does not match, which is simply downloaded again.
	tmp := a.path(ts) + extTmp
	if err := writeSidecar(tmp, sidecar{
		ETag: remote.ETag, Size: remote.Size, LastModified: remote.LastModified,
		DownloadedAt: time.Now().UTC(), ModTime: fi.ModTime(),
	}); err != nil {
		return err
	}

	if err := os.Rename(part, a.path(ts)); err != nil {
		_ = os.Remove(tmp)

		return err
	}

	if err := os.Rename(tmp, a.metaPath(ts)); err != nil {
		return err
	}

	_ = os.Remove(a.partMetaPath(ts))

	return nil
}

// validate checks that path is a readable MBTiles archive: it has metadata and a tiles view.
func validate(ctx context.Context, path string, fi os.FileInfo) error {
	e, err := open(ctx, path, fi)
	if err != nil {
		return err
	}
	defer func() { _ = e.close() }()

	var one int

	err = e.db.QueryRowContext(ctx, `SELECT 1 FROM tiles LIMIT 1`).Scan(&one)
	if err != nil {
		return fmt.Errorf("no tiles: %w", err)
	}

	return nil
}

// DiscardPart implements outbound.TileArchive.
func (a *Archive) DiscardPart(_ context.Context, ts maptile.Tileset) error {
	if err := ts.Validate(); err != nil {
		return err
	}

	return errors.Join(removeIfExists(a.partPath(ts)), removeIfExists(a.partMetaPath(ts)))
}

func removeIfExists(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	return nil
}

// FreeSpace implements outbound.TileArchive.
func (a *Archive) FreeSpace(_ context.Context) (uint64, error) {
	// The directory may not exist yet: ask the nearest existing parent, which is on the same volume.
	p := a.dir

	for {
		if _, err := os.Stat(p); err == nil {
			return diskFree(p)
		}

		parent := filepath.Dir(p)
		if parent == p {
			return 0, fmt.Errorf("no existing parent of %s", a.dir)
		}

		p = parent
	}
}

// Prune implements outbound.TileArchive. It only ever removes the files listed on Archive,
// inside <dir>/<name>/<version>/ directories.
func (a *Archive) Prune(
	_ context.Context,
	keep []maptile.Tileset,
	partMaxAge time.Duration,
) ([]outbound.PrunedFile, error) {
	var removed []outbound.PrunedFile

	names, err := os.ReadDir(a.dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	kept := make(map[maptile.Tileset]bool, len(keep))
	for _, ts := range keep {
		kept[ts] = true
	}

	now := time.Now()

	for _, nameDir := range names {
		if !nameDir.IsDir() {
			continue
		}

		versions, err := os.ReadDir(filepath.Join(a.dir, nameDir.Name()))
		if err != nil {
			return removed, err
		}

		for _, versionDir := range versions {
			if !versionDir.IsDir() {
				continue
			}

			ts := maptile.Tileset{Name: nameDir.Name(), Version: versionDir.Name()}

			got, err := a.pruneDir(ts, kept[ts], partMaxAge, now)
			removed = append(removed, got...)

			if err != nil {
				return removed, err
			}
		}
	}

	return removed, nil
}

func (a *Archive) pruneDir(
	ts maptile.Tileset,
	supported bool,
	partMaxAge time.Duration,
	now time.Time,
) ([]outbound.PrunedFile, error) {
	dir := filepath.Dir(a.path(ts))

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	base := ts.Name + ".mbtiles"
	have := map[string]bool{}

	for _, e := range entries {
		have[e.Name()] = true
	}

	var removed []outbound.PrunedFile

	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, base) {
			continue
		}

		var remove bool

		switch name {
		case base: // the installed archive
			remove = !supported
		case base + extMeta:
			remove = !supported || !have[base]
		case base + extPartMeta:
			remove = !supported || !have[base+extPart]
		case base + extPart, base + extTmp:
			remove = !supported ||
				stale(e, now, map[string]time.Duration{base + extPart: partMaxAge, base + extTmp: tmpMaxAge}[name])
		default:
			continue // not one of ours
		}

		if !remove {
			continue
		}

		path := filepath.Join(dir, name)

		var size int64
		if fi, err := e.Info(); err == nil {
			size = fi.Size()
		}

		if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return removed, err
		}

		removed = append(removed, outbound.PrunedFile{Path: path, Size: size})

		// Later entries (a part's sidecar sorts after the part) see this file as gone.
		delete(have, name)
	}

	// Drop the directories of a tileset that is gone, when they are now empty.
	if !supported {
		if os.Remove(dir) == nil {
			_ = os.Remove(filepath.Dir(dir))
		}
	}

	return removed, nil
}

// stale reports whether e was last written more than age ago.
func stale(e fs.DirEntry, now time.Time, age time.Duration) bool {
	fi, err := e.Info()
	if err != nil {
		return false
	}

	return now.Sub(fi.ModTime()) > age
}
