package filesystem_test

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/filesystem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// errReader fails after handing out its prefix.
type errReader struct {
	prefix string
	err    error
}

func (r *errReader) Read(p []byte) (int, error) {
	if r.prefix == "" {
		return 0, r.err
	}

	n := copy(p, r.prefix)
	r.prefix = r.prefix[n:]

	return n, nil
}

func newStoreAt(t *testing.T) (*filesystem.Store, string) {
	t.Helper()

	dir := t.TempDir()
	s, err := filesystem.New(dir)
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	return s, dir
}

// skipIfRoot skips tests that rely on file permissions, which root ignores.
func skipIfRoot(t *testing.T) {
	t.Helper()

	if os.Geteuid() == 0 {
		t.Skip("file permissions do not apply to root")
	}
}

func tmpEntries(t *testing.T, dir string) []string {
	t.Helper()

	entries, err := os.ReadDir(filepath.Join(dir, "tmp"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}

	require.NoError(t, err)

	names := make([]string, len(entries))
	for i, e := range entries {
		names[i] = e.Name()
	}

	return names
}

func TestNew_CreatesRootWithPrivatePermissions(t *testing.T) {
	root := filepath.Join(t.TempDir(), "a", "b")

	s, err := filesystem.New(root)
	require.NoError(t, err)
	require.NoError(t, s.Close())

	info, err := os.Stat(root)
	require.NoError(t, err)
	assert.True(t, info.IsDir())
	assert.Equal(t, os.FileMode(0o700), info.Mode().Perm())
}

func TestNew_FailsWhenRootCannotBeCreated(t *testing.T) {
	file := filepath.Join(t.TempDir(), "file")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o600))

	_, err := filesystem.New(filepath.Join(file, "root"))
	require.ErrorContains(t, err, "create root")

	_, err = filesystem.New(file)
	require.Error(t, err, "a file is no root directory")
}

func TestNew_SweepsStaleTmpFilesOnly(t *testing.T) {
	dir := t.TempDir()
	tmp := filepath.Join(dir, "tmp")
	require.NoError(t, os.MkdirAll(tmp, 0o700))

	stale := filepath.Join(tmp, "stale.tmp")
	fresh := filepath.Join(tmp, "fresh.tmp")

	require.NoError(t, os.WriteFile(stale, []byte("old"), 0o600))
	require.NoError(t, os.WriteFile(fresh, []byte("new"), 0o600))

	old := time.Now().Add(-2 * time.Hour)
	require.NoError(t, os.Chtimes(stale, old, old))

	s, err := filesystem.New(dir)
	require.NoError(t, err)
	require.NoError(t, s.Close())

	assert.Equal(t, []string{"fresh.tmp"}, tmpEntries(t, dir), "crash residue older than an hour is removed")
}

func TestNew_SurvivesATmpFileItCannotSweep(t *testing.T) {
	skipIfRoot(t)

	dir := t.TempDir()
	tmp := filepath.Join(dir, "tmp")
	require.NoError(t, os.MkdirAll(tmp, 0o700))

	stale := filepath.Join(tmp, "stale.tmp")
	require.NoError(t, os.WriteFile(stale, []byte("old"), 0o600))

	old := time.Now().Add(-2 * time.Hour)
	require.NoError(t, os.Chtimes(stale, old, old))
	require.NoError(t, os.Chmod(tmp, 0o500)) //nolint:gosec // a directory needs its execute bit

	t.Cleanup(func() { _ = os.Chmod(tmp, 0o700) }) //nolint:gosec // a directory needs its execute bit

	s, err := filesystem.New(dir)
	require.NoError(t, err, "a failed sweep only logs a warning")
	require.NoError(t, s.Close())

	assert.Equal(t, []string{"stale.tmp"}, tmpEntries(t, dir))
}

func TestPut_RejectsOversizedBlobsWithoutLeavingFiles(t *testing.T) {
	s, dir := newStoreAt(t)
	key := validKey(t)

	err := s.Put(t.Context(), key, strings.NewReader("0123456789"), 4, "text/plain")
	require.ErrorIs(t, err, outbound.ErrBlobTooLarge)

	_, err = s.Get(t.Context(), key)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound, "an oversized blob is never committed")
	assert.Empty(t, tmpEntries(t, dir), "the partial upload is removed")

	// Exactly the declared size is fine.
	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("0123"), 4, "text/plain"))
}

func TestPut_UnboundedAndEmptyBlobs(t *testing.T) {
	s, dir := newStoreAt(t)

	read := func(key string) string {
		rc, err := s.Get(t.Context(), key)
		require.NoError(t, err)

		defer func() { _ = rc.Close() }()

		b, err := io.ReadAll(rc)
		require.NoError(t, err)

		return string(b)
	}

	unbounded := validKey(t)
	require.NoError(t, s.Put(t.Context(), unbounded, strings.NewReader(strings.Repeat("x", 4096)), -1, ""))
	assert.Len(t, read(unbounded), 4096, "a negative size hint means no limit")

	empty := validKey(t)
	require.NoError(t, s.Put(t.Context(), empty, strings.NewReader(""), 0, ""))
	assert.Empty(t, read(empty))

	assert.Empty(t, tmpEntries(t, dir), "committed blobs leave nothing behind in tmp")
}

func TestPut_ReaderFailureLeavesNothing(t *testing.T) {
	s, dir := newStoreAt(t)
	key := validKey(t)
	boom := errors.New("connection reset")

	err := s.Put(t.Context(), key, &errReader{prefix: "partial", err: boom}, -1, "text/plain")
	require.ErrorIs(t, err, boom)
	require.ErrorContains(t, err, "write")

	_, err = s.Get(t.Context(), key)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound)
	assert.Empty(t, tmpEntries(t, dir))
}

