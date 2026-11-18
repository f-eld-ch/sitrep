// Package inmem implements outbound.TileStore in memory for tests.
package inmem

import (
	"context"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.TileStore = (*Store)(nil)

// Store holds archives in memory. A tileset without an archive is unavailable.
type Store struct {
	mu       sync.RWMutex
	archives map[maptile.Tileset]*archive
}

type archive struct {
	etag  string
	json  maptile.TileJSON
	tiles map[maptile.Coord][]byte
}

// New returns an empty Store.
func New() *Store { return &Store{archives: make(map[maptile.Tileset]*archive)} }

// Put installs (or replaces) the archive for ts. Tiles are keyed by XYZ coordinate.
func (s *Store) Put(ts maptile.Tileset, etag string, tj maptile.TileJSON, tiles map[maptile.Coord][]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.archives[ts] = &archive{etag: etag, json: tj, tiles: tiles}
}

// Remove deletes the archive for ts.
func (s *Store) Remove(ts maptile.Tileset) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.archives, ts)
}

// Info implements outbound.TileStore.
func (s *Store) Info(_ context.Context, ts maptile.Tileset) (outbound.TileArchiveInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	a, ok := s.archives[ts]
	if !ok {
		return outbound.TileArchiveInfo{}, outbound.ErrTilesetNotAvailable
	}

	return outbound.TileArchiveInfo{ETag: a.etag, TileJSON: a.json}, nil
}

// Tile implements outbound.TileStore.
func (s *Store) Tile(_ context.Context, ts maptile.Tileset, c maptile.Coord) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	a, ok := s.archives[ts]
	if !ok {
		return nil, outbound.ErrTilesetNotAvailable
	}

	data, ok := a.tiles[c]
	if !ok {
		return nil, maptile.ErrTileNotFound
	}

	return data, nil
}

// Refresh implements outbound.TileStore; an in-memory store is always current.
func (s *Store) Refresh(context.Context) {}
