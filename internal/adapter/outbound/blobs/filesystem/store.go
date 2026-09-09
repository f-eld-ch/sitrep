// Package filesystem implements outbound.BlobStore using the local filesystem.
//
// The store holds an *os.Root opened at construction time; all filesystem
// operations are confined within that root — symlinks pointing outside the
// root and path traversal are rejected at the kernel level.
//
// On-disk layout under the root:
//
//	tmp/                      in-flight writes (same filesystem for atomic rename)
//	incidents/<uuid>/<uuid>   committed blobs (no extension — filename lives in the read model)
//
// Write path: create in tmp/ → stream → Sync → Rename into place → clean tmp on error.
// A startup sweep removes tmp/ entries older than one hour (crash residue).
package filesystem

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.BlobStore = (*Store)(nil)

const (
	dirPerm  = 0o700
	filePerm = 0o600
	tmpDir   = "tmp"
	tmpStale = time.Hour
)

// Store is a filesystem-backed BlobStore. It must be created via New and
// closed via Close when no longer needed.
type Store struct {
	root    *os.Root
	rootDir string
}

// New opens (and validates) rootDir as a confined attachment root.
// The directory is created with mode 0700 if it does not exist.
// Close must be called on the returned Store.
func New(rootDir string) (*Store, error) {
	if err := os.MkdirAll(rootDir, dirPerm); err != nil {
		return nil, fmt.Errorf("filesystem blob store: create root %q: %w", rootDir, err)
	}

	root, err := os.OpenRoot(rootDir)
	if err != nil {
		return nil, fmt.Errorf("filesystem blob store: open root %q: %w", rootDir, err)
	}

	s := &Store{root: root, rootDir: rootDir}
	s.sweepTmp()

	return s, nil
}

// Close releases the root directory file descriptor.
func (s *Store) Close() error {
	return s.root.Close()
}

// Put streams r into the store at key. The write is atomic: data lands in tmp/
// and is renamed into place only after Sync. Any error leaves no partial file.
func (s *Store) Put(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	incID, attID, err := blobkey.Parse(key)
	if err != nil {
		return err
	}

	// Ensure destination directory exists.
	destDir := filepath.Join("incidents", incID.String())
	if err := s.root.MkdirAll(destDir, dirPerm); err != nil {
		return fmt.Errorf("filesystem blob store: mkdir %q: %w", destDir, err)
	}

	// Create tmp dir.
	if err := s.root.MkdirAll(tmpDir, dirPerm); err != nil {
		return fmt.Errorf("filesystem blob store: mkdir tmp: %w", err)
	}

	// Write to a temp file inside tmp/.
	tmpName := filepath.Join(tmpDir, attID.String()+".tmp")

	f, err := s.root.OpenFile(tmpName, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, filePerm)
	if err != nil {
		return fmt.Errorf("filesystem blob store: create tmp file: %w", err)
	}

	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		_ = s.root.Remove(tmpName)
		return fmt.Errorf("filesystem blob store: write: %w", err)
	}

	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = s.root.Remove(tmpName)
		return fmt.Errorf("filesystem blob store: sync: %w", err)
	}

	if err := f.Close(); err != nil {
		_ = s.root.Remove(tmpName)
		return fmt.Errorf("filesystem blob store: close: %w", err)
	}

	destPath := filepath.Join(destDir, attID.String())
	if err := s.root.Rename(tmpName, destPath); err != nil {
		_ = s.root.Remove(tmpName)
		return fmt.Errorf("filesystem blob store: rename: %w", err)
	}

	return nil
}

// Get opens the blob at key for reading. The caller must Close the returned value.
// Returns outbound.ErrBlobNotFound when the key does not exist.
func (s *Store) Get(_ context.Context, key string) (io.ReadSeekCloser, error) {
	incID, attID, err := blobkey.Parse(key)
	if err != nil {
		return nil, err
	}

	path := filepath.Join("incidents", incID.String(), attID.String())

	f, err := s.root.Open(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, outbound.ErrBlobNotFound
		}

		return nil, fmt.Errorf("filesystem blob store: open %q: %w", key, err)
	}

	return f, nil
}

// Delete removes the blob at key. It is idempotent.
func (s *Store) Delete(_ context.Context, key string) error {
	incID, attID, err := blobkey.Parse(key)
	if err != nil {
		return err
	}

	path := filepath.Join("incidents", incID.String(), attID.String())

	if err := s.root.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("filesystem blob store: delete %q: %w", key, err)
	}

	return nil
}

// DeletePrefix removes all blobs under the given incident prefix.
// prefix must have the form "incidents/<incidentUUID>/".
func (s *Store) DeletePrefix(_ context.Context, prefix string) error {
	incID, err := blobkey.ParsePrefix(prefix)
	if err != nil {
		return err
	}

	dir := filepath.Join("incidents", incID.String())

	if err := s.root.RemoveAll(dir); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("filesystem blob store: delete prefix %q: %w", prefix, err)
	}

	return nil
}

// sweepTmp removes tmp/ entries older than tmpStale to clean up crash residue.
func (s *Store) sweepTmp() {
	cutoff := time.Now().Add(-tmpStale)

	entries, err := fs.ReadDir(os.DirFS(filepath.Join(s.rootDir, tmpDir)), ".")
	if err != nil {
		return
	}

	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			name := filepath.Join(tmpDir, e.Name())
			if err := s.root.Remove(name); err != nil {
				slog.Warn("filesystem blob store: failed to sweep stale tmp file",
					slog.String("name", name), slog.String("err", err.Error()))
			}
		}
	}
}
