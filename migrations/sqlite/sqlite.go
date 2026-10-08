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

	messageMap := goose.NewGoMigration(15,
		&goose.GoFunc{RunTx: upBackfillMessageMap},
		&goose.GoFunc{RunTx: downBackfillMessageMap},
	)
	messageMap.Source = "00015_backfill_message_map.go"

	acks := goose.NewGoMigration(18,
		&goose.GoFunc{RunTx: upBackfillMessageMapAcknowledgements},
		&goose.GoFunc{RunTx: downBackfillMessageMapAcknowledgements},
	)
	acks.Source = "00018_backfill_message_map_acknowledgements.go"

	return []*goose.Migration{backfill, messageMap, acks}
}
