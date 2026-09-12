package sqlite

import (
	"bytes"
	"encoding/json"
	"reflect"
)

// Equal reports whether a and b represent the same JSON value, ignoring key
// order, whitespace, and numeric formatting differences. It is the Go
// equivalent of Postgres' jsonb `=` operator, which the layer-features
// projection depends on to avoid bumping the revision counter when a
// Moved/Restyled event carries a geometry or properties value that is
// semantically identical to what is already stored.
//
// Both values are decoded into any (using Go's default JSON decoder) and
// compared with reflect.DeepEqual. This means:
//   - Key order is irrelevant (both sides decode to map[string]any).
//   - Whitespace differences are irrelevant (decoded away).
//   - Numbers decode as float64, so 1 and 1.0 compare equal — matching jsonb.
//   - Duplicate keys collapse to the last value — matching jsonb.
//
// If either value fails to unmarshal (malformed JSON), the function falls back
// to a plain bytes.Equal comparison. This preserves correctness for well-formed
// inputs while preventing a panic on bad data.
func Equal(a, b json.RawMessage) bool {
	if bytes.Equal(a, b) {
		return true // fast path: identical bytes
	}

	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return bytes.Equal(a, b)
	}

	return reflect.DeepEqual(x, y)
}

// JSONArg marshals ids to a JSON array string suitable as a single bind
// parameter for use with json_each:
//
//	WHERE col IN (SELECT value FROM json_each(?))
//
// Using a single JSON parameter rather than expanding N individual ? placeholders:
//   - Is injection-proof by construction (ids are never concatenated into SQL).
//   - Avoids SQLITE_MAX_VARIABLE_NUMBER limits regardless of slice size.
//   - Produces a single SQL string, keeping the driver's statement cache
//     effective (expanded IN produces a distinct SQL string per cardinality).
//
// Returns "[]" for a nil or empty slice so that json_each produces zero rows
// rather than an error.
func JSONArg(ids []string) string {
	if len(ids) == 0 {
		return "[]"
	}

	b, err := json.Marshal(ids)
	if err != nil {
		return "[]"
	}

	return string(b)
}
