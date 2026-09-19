// Package sqlite embeds all goose migration files for SQLite.
package sqlite

import (
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var FS embed.FS

// GoMigrations returns the set of Go migrations for SQLite.
// SQLite starts clean with squashed DDL; data backfills are registered here
// when they must also repair existing SQLite databases.
func GoMigrations() []*goose.Migration {
	backfill := goose.NewGoMigration(11,
		&goose.GoFunc{RunTx: upBackfillDefaultSchadenplatz},
		&goose.GoFunc{RunTx: downBackfillDefaultSchadenplatz},
	)
	backfill.Source = "00011_backfill_default_schadenplatz.go"

	return []*goose.Migration{backfill}
}
