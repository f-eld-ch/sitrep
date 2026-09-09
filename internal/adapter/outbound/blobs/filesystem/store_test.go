package filesystem_test

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/filesystem"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func newStore(t *testing.T) *filesystem.Store {
	t.Helper()
	s, err := filesystem.New(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	return s
}

func validKey(t *testing.T) string {
	t.Helper()
	return blobkey.ForAttachment(uuid.New(), uuid.New())
}

func TestFilesystemStore_RoundTrip(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	key := validKey(t)
	content := "hello attachment"

	require.NoError(t, s.Put(ctx, key, strings.NewReader(content), int64(len(content)), "text/plain"))

	rc, err := s.Get(ctx, key)
	require.NoError(t, err)

	t.Cleanup(func() { _ = rc.Close() })

	got, err := io.ReadAll(rc)
	require.NoError(t, err)
	assert.Equal(t, content, string(got))
}

func TestFilesystemStore_GetMissing(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	_, err := s.Get(ctx, validKey(t))
	require.ErrorIs(t, err, outbound.ErrBlobNotFound)
}

func TestFilesystemStore_Overwrite(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	key := validKey(t)

	require.NoError(t, s.Put(ctx, key, strings.NewReader("v1"), 2, "text/plain"))
	require.NoError(t, s.Put(ctx, key, strings.NewReader("v2"), 2, "text/plain"))

	rc, err := s.Get(ctx, key)
	require.NoError(t, err)

	t.Cleanup(func() { _ = rc.Close() })

	got, err := io.ReadAll(rc)
	require.NoError(t, err)
	assert.Equal(t, "v2", string(got))
}

func TestFilesystemStore_DeleteIdempotent(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	key := validKey(t)

	require.NoError(t, s.Put(ctx, key, strings.NewReader("x"), 1, "text/plain"))
	require.NoError(t, s.Delete(ctx, key))
	// Second delete should not error.
	require.NoError(t, s.Delete(ctx, key))

	_, err := s.Get(ctx, key)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound)
}

func TestFilesystemStore_DeletePrefix(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	incA := uuid.New()
	incB := uuid.New()
	keyA1 := blobkey.ForAttachment(incA, uuid.New())
	keyA2 := blobkey.ForAttachment(incA, uuid.New())
	keyB := blobkey.ForAttachment(incB, uuid.New())

	for _, k := range []string{keyA1, keyA2, keyB} {
		require.NoError(t, s.Put(ctx, k, strings.NewReader("data"), 4, "text/plain"))
	}

	require.NoError(t, s.DeletePrefix(ctx, blobkey.PrefixForIncident(incA)))

	_, err := s.Get(ctx, keyA1)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound, "keyA1 should be deleted")
	_, err = s.Get(ctx, keyA2)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound, "keyA2 should be deleted")

	rc, err := s.Get(ctx, keyB)
	require.NoError(t, err, "keyB should survive")

	_ = rc.Close()
}

func TestFilesystemStore_DeletePrefixIdempotent(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	prefix := blobkey.PrefixForIncident(uuid.New())
	// Delete on non-existent prefix must not error.
	require.NoError(t, s.DeletePrefix(ctx, prefix))
}

func TestFilesystemStore_InvalidKey(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()

	bad := []string{
		"",
		"relative/only",
		"incidents/not-a-uuid/not-a-uuid",
		"../../etc/passwd",
	}

	for _, k := range bad {
		t.Run(k, func(t *testing.T) {
			require.Error(t, s.Put(ctx, k, strings.NewReader("x"), 1, "text/plain"))
		})
	}
}

func TestFilesystemStore_RangeRead(t *testing.T) {
	s := newStore(t)
	ctx := context.Background()
	key := validKey(t)
	content := "0123456789"

	require.NoError(t, s.Put(ctx, key, strings.NewReader(content), int64(len(content)), "text/plain"))

	rc, err := s.Get(ctx, key)
	require.NoError(t, err)

	t.Cleanup(func() { _ = rc.Close() })

	// Seek to offset 5 — simulates a Range read.
	_, err = rc.Seek(5, io.SeekStart)
	require.NoError(t, err)

	got, err := io.ReadAll(rc)
	require.NoError(t, err)
	assert.Equal(t, "56789", string(got))
}

func TestFilesystemStore_SymlinkCannotEscapeRoot(t *testing.T) {
	tmpDir := t.TempDir()
	s, err := filesystem.New(tmpDir)
	require.NoError(t, err)

	t.Cleanup(func() { _ = s.Close() })

	ctx := context.Background()
	incID := uuid.New()
	attID := uuid.New()

	// Plant a symlink inside the store tree pointing outside.
	escapedDir := t.TempDir()
	escapedFile := filepath.Join(escapedDir, "secret")
	require.NoError(t, os.WriteFile(escapedFile, []byte("secret data"), 0o600))

	// Create the expected directory structure manually.
	incDir := filepath.Join(tmpDir, "incidents", incID.String())
	require.NoError(t, os.MkdirAll(incDir, 0o700))

	// Plant symlink where the attachment file would be.
	linkPath := filepath.Join(incDir, attID.String())
	require.NoError(t, os.Symlink(escapedFile, linkPath))

	key := blobkey.ForAttachment(incID, attID)

	// Put goes through tmp/ + Rename. The rename replaces the symlink with a
	// regular file — it does NOT follow the symlink to overwrite the target.
	// The secret file must be untouched regardless of whether Put errors.
	_ = s.Put(ctx, key, strings.NewReader("attacker"), 8, "text/plain")

	// Critical assertion: the file outside the store root is never written.
	data, readErr := os.ReadFile(escapedFile) //nolint:gosec // test reads a known temp file path
	require.NoError(t, readErr)
	assert.Equal(t, "secret data", string(data), "file outside store root must not be modified")
}
