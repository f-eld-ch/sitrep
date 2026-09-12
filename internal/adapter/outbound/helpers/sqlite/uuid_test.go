package sqlite_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
)

func TestUUID_RoundTrip(t *testing.T) {
	id := uuid.New()
	u := sqlite.UUID{V: id}

	val, err := u.Value()
	require.NoError(t, err)
	assert.Equal(t, id.String(), val)

	var out sqlite.UUID

	require.NoError(t, out.Scan(val))
	assert.Equal(t, id, out.V)
}

func TestUUID_ScanBytes(t *testing.T) {
	id := uuid.New()

	var out sqlite.UUID

	require.NoError(t, out.Scan([]byte(id.String())))
	assert.Equal(t, id, out.V)
}

func TestUUID_ScanNil(t *testing.T) {
	var out sqlite.UUID

	require.NoError(t, out.Scan(nil))
	assert.Equal(t, uuid.Nil, out.V)
}

func TestNullUUID_Nil(t *testing.T) {
	var n sqlite.NullUUID

	require.NoError(t, n.Scan(nil))
	assert.Nil(t, n.V)

	val, err := n.Value()
	require.NoError(t, err)
	assert.Nil(t, val)
}

func TestNullUUID_NonNil(t *testing.T) {
	id := uuid.New()

	var n sqlite.NullUUID

	require.NoError(t, n.Scan(id.String()))
	require.NotNil(t, n.V)
	assert.Equal(t, id, *n.V)
}

func TestUUIDs_RoundTrip(t *testing.T) {
	ids := sqlite.UUIDs{uuid.New(), uuid.New(), uuid.New()}

	val, err := ids.Value()
	require.NoError(t, err)

	var out sqlite.UUIDs

	require.NoError(t, out.Scan(val))
	assert.Equal(t, []uuid.UUID(ids), []uuid.UUID(out))
}

func TestUUIDs_Empty(t *testing.T) {
	// An empty slice must encode as "[]", not "null", so CHECK(json_type='array') passes.
	var empty sqlite.UUIDs

	val, err := empty.Value()
	require.NoError(t, err)
	assert.Equal(t, "[]", val)
}

func TestUUIDs_ScanNullIsEmpty(t *testing.T) {
	// NULL column scans as an empty non-nil slice — never nil.
	var out sqlite.UUIDs

	require.NoError(t, out.Scan(nil))
	assert.NotNil(t, []uuid.UUID(out))
	assert.Empty(t, out)
}

func TestUUIDs_ScanEmptyArray(t *testing.T) {
	var out sqlite.UUIDs

	require.NoError(t, out.Scan("[]"))
	assert.NotNil(t, []uuid.UUID(out))
	assert.Empty(t, out)
}
