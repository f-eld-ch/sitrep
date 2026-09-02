package projection

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleRetentionResult(t *testing.T) {
	t.Run("does not rebuild when nothing was archived", func(t *testing.T) {
		rebuilt := false
		err := handleRetentionResult(false, nil, func() error {
			rebuilt = true
			return nil
		})

		require.NoError(t, err)
		assert.False(t, rebuilt)
	})

	t.Run("rebuilds before returning a retention error after partial archive", func(t *testing.T) {
		wantErr := errors.New("archive batch failed")
		rebuilt := false
		err := handleRetentionResult(true, wantErr, func() error {
			rebuilt = true
			return nil
		})

		assert.True(t, rebuilt)
		require.ErrorIs(t, err, wantErr)
	})

	t.Run("returns rebuild errors", func(t *testing.T) {
		wantErr := errors.New("rebuild failed")
		err := handleRetentionResult(true, nil, func() error { return wantErr })

		require.ErrorIs(t, err, wantErr)
	})
}
