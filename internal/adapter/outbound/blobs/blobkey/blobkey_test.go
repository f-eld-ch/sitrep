package blobkey_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestParse(t *testing.T) {
	incID := uuid.New()
	attID := uuid.New()
	valid := blobkey.ForAttachment(incID, attID)

	t.Run("valid key returns correct components", func(t *testing.T) {
		gotInc, gotAtt, err := blobkey.Parse(valid)
		require.NoError(t, err)
		assert.Equal(t, incID, gotInc)
		assert.Equal(t, attID, gotAtt)
	})

	cases := []struct {
		name string
		key  string
	}{
		{"empty", ""},
		{"root only", "incidents"},
		{"missing attachment", "incidents/" + incID.String()},
		{"too many segments", "incidents/" + incID.String() + "/" + attID.String() + "/extra"},
		{"wrong prefix", "blobs/" + incID.String() + "/" + attID.String()},
		{"absolute path", "/incidents/" + incID.String() + "/" + attID.String()},
		{"traversal in incident", "incidents/../etc/" + attID.String()},
		{"non-uuid incident", "incidents/not-a-uuid/" + attID.String()},
		{"non-uuid attachment", "incidents/" + incID.String() + "/not-a-uuid"},
	}

	for _, tc := range cases {
		t.Run(tc.name+" is rejected", func(t *testing.T) {
			_, _, err := blobkey.Parse(tc.key)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
		})
	}
}

func TestParsePrefix(t *testing.T) {
	incID := uuid.New()
	valid := blobkey.PrefixForIncident(incID)

	t.Run("valid prefix returns incident ID", func(t *testing.T) {
		got, err := blobkey.ParsePrefix(valid)
		require.NoError(t, err)
		assert.Equal(t, incID, got)
	})

	cases := []struct {
		name   string
		prefix string
	}{
		{"empty", ""},
		{"too many segments", "incidents/" + incID.String() + "/extra/"},
		{"wrong prefix", "blobs/" + incID.String() + "/"},
		{"non-uuid", "incidents/not-a-uuid/"},
		{"root prefix", "incidents/"},
	}

	for _, tc := range cases {
		t.Run(tc.name+" is rejected", func(t *testing.T) {
			_, err := blobkey.ParsePrefix(tc.prefix)
			require.ErrorIs(t, err, shared.ErrInvalidInput)
		})
	}
}
