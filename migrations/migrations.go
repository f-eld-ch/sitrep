// Package migrations embeds all goose migration files for use with sitrep migrate.
package migrations

import (
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var FS embed.FS

// GoMigrations returns the set of Go migrations to pass to goose.WithGoMigrations.
// Each entry must have a version that does not clash with any SQL migration file.
func GoMigrations() []*goose.Migration {
	return []*goose.Migration{
		goose.NewGoMigration(4,
			&goose.GoFunc{RunTx: upImportLegacyData},
			&goose.GoFunc{RunTx: downImportLegacyData},
		),
	}
}
