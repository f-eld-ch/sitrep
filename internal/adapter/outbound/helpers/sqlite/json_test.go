package sqlite_test

import (
	"encoding/json/jsontext"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
)

func TestEqual_IdenticalBytes(t *testing.T) {
	a := jsontext.Value(`{"type":"Point","coordinates":[8.5,47.3]}`)
	eq, err := sqlite.Equal(a, a)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestEqual_WhitespaceDifference(t *testing.T) {
	a := jsontext.Value(`{"type":"Point","coordinates":[8.5,47.3]}`)
	b := jsontext.Value(`{ "type" : "Point" , "coordinates" : [ 8.5 , 47.3 ] }`)
	eq, err := sqlite.Equal(a, b)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestEqual_KeyOrderDifference(t *testing.T) {
	a := jsontext.Value(`{"type":"Point","coordinates":[8.5,47.3]}`)
	b := jsontext.Value(`{"coordinates":[8.5,47.3],"type":"Point"}`)
	eq, err := sqlite.Equal(a, b)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestEqual_NumericEquivalence(t *testing.T) {
	// 1 and 1.0 are the same JSON number; both decode to float64(1).
	// This mirrors Postgres jsonb `=` semantics.
	a := jsontext.Value(`{"coordinates":[8.5,47.3]}`)
	b := jsontext.Value(`{"coordinates":[8.50,47.30]}`)
	eq, err := sqlite.Equal(a, b)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestEqual_TrailingZeroCoordinates(t *testing.T) {
	// A geometry re-serialised with trailing zeros must equal the original.
	a := jsontext.Value(`{"coordinates":[8.500000000,47.300000000]}`)
	b := jsontext.Value(`{"coordinates":[8.5,47.3]}`)
	eq, err := sqlite.Equal(a, b)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestEqual_ActuallyDifferent(t *testing.T) {
	a := jsontext.Value(`{"coordinates":[8.5,47.3]}`)
	b := jsontext.Value(`{"coordinates":[8.6,47.3]}`)
	eq, err := sqlite.Equal(a, b)
	require.NoError(t, err)
	assert.False(t, eq)
}

func TestEqual_DifferentTypes(t *testing.T) {
	eq, err := sqlite.Equal(
		jsontext.Value(`{"type":"Point"}`),
		jsontext.Value(`["Point"]`),
	)
	require.NoError(t, err)
	assert.False(t, eq)
}

func TestEqual_MalformedJSON_ReturnsError(t *testing.T) {
	bad := jsontext.Value(`not json`)
	good := jsontext.Value(`{"type":"Point"}`)

	// Malformed stored value → error.
	_, err := sqlite.Equal(bad, good)
	require.Error(t, err)

	// Malformed incoming value → error.
	_, err = sqlite.Equal(good, bad)
	require.Error(t, err)

	// Both malformed but identical bytes → fast-path true, no error.
	eq, err := sqlite.Equal(bad, bad)
	require.NoError(t, err)
	assert.True(t, eq)
}

func TestJSONArg_Empty(t *testing.T) {
	assert.Equal(t, "[]", sqlite.JSONArg(nil))
	assert.Equal(t, "[]", sqlite.JSONArg([]string{}))
}

func TestJSONArg_Values(t *testing.T) {
	result := sqlite.JSONArg([]string{"abc", "def"})
	assert.Equal(t, `["abc","def"]`, result)
}
