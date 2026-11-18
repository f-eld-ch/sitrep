package maptile_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
)

func TestParseTileset(t *testing.T) {
	ts, err := maptile.ParseTileset("ch.swisstopo.base.vt", "v1.0.0")
	require.NoError(t, err)
	assert.Equal(t, "ch.swisstopo.base.vt/v1.0.0", ts.String())

	for _, c := range [][2]string{
		{"ch.swisstopo.base.vt", "v2.0.0"},
		{"../../etc/passwd", "v1.0.0"},
		{"ch.swisstopo.base.vt", "../v1.0.0"},
		{"org.openstreetmap-openmaptiles.vt", "v1.0.0"},
	} {
		_, err := maptile.ParseTileset(c[0], c[1])
		require.ErrorIs(t, err, maptile.ErrUnknownTileset, "%v", c)
	}
}

func TestNewCoord(t *testing.T) {
	c, err := maptile.NewCoord(3, 2, 1)
	require.NoError(t, err)
	assert.Equal(t, 6, c.TMSRow(), "2^3-1-1")

	for _, v := range [][3]int{{-1, 0, 0}, {23, 0, 0}, {3, 8, 0}, {3, 0, 8}, {3, -1, 0}, {0, 1, 0}} {
		_, err := maptile.NewCoord(v[0], v[1], v[2])
		require.ErrorIs(t, err, maptile.ErrInvalidCoord, "%v", v)
	}
}

func TestTileset_Validate(t *testing.T) {
	for _, ts := range maptile.Supported {
		require.NoError(t, ts.Validate())
	}

	for _, ts := range []maptile.Tileset{
		{},
		{Name: "ch.swisstopo.base.vt", Version: "v2.0.0"},
		{Name: "../ch.swisstopo.base.vt", Version: "v1.0.0"},
		{Name: "ch.swisstopo.base.vt/../../x", Version: "v1.0.0"},
		{Name: "ch.swisstopo.base.vt", Version: "v1.0.0/../../x"},
		{Name: "ch.swisstopo.base.vt?x=1", Version: "v1.0.0"},
		{Name: "evil.example.com", Version: "v1.0.0"},
	} {
		require.ErrorIs(t, ts.Validate(), maptile.ErrUnknownTileset, "%+v", ts)
	}
}
