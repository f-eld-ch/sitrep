//go:build integration

package pgtest

import (
	"fmt"

	"github.com/jackc/pgx/v5"
)

func pgxConfig(dsn string) (*pgx.ConnConfig, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parsing connection string: %w", err)
	}

	return cfg, nil
}
