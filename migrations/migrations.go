// Package migrations provides dialect-specific migration files and helpers.
package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"strings"

	"github.com/pressly/goose/v3"

	"github.com/f-eld-ch/sitrep/migrations/postgres"
)

// MigrationSet holds the goose Dialect, embedded file system, and Go migrations for a driver.
type MigrationSet struct {
	Dialect      goose.Dialect
	FS           fs.FS
	GoMigrations []*goose.Migration
}

// ForDSN inspects the database URL / DSN and returns the appropriate MigrationSet.
// Format / dialect rules:
//   - empty / "inmem" / "inmem://" -> error (or handled by caller if skipping)
//   - "postgres://", "postgresql://", or key-value postgres DSN -> returns Postgres MigrationSet
//   - "sqlite://", "file:", or ".db" / "sqlite" DSN -> errors with unsupported dialect for now
//   - any other scheme -> errors with unsupported database URL format
func ForDSN(dsn string) (*MigrationSet, error) {
	s := strings.TrimSpace(dsn)
	if s == "" {
		return nil, fmt.Errorf("no database URL specified")
	}

	if s == "inmem" || strings.HasPrefix(s, "inmem://") {
		return nil, fmt.Errorf("in-memory database does not support migrations")
	}

	if isPostgresDSN(s) {
		return &MigrationSet{
			Dialect:      goose.DialectPostgres,
			FS:           postgres.FS,
			GoMigrations: postgres.GoMigrations(),
		}, nil
	}

	if isSQLiteDSN(s) {
		return nil, fmt.Errorf("sqlite migrations are not yet supported")
	}

	return nil, fmt.Errorf("unsupported database URL format: %q", dsn)
}

// RunPreflight delegates preflight data checks to the dialect handler (currently Postgres).
func RunPreflight(ctx context.Context, db *sql.DB) ([]string, error) {
	return postgres.RunPreflight(ctx, db)
}

func isPostgresDSN(dsn string) bool {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		return true
	}

	// Also check for libpq key-value format e.g. "host=localhost user=postgres..."
	if strings.Contains(dsn, "host=") || strings.Contains(dsn, "user=") || strings.Contains(dsn, "dbname=") {
		return true
	}

	return false
}

func isSQLiteDSN(dsn string) bool {
	if strings.HasPrefix(dsn, "sqlite://") || strings.HasPrefix(dsn, "sqlite3://") || strings.HasPrefix(dsn, "file:") {
		return true
	}

	if strings.HasSuffix(dsn, ".db") || strings.HasSuffix(dsn, ".sqlite") || strings.HasSuffix(dsn, ".sqlite3") {
		return true
	}

	return false
}
