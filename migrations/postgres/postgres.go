// Package postgres embeds all goose migration files for Postgres.
package postgres

import (
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var FS embed.FS

// GoMigrations returns the set of Go migrations for Postgres to pass to goose.WithGoMigrations.
func GoMigrations() []*goose.Migration {
	m := goose.NewGoMigration(4,
		&goose.GoFunc{RunTx: upImportLegacyData},
		&goose.GoFunc{RunTx: downImportLegacyData},
	)
	m.Source = "00004_import.go"

	access := goose.NewGoMigration(13,
		&goose.GoFunc{RunTx: upBackfillIncidentAccess},
		&goose.GoFunc{RunTx: downBackfillIncidentAccess},
	)
	access.Source = "00013_backfill_incident_access.go"

	return []*goose.Migration{m, access}
}
