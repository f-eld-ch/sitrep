package scalar_test

import (
	"bytes"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/scalar"
)

func TestMarshalJSONMap(t *testing.T) {
	tests := map[string]struct {
		in   scalar.JSONMap
		want string
	}{
		"object": {
			scalar.JSONMap{"type": "Point", "coordinates": []any{8.5, 47.3}},
			`{"type":"Point","coordinates":[8.5,47.3]}`,
		},
		"empty": {scalar.JSONMap{}, `{}`},
		"nil":   {nil, `{}`},
		// NaN cannot be encoded as JSON: the scalar answers null rather than invalid JSON.
		"unencodable": {scalar.JSONMap{"v": math.NaN()}, `null`},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			var buf bytes.Buffer

			scalar.MarshalJSONMap(tc.in).MarshalGQL(&buf)

			if tc.want == `null` {
				assert.Equal(t, tc.want, buf.String())

				return
			}

			assert.JSONEq(t, tc.want, buf.String())
		})
	}
}

func TestUnmarshalJSONMap(t *testing.T) {
	t.Run("map is taken as it is", func(t *testing.T) {
		got, err := scalar.UnmarshalJSONMap(map[string]any{"a": 1})

		require.NoError(t, err)
		assert.Equal(t, scalar.JSONMap{"a": 1}, got)
	})

	t.Run("string is parsed as JSON", func(t *testing.T) {
		got, err := scalar.UnmarshalJSONMap(`{"type":"Point"}`)

		require.NoError(t, err)
		assert.Equal(t, scalar.JSONMap{"type": "Point"}, got)
	})

	t.Run("invalid JSON string is rejected", func(t *testing.T) {
		_, err := scalar.UnmarshalJSONMap(`{not json`)

		require.ErrorContains(t, err, "cannot unmarshal string")
	})

	t.Run("other types are rejected", func(t *testing.T) {
		_, err := scalar.UnmarshalJSONMap(42)

		require.ErrorContains(t, err, "expected map[string]any, got int")
	})
}
