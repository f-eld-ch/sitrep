package sqlite_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
)

func TestOpen_ConfiguresReadAndWriteHandles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "dir", "test.db")

	read, write, err := sqlite.Open(t.Context(), path)
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = read.Close()
		_ = write.Close()
	})

	_, err = os.Stat(path)
	require.NoError(t, err, "the database file and its parent directories are created")

	_, err = write.ExecContext(t.Context(), `CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL) STRICT`)
	require.NoError(t, err)
	_, err = write.ExecContext(t.Context(), `INSERT INTO t (v) VALUES ('hello')`)
	require.NoError(t, err)

	var v string

	require.NoError(t, read.QueryRowContext(t.Context(), `SELECT v FROM t`).Scan(&v))
	assert.Equal(t, "hello", v, "the read handle sees what the write handle committed")

	_, err = read.ExecContext(t.Context(), `INSERT INTO t (v) VALUES ('nope')`)
	require.Error(t, err, "the read handle is read-only")
	assert.Contains(t, err.Error(), "readonly")

	assert.Equal(t, 1, write.Stats().MaxOpenConnections, "writes go through a single connection")
	assert.Equal(t, 4, read.Stats().MaxOpenConnections)

	var mode string

	require.NoError(t, write.QueryRowContext(t.Context(), `SELECT journal_mode FROM pragma_journal_mode`).Scan(&mode))
	assert.Equal(t, "wal", mode)

	var fk int

	require.NoError(t, write.QueryRowContext(t.Context(), `PRAGMA foreign_keys`).Scan(&fk))
	assert.Equal(t, 1, fk, "foreign keys are enforced")
}

func TestOpen_PathWithQuestionMarkCannotInjectOptions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "evil?_pragma=query_only(1).db")

	read, write, err := sqlite.Open(t.Context(), path)
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = read.Close()
		_ = write.Close()
	})

	_, err = write.ExecContext(t.Context(), `CREATE TABLE t (id INTEGER PRIMARY KEY) STRICT`)
	require.NoError(t, err, "the path is data: it must not turn the writer read-only")

	_, err = os.Stat(path)
	require.NoError(t, err, "the file carries the literal name")
}

func TestOpen_FailsWhenTheDirectoryCannotBeCreated(t *testing.T) {
	file := filepath.Join(t.TempDir(), "file")
	require.NoError(t, os.WriteFile(file, []byte("x"), 0o600))

	_, _, err := sqlite.Open(t.Context(), filepath.Join(file, "sub", "test.db"))
	require.ErrorContains(t, err, "create parent directory")
}

func TestOpen_FailsWhenTheDatabaseCannotBeOpened(t *testing.T) {
	dir := t.TempDir()

	// A directory in place of the database file cannot be opened as a database.
	_, _, err := sqlite.Open(t.Context(), dir)
	require.Error(t, err)
}

func TestCheckpointTruncate(t *testing.T) {
	read, write, err := sqlite.Open(t.Context(), filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = read.Close() })

	_, err = write.ExecContext(t.Context(), `CREATE TABLE t (v TEXT) STRICT`)
	require.NoError(t, err)

	require.NoError(t, sqlite.CheckpointTruncate(t.Context(), write))

	require.NoError(t, write.Close())
	require.Error(t, sqlite.CheckpointTruncate(t.Context(), write), "a closed handle cannot be checkpointed")
}

func TestTime_ValueIsFixedWidthUTC(t *testing.T) {
	zone := time.FixedZone("CEST", 2*60*60)
	ts := sqlite.Time{V: time.Date(2026, 3, 1, 12, 0, 0, 5, zone)}

	v, err := ts.Value()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-01T10:00:00.000000005Z", v)
}

func TestTime_ScanRejectsBadInput(t *testing.T) {
	tests := []struct {
		name string
		src  any
		want string
	}{
		{"unparsable string", "yesterday", "parse"},
		{"unparsable bytes", []byte("yesterday"), "parse"},
		{"wrong layout", "2026-03-01T10:00:00Z", "parse"},
		{"unsupported type", 42, "unsupported type"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ts sqlite.Time

			require.ErrorContains(t, ts.Scan(tt.src), tt.want)
		})
	}

	var nt sqlite.NullTime

	require.Error(t, nt.Scan("yesterday"), "NullTime reports a bad value as well")
	assert.Nil(t, nt.V)
}

func TestTime_ScanTimeAndNil(t *testing.T) {
	zone := time.FixedZone("CEST", 2*60*60)

	var ts sqlite.Time

	require.NoError(t, ts.Scan(time.Date(2026, 3, 1, 12, 0, 0, 0, zone)))
	assert.Equal(t, time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC), ts.V)
	assert.Equal(t, time.UTC, ts.V.Location())

	require.NoError(t, ts.Scan(nil))
	assert.True(t, ts.V.IsZero())
}

func TestUUID_ScanRejectsBadInput(t *testing.T) {
	var u sqlite.UUID

	require.ErrorContains(t, u.Scan("not-a-uuid"), "parse")
	require.ErrorContains(t, u.Scan([]byte("not-a-uuid")), "parse")
	require.ErrorContains(t, u.Scan(42), "unsupported type")

	var n sqlite.NullUUID

	require.Error(t, n.Scan("not-a-uuid"))
	assert.Nil(t, n.V)
}

func TestUUIDs_ValueAndScanRoundTrip(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	ids := sqlite.UUIDs{a, b}

	v, err := ids.Value()
	require.NoError(t, err)
	assert.JSONEq(t, `["`+a.String()+`","`+b.String()+`"]`, v.(string))

	var out sqlite.UUIDs

	require.NoError(t, out.Scan([]byte(v.(string))))
	assert.Equal(t, sqlite.UUIDs{a, b}, out)

	empty := sqlite.UUIDs{}
	v, err = empty.Value()
	require.NoError(t, err)
	assert.Equal(t, "[]", v, "an empty list is an empty array, never null")

	var nilIDs sqlite.UUIDs

	v, err = nilIDs.Value()
	require.NoError(t, err)
	assert.Equal(t, "[]", v)
}

func TestUUIDs_ScanRejectsBadInput(t *testing.T) {
	tests := []struct {
		name string
		src  any
		want string
	}{
		{"not json", "nope", "unmarshal"},
		{"not an array of strings", `{"a":1}`, "unmarshal"},
		{"not a uuid", `["nope"]`, "parse element"},
		{"unsupported type", 7, "unsupported type"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var u sqlite.UUIDs

			require.ErrorContains(t, u.Scan(tt.src), tt.want)
		})
	}
}
