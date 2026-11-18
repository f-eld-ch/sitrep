// Package mbtiles implements outbound.TileStore on top of MBTiles archives
// (SQLite files) in a local directory. Archives are only ever read: they are
// opened immutable and query-only, and replaced by renaming a new file over the
// old one, which the store notices and swaps in.
package mbtiles

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.TileStore = (*Store)(nil)

const (
	// statInterval is how often the archive file is checked for a replacement.
	statInterval = 30 * time.Second
	// closeGrace is how long a replaced archive stays open for in-flight reads.
	closeGrace = 30 * time.Second
	// maxConns caps the read pool. Read-only connections don't contend, and a
	// small pool outperformed a large one under 150 parallel requests.
	maxConns = 4
	// cacheKiB is SQLite's per-connection page cache. Kept small on purpose: the OS
	// page cache does the work and memory is billed in containers.
	cacheKiB = 4096
)

// Store reads tiles from <dir>/<name>/<version>/<name>.mbtiles.
type Store struct {
	dir       string
	statEvery time.Duration

	mu      sync.RWMutex
	entries map[maptile.Tileset]*entry
}

type entry struct {
	db      *sql.DB
	stmt    *sql.Stmt
	info    outbound.TileArchiveInfo
	file    os.FileInfo
	checked atomic.Int64 // unix nanoseconds of the last stat; read without the store lock
}

// New returns a Store reading archives below dir. The directory need not exist yet.
func New(dir string) *Store {
	// SQLite URIs need an absolute path: a relative one such as ./.tiles would be parsed as
	// file://.tiles/... with ".tiles" as the host.
	if abs, err := filepath.Abs(dir); err == nil {
		dir = abs
	}

	return &Store{dir: dir, statEvery: statInterval, entries: make(map[maptile.Tileset]*entry)}
}

// Path returns where the archive for ts lives.
func (s *Store) Path(ts maptile.Tileset) string {
	return filepath.Join(s.dir, ts.Name, ts.Version, ts.Name+".mbtiles")
}

// Info implements outbound.TileStore.
func (s *Store) Info(ctx context.Context, ts maptile.Tileset) (outbound.TileArchiveInfo, error) {
	e, err := s.entry(ctx, ts)
	if err != nil {
		return outbound.TileArchiveInfo{}, err
	}

	return e.info, nil
}

// Tile implements outbound.TileStore.
func (s *Store) Tile(ctx context.Context, ts maptile.Tileset, c maptile.Coord) ([]byte, error) {
	e, err := s.entry(ctx, ts)
	if err != nil {
		return nil, err
	}

	var data []byte

	err = e.stmt.QueryRowContext(ctx, c.Z, c.X, c.TMSRow()).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, maptile.ErrTileNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("read tile %s %d/%d/%d: %w", ts, c.Z, c.X, c.Y, err)
	}

	return data, nil
}

// Close releases every open archive.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var errs []error

	for ts, e := range s.entries {
		errs = append(errs, e.close())

		delete(s.entries, ts)
	}

	return errors.Join(errs...)
}

// entry returns the open archive for ts, opening or replacing it when the file
// appeared or changed. The file is stat'ed at most once per statInterval.
func (s *Store) entry(ctx context.Context, ts maptile.Tileset) (*entry, error) {
	now := time.Now()

	s.mu.RLock()
	e := s.entries[ts]
	s.mu.RUnlock()

	if e != nil && e.fresh(now, s.statEvery) {
		return e, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	e = s.entries[ts]
	if e != nil && e.fresh(now, s.statEvery) {
		return e, nil
	}

	path := s.Path(ts)

	fi, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		if e != nil {
			delete(s.entries, ts)
			e.closeLater()
		}

		return nil, outbound.ErrTilesetNotAvailable
	}

	if err != nil {
		return nil, fmt.Errorf("stat %s: %w", path, err)
	}

	if e != nil && sameFile(e.file, fi) {
		e.checked.Store(now.UnixNano())

		return e, nil
	}

	fresh, err := open(ctx, path, fi)
	if err != nil {
		return nil, err
	}

	fresh.checked.Store(now.UnixNano())
	s.entries[ts] = fresh

	if e != nil {
		e.closeLater()
	}

	return fresh, nil
}

func sameFile(a, b os.FileInfo) bool {
	return os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}

func (e *entry) close() error {
	return errors.Join(e.stmt.Close(), e.db.Close())
}

// closeLater closes a replaced archive after in-flight reads had time to finish.
func (e *entry) closeLater() {
	time.AfterFunc(closeGrace, func() { _ = e.close() })
}

func dsn(path string) string {
	u := url.URL{Scheme: "file", Path: path}
	q := url.Values{}
	q.Set("mode", "ro")
	q.Set("immutable", "1")
	q.Add("_pragma", "query_only(1)")
	q.Add("_pragma", "cache_size(-"+strconv.Itoa(cacheKiB)+")")
	u.RawQuery = q.Encode()

	return u.String()
}

func open(ctx context.Context, path string, fi os.FileInfo) (*entry, error) {
	db, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	n := min(runtime.GOMAXPROCS(0), maxConns)
	db.SetMaxOpenConns(n)
	db.SetMaxIdleConns(n)
	db.SetConnMaxLifetime(0)

	info, err := readInfo(ctx, db)
	if err != nil {
		_ = db.Close()

		return nil, fmt.Errorf("read metadata of %s: %w", path, err)
	}

	info.ETag = fmt.Sprintf(`"%x-%x"`, fi.ModTime().UnixNano(), fi.Size())

	stmt, err := db.PrepareContext(
		ctx,
		`SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`,
	)
	if err != nil {
		_ = db.Close()

		return nil, fmt.Errorf("prepare tile query for %s: %w", path, err)
	}

	return &entry{db: db, stmt: stmt, info: info, file: fi}, nil
}

// readInfo builds the TileJSON fields from the MBTiles metadata table.
func readInfo(ctx context.Context, db *sql.DB) (outbound.TileArchiveInfo, error) {
	rows, err := db.QueryContext(ctx, `SELECT name, value FROM metadata`)
	if err != nil {
		return outbound.TileArchiveInfo{}, err
	}
	defer func() { _ = rows.Close() }()

	md := map[string]string{}

	for rows.Next() {
		var name, value string
		if err := rows.Scan(&name, &value); err != nil {
			return outbound.TileArchiveInfo{}, err
		}

		md[name] = value
	}

	if err := rows.Err(); err != nil {
		return outbound.TileArchiveInfo{}, err
	}

	tj := maptile.TileJSON{
		Name:        md["name"],
		Description: md["description"],
		Version:     md["version"],
		Format:      md["format"],
		MinZoom:     atoi(md["minzoom"], 0),
		MaxZoom:     atoi(md["maxzoom"], 14),
		Bounds:      floats(md["bounds"]),
		Center:      floats(md["center"]),
	}

	if raw := md["json"]; raw != "" {
		var j struct {
			VectorLayers json.RawMessage `json:"vector_layers"`
		}
		if err := json.Unmarshal([]byte(raw), &j); err == nil {
			tj.VectorLayers = j.VectorLayers
		}
	}

	return outbound.TileArchiveInfo{TileJSON: tj}, nil
}

func atoi(s string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return def
	}

	return n
}

func floats(s string) []float64 {
	if s == "" {
		return nil
	}

	var out []float64

	for p := range strings.SplitSeq(s, ",") {
		f, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
		if err != nil {
			return nil
		}

		out = append(out, f)
	}

	return out
}

// fresh reports whether the archive file was checked less than every ago.
func (e *entry) fresh(now time.Time, every time.Duration) bool {
	return now.Sub(time.Unix(0, e.checked.Load())) < every
}
