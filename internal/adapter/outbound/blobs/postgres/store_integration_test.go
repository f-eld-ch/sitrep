//go:build integration

package postgres_test

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

func newStore(t *testing.T) *postgres.Store {
	t.Helper()

	return postgres.New(pgtest.Pool(t))
}

func validKey() string { return blobkey.ForAttachment(uuid.New(), uuid.New()) }

func read(t *testing.T, s *postgres.Store, key string) string {
	t.Helper()

	rc, err := s.Get(t.Context(), key)
	require.NoError(t, err)

	defer func() { require.NoError(t, rc.Close()) }()

	got, err := io.ReadAll(rc)
	require.NoError(t, err)

	return string(got)
}

func TestStore_RoundTrip(t *testing.T) {
	s := newStore(t)
	key := validKey()

	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("hello attachment"), 16, "text/plain"))
	assert.Equal(t, "hello attachment", read(t, s, key))
}

func TestStore_BinaryDataSurvivesUnchanged(t *testing.T) {
	s := newStore(t)
	key := validKey()

	// Every byte value, so an encoding or NUL-handling problem would show.
	data := make([]byte, 256)
	for i := range data {
		data[i] = byte(i)
	}

	require.NoError(t, s.Put(t.Context(), key, bytes.NewReader(data), int64(len(data)), "application/octet-stream"))
	assert.Equal(t, string(data), read(t, s, key))
}

func TestStore_GetMissing(t *testing.T) {
	s := newStore(t)

	_, err := s.Get(t.Context(), validKey())
	require.ErrorIs(t, err, outbound.ErrBlobNotFound)
}

func TestStore_PutOverwritesAndKeepsMetadata(t *testing.T) {
	pool := pgtest.Pool(t)
	s := postgres.New(pool)
	key := validKey()

	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("first"), 5, "text/plain"))
	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("second version"), 14, "image/png"),
		"a retried upload is idempotent")

	assert.Equal(t, "second version", read(t, s, key))

	var (
		contentType string
		size        int64
		rows        int
	)

	require.NoError(t, pool.QueryRow(t.Context(),
		`SELECT content_type, size, (SELECT count(*) FROM blobstore.blob) FROM blobstore.blob WHERE key = $1`, key).
		Scan(&contentType, &size, &rows))
	assert.Equal(t, "image/png", contentType)
	assert.EqualValues(t, 14, size, "the stored size is the real size, not the advisory argument")
	assert.Equal(t, 1, rows, "overwriting must not add a row")
}

func TestStore_PutIgnoresWrongAdvisorySize(t *testing.T) {
	pool := pgtest.Pool(t)
	s := postgres.New(pool)
	key := validKey()

	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("abc"), 9999, "text/plain"))

	var size int64
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT size FROM blobstore.blob WHERE key = $1`, key).Scan(&size))
	assert.EqualValues(t, 3, size)
}

func TestStore_PutRejectsOversizedPayload(t *testing.T) {
	pool := pgtest.Pool(t)
	s := postgres.New(pool)
	key := validKey()

	// One byte over the limit, whatever size the caller declares.
	big := io.LimitReader(zeroReader{}, message.MaxAttachmentSize+1)

	require.Error(t, s.Put(t.Context(), key, big, 1, "application/octet-stream"))

	var rows int
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM blobstore.blob`).Scan(&rows))
	assert.Zero(t, rows, "a rejected upload must leave nothing behind")
}

func TestStore_PutAtTheLimitIsAccepted(t *testing.T) {
	s := newStore(t)
	key := validKey()

	require.NoError(
		t,
		s.Put(t.Context(), key, io.LimitReader(zeroReader{}, message.MaxAttachmentSize), 1, "application/octet-stream"),
	)

	rc, err := s.Get(t.Context(), key)
	require.NoError(t, err)

	defer func() { _ = rc.Close() }()

	n, err := io.Copy(io.Discard, rc)
	require.NoError(t, err)
	assert.EqualValues(t, message.MaxAttachmentSize, n)
}

func TestStore_RangeRead(t *testing.T) {
	s := newStore(t)
	key := validKey()

	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("0123456789"), 10, "text/plain"))

	rc, err := s.Get(t.Context(), key)
	require.NoError(t, err)

	defer func() { _ = rc.Close() }()

	// http.ServeContent seeks for Range requests.
	_, err = rc.Seek(5, io.SeekStart)
	require.NoError(t, err)

	got, err := io.ReadAll(rc)
	require.NoError(t, err)
	assert.Equal(t, "56789", string(got))
}

func TestStore_DeleteIsIdempotent(t *testing.T) {
	s := newStore(t)
	key := validKey()

	require.NoError(t, s.Put(t.Context(), key, strings.NewReader("x"), 1, "text/plain"))
	require.NoError(t, s.Delete(t.Context(), key))

	_, err := s.Get(t.Context(), key)
	require.ErrorIs(t, err, outbound.ErrBlobNotFound)

	require.NoError(t, s.Delete(t.Context(), key), "deleting a missing blob is not an error")
}

func TestStore_DeletePrefixOnlyRemovesThatIncident(t *testing.T) {
	s := newStore(t)

	incA, incB := uuid.New(), uuid.New()
	a1, a2, b := blobkey.ForAttachment(
		incA,
		uuid.New(),
	), blobkey.ForAttachment(
		incA,
		uuid.New(),
	), blobkey.ForAttachment(
		incB,
		uuid.New(),
	)

	for _, k := range []string{a1, a2, b} {
		require.NoError(t, s.Put(t.Context(), k, strings.NewReader("data"), 4, "text/plain"))
	}

	require.NoError(t, s.DeletePrefix(t.Context(), blobkey.PrefixForIncident(incA)))

	for _, k := range []string{a1, a2} {
		_, err := s.Get(t.Context(), k)
		require.ErrorIs(t, err, outbound.ErrBlobNotFound, "blobs of the deleted incident must be gone")
	}

	assert.Equal(t, "data", read(t, s, b), "another incident's blob must survive")

	require.NoError(t, s.DeletePrefix(t.Context(), blobkey.PrefixForIncident(uuid.New())),
		"an unknown prefix is not an error")
}

func TestStore_RejectsInvalidKeys(t *testing.T) {
	s := newStore(t)

	for _, k := range []string{"", "relative/only", "incidents/not-a-uuid/not-a-uuid", "../../etc/passwd"} {
		t.Run(k, func(t *testing.T) {
			require.Error(t, s.Put(t.Context(), k, strings.NewReader("x"), 1, "text/plain"))

			_, err := s.Get(t.Context(), k)
			require.Error(t, err)
			require.NotErrorIs(t, err, outbound.ErrBlobNotFound, "a malformed key is invalid, not missing")

			require.Error(t, s.Delete(t.Context(), k))
		})
	}

	for _, p := range []string{"", "incidents/", "incidents/not-a-uuid/", "../"} {
		require.Error(t, s.DeletePrefix(t.Context(), p), "prefix %q", p)
	}
}

// zeroReader yields endless zero bytes without allocating the payload up front.
type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }
