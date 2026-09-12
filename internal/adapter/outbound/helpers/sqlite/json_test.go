package sqlite_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
)

func TestEqual_IdenticalBytes(t *testing.T) {
	a := json.RawMessage(`{"type":"Point","coordinates":[8.5,47.3]}`)
	assert.True(t, sqlite.Equal(a, a))
}

func TestEqual_WhitespaceDifference(t *testing.T) {
	a := json.RawMessage(`{"type":"Point","coordinates":[8.5,47.3]}`)
	b := json.RawMessage(`{ "type" : "Point" , "coordinates" : [ 8.5 , 47.3 ] }`)
	assert.True(t, sqlite.Equal(a, b))
}

func TestEqual_KeyOrderDifference(t *testing.T) {
	a := json.RawMessage(`{"type":"Point","coordinates":[8.5,47.3]}`)
	b := json.RawMessage(`{"coordinates":[8.5,47.3],"type":"Point"}`)
	assert.True(t, sqlite.Equal(a, b))
}

func TestEqual_NumericEquivalence(t *testing.T) {
	// 1 and 1.0 are the same JSON number; both decode to float64(1).
	// This mirrors Postgres jsonb `=` semantics.
	a := json.RawMessage(`{"coordinates":[8.5,47.3]}`)
	b := json.RawMessage(`{"coordinates":[8.50,47.30]}`)
	assert.True(t, sqlite.Equal(a, b))
}

func TestEqual_TrailingZeroCoordinates(t *testing.T) {
	// A geometry re-serialised with trailing zeros must equal the original.
	// This is the case that would break any bytes.Equal implementation.
	a := json.RawMessage(`{"coordinates":[8.500000000,47.300000000]}`)
	b := json.RawMessage(`{"coordinates":[8.5,47.3]}`)
	assert.True(t, sqlite.Equal(a, b))
}

func TestEqual_ActuallyDifferent(t *testing.T) {
	a := json.RawMessage(`{"coordinates":[8.5,47.3]}`)
	b := json.RawMessage(`{"coordinates":[8.6,47.3]}`)
	assert.False(t, sqlite.Equal(a, b))
}

func TestEqual_DifferentTypes(t *testing.T) {
	assert.False(t, sqlite.Equal(
		json.RawMessage(`{"type":"Point"}`),
		json.RawMessage(`["Point"]`),
	))
}

func TestEqual_MalformedFallsBackToBytes(t *testing.T) {
	bad := json.RawMessage(`not json`)
	assert.True(t, sqlite.Equal(bad, bad))
	assert.False(t, sqlite.Equal(bad, json.RawMessage(`also not json`)))
}

func TestJSONArg_Empty(t *testing.T) {
	assert.Equal(t, "[]", sqlite.JSONArg(nil))
	assert.Equal(t, "[]", sqlite.JSONArg([]string{}))
}

func TestJSONArg_Values(t *testing.T) {
	result := sqlite.JSONArg([]string{"abc", "def"})
	assert.Equal(t, `["abc","def"]`, result)
}
