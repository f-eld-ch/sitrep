package migrations_test

import (
	"testing"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/migrations"
)

func TestForDSN(t *testing.T) {
	tests := []struct {
		name          string
		dsn           string
		expectDialect goose.Dialect
		expectErr     bool
		errContains   string
	}{
		{
			name:        "empty DSN",
			dsn:         "",
			expectErr:   true,
			errContains: "no database URL specified",
		},
		{
			name:        "inmem DSN",
			dsn:         "inmem",
			expectErr:   true,
			errContains: "in-memory database does not support migrations",
		},
		{
			name:        "inmem URL",
			dsn:         "inmem://",
			expectErr:   true,
			errContains: "in-memory database does not support migrations",
		},
		{
			name:          "postgres URL",
			dsn:           "postgres://localhost:5432/sitrep?sslmode=disable",
			expectDialect: goose.DialectPostgres,
		},
		{
			name:          "postgresql URL",
			dsn:           "postgresql://localhost:5432/sitrep",
			expectDialect: goose.DialectPostgres,
		},
		{
			name:          "postgres key-value DSN",
			dsn:           "host=localhost user=postgres dbname=sitrep sslmode=disable",
			expectDialect: goose.DialectPostgres,
		},
		{
			name:        "sqlite URL",
			dsn:         "sqlite://sitrep.db",
			expectErr:   true,
			errContains: "sqlite migrations are not yet supported",
		},
		{
			name:        "sqlite db file",
			dsn:         "sitrep.db",
			expectErr:   true,
			errContains: "sqlite migrations are not yet supported",
		},
		{
			name:        "unsupported scheme",
			dsn:         "mysql://localhost:3306/db",
			expectErr:   true,
			errContains: "unsupported database URL format",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set, err := migrations.ForDSN(tt.dsn)
			if tt.expectErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
				assert.Nil(t, set)
			} else {
				require.NoError(t, err)
				require.NotNil(t, set)
				assert.Equal(t, tt.expectDialect, set.Dialect)
				assert.NotNil(t, set.FS)
			}
		})
	}
}