func TestPut_FailsWhenTheTreeCannotBeCreated(t *testing.T) {
	t.Run("incidents is a file", func(t *testing.T) {
		s, dir := newStoreAt(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, "incidents"), []byte("x"), 0o600))

		err := s.Put(t.Context(), validKey(t), strings.NewReader("x"), 1, "")
		require.ErrorContains(t, err, "mkdir")
	})

	t.Run("tmp is a file", func(t *testing.T) {
		s, dir := newStoreAt(t)
		require.NoError(t, os.WriteFile(filepath.Join(dir, "tmp"), []byte("x"), 0o600))

		err := s.Put(t.Context(), validKey(t), strings.NewReader("x"), 1, "")
		require.ErrorContains(t, err, "mkdir tmp")
	})

	t.Run("destination is a non-empty directory", func(t *testing.T) {
		s, dir := newStoreAt(t)
		incident, attachment := uuid.New(), uuid.New()
		blocker := filepath.Join(dir, "incidents", incident.String(), attachment.String())
		require.NoError(t, os.MkdirAll(filepath.Join(blocker, "child"), 0o700))

		err := s.Put(t.Context(), blobkey.ForAttachment(incident, attachment), strings.NewReader("x"), 1, "")
		require.ErrorContains(t, err, "rename")
		assert.Empty(t, tmpEntries(t, dir), "a failed rename removes the tmp file")
	})
}

func TestKeyedOperationsRejectInvalidKeys(t *testing.T) {
	s := newStore(t)

	for _, key := range []string{"", "incidents/x/y", "incidents/" + uuid.NewString(), "../../etc/passwd"} {
		t.Run(key, func(t *testing.T) {
			_, err := s.Get(t.Context(), key)
			require.ErrorIs(t, err, shared.ErrInvalidInput)

			require.ErrorIs(t, s.Delete(t.Context(), key), shared.ErrInvalidInput)
		})
	}

	for _, prefix := range []string{"", "incidents/", "incidents/not-a-uuid/", "other/" + uuid.NewString() + "/"} {
		t.Run("prefix "+prefix, func(t *testing.T) {
			require.ErrorIs(t, s.DeletePrefix(t.Context(), prefix), shared.ErrInvalidInput)
		})
	}
}

func TestGet_ReportsOtherFailuresAsErrors(t *testing.T) {
	skipIfRoot(t)

	s, dir := newStoreAt(t)
	incident, attachment := uuid.New(), uuid.New()
	incDir := filepath.Join(dir, "incidents", incident.String())
	require.NoError(t, os.MkdirAll(incDir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(incDir, attachment.String()), []byte("x"), 0o600))
	require.NoError(t, os.Chmod(incDir, 0o000))

	t.Cleanup(func() { _ = os.Chmod(incDir, 0o700) }) //nolint:gosec // a directory needs its execute bit

	_, err := s.Get(t.Context(), blobkey.ForAttachment(incident, attachment))
	require.Error(t, err)
	require.NotErrorIs(t, err, outbound.ErrBlobNotFound, "a permission problem is not a missing blob")
	require.ErrorContains(t, err, "open")
}

func TestDelete_ReportsFailuresButIgnoresMissingBlobs(t *testing.T) {
	s, dir := newStoreAt(t)
	incident, attachment := uuid.New(), uuid.New()
	key := blobkey.ForAttachment(incident, attachment)

	require.NoError(t, s.Delete(t.Context(), key), "deleting what is not there is fine")

	// A directory in the place of the blob cannot be removed with Remove once it has content.
	blocker := filepath.Join(dir, "incidents", incident.String(), attachment.String())
	require.NoError(t, os.MkdirAll(filepath.Join(blocker, "child"), 0o700))

	require.ErrorContains(t, s.Delete(t.Context(), key), "delete")
}

func TestDeletePrefix_ReportsFailures(t *testing.T) {
	skipIfRoot(t)

	s, dir := newStoreAt(t)
	incident := uuid.New()
	locked := filepath.Join(dir, "incidents", incident.String(), "sub")
	require.NoError(t, os.MkdirAll(locked, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(locked, "blob"), []byte("x"), 0o600))
	require.NoError(t, os.Chmod(locked, 0o500)) //nolint:gosec // a directory needs its execute bit

	t.Cleanup(func() { _ = os.Chmod(locked, 0o700) }) //nolint:gosec // a directory needs its execute bit

	require.ErrorContains(t, s.DeletePrefix(t.Context(), blobkey.PrefixForIncident(incident)), "delete prefix")
}

func TestDeletePrefix_RemovesOnlyThatIncident(t *testing.T) {
	s := newStore(t)
	keep, drop := uuid.New(), uuid.New()
	keepKey := blobkey.ForAttachment(keep, uuid.New())
	dropKeys := []string{blobkey.ForAttachment(drop, uuid.New()), blobkey.ForAttachment(drop, uuid.New())}

	require.NoError(t, s.Put(t.Context(), keepKey, strings.NewReader("keep"), 4, ""))

	for _, k := range dropKeys {
		require.NoError(t, s.Put(t.Context(), k, strings.NewReader("drop"), 4, ""))
	}

	require.NoError(t, s.DeletePrefix(t.Context(), blobkey.PrefixForIncident(drop)))

	for _, k := range dropKeys {
		_, err := s.Get(t.Context(), k)
		require.ErrorIs(t, err, outbound.ErrBlobNotFound)
	}

	rc, err := s.Get(t.Context(), keepKey)
	require.NoError(t, err)
	require.NoError(t, rc.Close())
}
