package sqlite_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
)

func TestTimeLayout_FixedWidth(t *testing.T) {
	cases := []time.Time{
		time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC),           // no fractional part
		time.Date(2026, 9, 12, 10, 0, 0, 500_000_000, time.UTC), // 0.5 s
		time.Date(2026, 9, 12, 10, 0, 0, 123_456_789, time.UTC), // 9 digits
		time.Date(2026, 9, 12, 10, 0, 0, 100_000_000, time.UTC), // trailing zeros
		time.Date(2026, 9, 12, 10, 0, 0, 1, time.UTC),           // 1 nanosecond
	}

	for _, ts := range cases {
		s := sqlite.FormatTime(ts)
		assert.Len(t, s, len(sqlite.TimeLayout),
			"formatted time %q has wrong length (layout %q)", s, sqlite.TimeLayout)
	}
}

// TestTimeLayout_LexicalOrderEqualsChronologicalOrder is the critical test
// that guards against the time.RFC3339Nano bug. RFC3339Nano strips trailing
// zeros from the sub-second part, so "2026-09-12T10:00:00Z" would sort after
// "2026-09-12T10:00:00.5Z" lexically ('Z' > '.'), which is wrong. Our layout
// must produce strings where byte-order == time-order unconditionally.
func TestTimeLayout_LexicalOrderEqualsChronologicalOrder(t *testing.T) {
	pairs := []struct {
		earlier, later time.Time
	}{
		{
			// The classic RFC3339Nano trap: round second vs sub-second.
			earlier: time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC),
			later:   time.Date(2026, 9, 12, 10, 0, 0, 500_000_000, time.UTC),
		},
		{
			earlier: time.Date(2026, 9, 12, 10, 0, 0, 123_456_789, time.UTC),
			later:   time.Date(2026, 9, 12, 10, 0, 0, 500_000_000, time.UTC),
		},
		{
			earlier: time.Date(2026, 9, 12, 10, 0, 0, 100_000_000, time.UTC),
			later:   time.Date(2026, 9, 12, 10, 0, 0, 100_000_001, time.UTC),
		},
		{
			earlier: time.Date(2026, 9, 12, 9, 59, 59, 999_999_999, time.UTC),
			later:   time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC),
		},
	}

	for _, p := range pairs {
		es := sqlite.FormatTime(p.earlier)
		ls := sqlite.FormatTime(p.later)
		assert.Less(t, es, ls,
			"lexical order mismatch: %q should be < %q (earlier=%v later=%v)",
			es, ls, p.earlier, p.later)
	}
}

func TestTime_RoundTrip(t *testing.T) {
	original := time.Date(2026, 9, 12, 14, 30, 45, 123_456_789, time.UTC)
	formatted := sqlite.FormatTime(original)

	parsed, err := sqlite.ParseTime(formatted)
	require.NoError(t, err)
	assert.True(t, original.Equal(parsed), "round-trip mismatch: got %v want %v", parsed, original)
}

func TestTime_ScanTypes(t *testing.T) {
	ts := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	s := sqlite.FormatTime(ts)

	for _, src := range []any{s, []byte(s), ts} {
		var out sqlite.Time

		require.NoError(t, out.Scan(src))
		assert.True(t, ts.Equal(out.V))
	}
}

func TestNullTime_NilRoundTrip(t *testing.T) {
	var n sqlite.NullTime

	require.NoError(t, n.Scan(nil))
	assert.Nil(t, n.V)

	val, err := n.Value()
	require.NoError(t, err)
	assert.Nil(t, val)
}

func TestParseEventTime_RFC3339(t *testing.T) {
	s := "2026-09-12T10:00:00.5Z"

	nt, err := sqlite.ParseEventTime(&s)
	require.NoError(t, err)
	require.NotNil(t, nt.V)

	// The stored form must be in TimeLayout (fixed-width), not RFC3339Nano.
	val, err := nt.Value()
	require.NoError(t, err)

	stored, ok := val.(string)
	require.True(t, ok)
	assert.Len(t, stored, len(sqlite.TimeLayout))
}

func TestParseEventTime_Nil(t *testing.T) {
	nt, err := sqlite.ParseEventTime(nil)
	require.NoError(t, err)
	assert.Nil(t, nt.V)
}
