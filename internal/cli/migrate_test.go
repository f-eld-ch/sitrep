package cli

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenGooseDBWithRetry(t *testing.T) {
	t.Run("waits for the database to become reachable", func(t *testing.T) {
		attempts := 0
		db, err := openGooseDBWithRetry(context.Background(), time.Second, time.Nanosecond, func(context.Context) (*sql.DB, error) {
			attempts++
			if attempts == 1 {
				return nil, errors.New("connection refused")
			}
			return nil, nil
		})

		require.NoError(t, err)
		assert.Nil(t, db)
		assert.Equal(t, 2, attempts)
	})

	t.Run("stops when the wait time expires", func(t *testing.T) {
		attempts := 0
		_, err := openGooseDBWithRetry(context.Background(), time.Nanosecond, time.Second, func(context.Context) (*sql.DB, error) {
			attempts++
			return nil, errors.New("connection refused")
		})

		require.Error(t, err)
		assert.ErrorContains(t, err, "connecting to database after")
		assert.Equal(t, 1, attempts)
	})
}
