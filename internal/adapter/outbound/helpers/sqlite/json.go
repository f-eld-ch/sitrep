package sqlite

import (
	"bytes"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
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
// If either value fails to unmarshal, an error is returned. This mirrors
// Postgres' behaviour, which raises an error on malformed jsonb rather than
// silently treating the values as different and overwriting corrupt data.
func Equal(a, b jsontext.Value) (bool, error) {
	if bytes.Equal(a, b) {
		return true, nil // fast path: identical bytes
	}

	var x, y any
	if err := json.Unmarshal(a, &x); err != nil {
		return false, fmt.Errorf("sqlite.Equal: malformed JSON in stored value: %w", err)
	}

	if err := json.Unmarshal(b, &y); err != nil {
		return false, fmt.Errorf("sqlite.Equal: malformed JSON in incoming value: %w", err)
	}

	return reflect.DeepEqual(x, y), nil
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
