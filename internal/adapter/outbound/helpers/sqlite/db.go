// Package sqlitex provides shared codecs, connection helpers, and type
// adapters for the SQLite storage backend. It has no dependencies on any
// specific adapter package and may be imported by the event store, read-model
// queries, projection handlers, and the user repository alike.
package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // register the "sqlite" driver
)

// Open opens (or creates) a SQLite database at path and returns two handles:
//
//   - write: a single-connection handle configured with _txlock=immediate and
//     query_only disabled. SetMaxOpenConns(1) is applied; all writes MUST go
//     through this handle. Holding it to a single connection removes the need
//     for any external mutex on the write path: no two write transactions can
//     interleave at the database level.
//
//   - read: a pooled handle (up to 4 connections) with query_only enabled.
//     Accidental writes through this handle fail immediately with
//     SQLITE_READONLY rather than silently contending with the writer.
//
// Callers must Close both handles. The typical teardown pattern is:
//
//	defer write.Close()
//	defer read.Close()
//
// Open fails if the parent directory cannot be created, or if journal_mode
// does not become WAL after the pragma is applied (which can happen silently
// on NFS/CIFS mounts or on filesystems without shared-memory support).
func Open(ctx context.Context, path string) (read, write *sql.DB, err error) {
	if err = os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, nil, fmt.Errorf("sqlitex: create parent directory: %w", err)
	}

	write, err = openHandle(ctx, path, false)
	if err != nil {
		return nil, nil, err
	}

	write.SetMaxOpenConns(1)
	write.SetMaxIdleConns(1)
	write.SetConnMaxLifetime(0)
	write.SetConnMaxIdleTime(0)

	read, err = openHandle(ctx, path, true)
	if err != nil {
		_ = write.Close()
		return nil, nil, err
	}

	read.SetMaxOpenConns(4)
	read.SetMaxIdleConns(4)
	read.SetConnMaxLifetime(0)
	read.SetConnMaxIdleTime(0)

	if err = assertWAL(ctx, write); err != nil {
		_ = read.Close()
		_ = write.Close()

		return nil, nil, err
	}

	return read, write, nil
}

// openHandle builds a DSN for path and returns an open *sql.DB.
// readOnly sets query_only(1) and omits _txlock=immediate.
func openHandle(ctx context.Context, path string, readOnly bool) (*sql.DB, error) {
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(10000)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=temp_store(MEMORY)" +
		"&_pragma=cache_size(-16000)"

	if readOnly {
		dsn += "&_pragma=query_only(1)"
	} else {
		dsn += "&_txlock=immediate"
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("sqlitex: open %s: %w", path, err)
	}

	if err = db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("sqlitex: ping %s: %w", path, err)
	}

	return db, nil
}

// assertWAL queries the journal mode and returns an error if it is not "wal".
// WAL can silently fall back to rollback-journal mode on filesystems that do
// not support the shared-memory mapping required by WAL (NFS, CIFS, some
// tmpfs configurations). This would destroy the concurrent-reader guarantee
// and is worth a loud startup failure rather than silent degradation.
func assertWAL(ctx context.Context, db *sql.DB) error {
	var mode string
	if err := db.QueryRowContext(ctx,
		`SELECT journal_mode FROM pragma_journal_mode`,
	).Scan(&mode); err != nil {
		return fmt.Errorf("sqlitex: could not verify journal_mode: %w", err)
	}

	if mode != "wal" {
		return fmt.Errorf(
			"sqlitex: journal_mode is %q, expected \"wal\"; "+
				"WAL requires shared-memory support — do not use a network filesystem",
			mode,
		)
	}

	return nil
}

// CheckpointTruncate runs PRAGMA wal_checkpoint(TRUNCATE) on the write
// handle. Call this during graceful shutdown so the WAL file does not survive
// a restart at pathological size.
func CheckpointTruncate(ctx context.Context, write *sql.DB) error {
	_, err := write.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`)
	return err
}
