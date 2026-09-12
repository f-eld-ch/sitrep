// Package sqlite embeds all goose migration files for SQLite.
package sqlite

import (
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var FS embed.FS

// GoMigrations returns the set of Go migrations for SQLite.
// SQLite starts clean with squashed DDL; there are no data-import or
// backfill migrations equivalent to the Postgres ones.
func GoMigrations() []*goose.Migration {
	return nil
}
