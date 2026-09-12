package sqlite

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// TimeLayout is a fixed-width UTC timestamp layout suitable for TEXT storage
// in SQLite. It must be fixed-width so that lexicographic byte ordering of the
// stored TEXT is identical to chronological ordering.
//
// time.RFC3339Nano must NOT be used here: it elides trailing zeros from the
// fractional second, producing strings of variable width. As a result
// "2026-09-12T10:00:00Z" would sort after "2026-09-12T10:00:00.5Z" because
// 'Z' (0x5A) > '.' (0x2E), which is the opposite of chronological order.
// Any ORDER BY or comparison on a timestamp column would then silently
// mis-order rows on certain values — a data-dependent bug that is extremely
// hard to catch in tests.
//
// The chosen layout always emits exactly 9 fractional digits and a literal Z,
// so all stored values have the same byte width and sort correctly.
const TimeLayout = "2006-01-02T15:04:05.000000000Z"

// Time is a time.Time that implements driver.Valuer and sql.Scanner for
// SQLite TEXT columns using TimeLayout. It always stores UTC.
type Time struct{ V time.Time }

// Value implements driver.Valuer.
func (t *Time) Value() (driver.Value, error) {
	return t.V.UTC().Format(TimeLayout), nil
}

// Scan implements sql.Scanner. It accepts a string or []byte formatted with
// TimeLayout, or a time.Time (modernc returns time.Time for DATETIME columns,
// though we declare our columns as TEXT to avoid that path).
func (t *Time) Scan(src any) error {
	switch v := src.(type) {
	case string:
		parsed, err := time.Parse(TimeLayout, v)
		if err != nil {
			return fmt.Errorf("sqlitex.Time: parse %q: %w", v, err)
		}

		t.V = parsed.UTC()

		return nil
	case []byte:
		parsed, err := time.Parse(TimeLayout, string(v))
		if err != nil {
			return fmt.Errorf("sqlitex.Time: parse %q: %w", v, err)
		}

		t.V = parsed.UTC()

		return nil
	case time.Time:
		t.V = v.UTC()

		return nil
	case nil:
		t.V = time.Time{}

		return nil
	}

	return fmt.Errorf("sqlitex.Time: unsupported type %T", src)
}

// NullTime maps a nullable timestamp column (e.g. closed_at, deleted_at) to
// a Go *time.Time. A NULL column scans as nil.
type NullTime struct{ V *time.Time }

// Value implements driver.Valuer. Returning a nil driver.Value is the correct
// way to represent SQL NULL; the nilnil linter warning is suppressed here
// because both nil returns are intentional and distinct (nil interface == NULL
// row, nil error == no failure).
//
//nolint:nilnil // returning nil driver.Value is the correct representation of SQL NULL
func (n *NullTime) Value() (driver.Value, error) {
	if n.V == nil {
		return nil, nil
	}

	return n.V.UTC().Format(TimeLayout), nil
}

// Scan implements sql.Scanner.
func (n *NullTime) Scan(src any) error {
	if src == nil {
		n.V = nil

		return nil
	}

	var t Time
	if err := t.Scan(src); err != nil {
		return err
	}

	n.V = &t.V

	return nil
}

// FormatTime formats t in TimeLayout for use as a bind parameter where the
// sql.Scanner path is not in play (e.g. building a raw SQL argument).
func FormatTime(t time.Time) string { return t.UTC().Format(TimeLayout) }

// ParseTime parses a TimeLayout string. Useful in tests and in handlers that
// receive timestamps from event payloads as RFC3339 strings and need to
// convert before binding.
func ParseTime(s string) (time.Time, error) { return time.Parse(TimeLayout, s) }

// ParseEventTime parses an RFC 3339 string from an event payload (e.g.
// d.Time, d.ClosedAt) and returns a NullTime ready to bind. The event
// serialiser uses time.RFC3339, which has variable width; we must parse and
// re-format through TimeLayout before storing, otherwise ORDER BY on the
// column will mis-sort rows where the fractional part is a round number.
func ParseEventTime(s *string) (NullTime, error) {
	if s == nil {
		return NullTime{}, nil
	}

	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		return NullTime{}, fmt.Errorf("sqlitex.ParseEventTime: %w", err)
	}

	utc := t.UTC()

	return NullTime{V: &utc}, nil
}
