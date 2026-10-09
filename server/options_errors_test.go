package server

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestMapTimelineErrorCode(t *testing.T) {
	tests := map[string]error{
		"NOT_TRIAGED_TO_DIVISION":   shared.ErrNotTriagedToDivision,
		"BEFORE_FEATURE_PLACED":     shared.ErrBeforeFeaturePlaced,
		"FEATURE_HAS_LATER_CHANGES": shared.ErrFeatureHasLaterChanges,
		"FEATURE_NOT_REMOVED":       shared.ErrFeatureNotRemoved,
		"BEFORE_FEATURE_REMOVED":    shared.ErrBeforeFeatureRemoved,
	}

	for want, sentinel := range tests {
		t.Run(want, func(t *testing.T) {
			code, ok := mapTimelineErrorCode(fmt.Errorf("restore: %w", sentinel))

			assert.True(t, ok)
			assert.Equal(t, want, code)
		})
	}

	t.Run("other errors are not timeline errors", func(t *testing.T) {
		_, ok := mapTimelineErrorCode(shared.ErrNotFound)
		assert.False(t, ok)

		_, ok = mapTimelineErrorCode(fmt.Errorf("database exploded"))
		assert.False(t, ok)
	})
}
