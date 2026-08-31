// Package migrations embeds all goose migration files for use with sitrep migrate.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
