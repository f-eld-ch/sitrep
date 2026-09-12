package sqlite

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
)

// UUID stores a uuid.UUID as canonical lowercase hyphenated TEXT in SQLite.
//
// Storing as TEXT (not BLOB) is deliberate:
//   - SQLite does not coerce TEXT↔BLOB. A BLOB column silently returns zero
//     rows on every join against a TEXT column — a correctness hazard with no
//     error signal.
//   - The stored value is readable from the sqlite3 CLI on a Pi without a hex
//     decoder.
//   - UUIDs in JSON event payloads are strings, so TEXT makes
//     json_extract(data,'$.incidentId') = id comparisons work directly.
type UUID struct{ V uuid.UUID }

// Value implements driver.Valuer.
func (u *UUID) Value() (driver.Value, error) { return u.V.String(), nil }

// Scan implements sql.Scanner.
func (u *UUID) Scan(src any) error {
	switch v := src.(type) {
	case string:
		id, err := uuid.Parse(v)
		if err != nil {
			return fmt.Errorf("sqlitex.UUID: parse %q: %w", v, err)
		}

		u.V = id

		return nil
	case []byte:
		id, err := uuid.ParseBytes(v)
		if err != nil {
			return fmt.Errorf("sqlitex.UUID: parse bytes: %w", err)
		}

		u.V = id

		return nil
	case nil:
		u.V = uuid.Nil

		return nil
	}

	return fmt.Errorf("sqlitex.UUID: unsupported type %T", src)
}

// NullUUID maps a nullable uuid column to a Go *uuid.UUID.
type NullUUID struct{ V *uuid.UUID }

// Value implements driver.Valuer. Returns nil (SQL NULL) when V is nil.
//
//nolint:nilnil // returning nil driver.Value is the correct representation of SQL NULL
func (n *NullUUID) Value() (driver.Value, error) {
	if n.V == nil {
		return nil, nil
	}

	return n.V.String(), nil
}

// Scan implements sql.Scanner.
func (n *NullUUID) Scan(src any) error {
	if src == nil {
		n.V = nil

		return nil
	}

	var u UUID
	if err := u.Scan(src); err != nil {
		return err
	}

	n.V = &u.V

	return nil
}

// UUIDs is a []uuid.UUID that serialises to/from a JSON array of UUID strings
// for storage in a TEXT column. It always marshals to a non-null JSON array
// (never "null") so that CHECK(json_valid(…)) and json_type(…)='array' pass.
type UUIDs []uuid.UUID

// Value implements driver.Valuer.
func (u *UUIDs) Value() (driver.Value, error) {
	ids := make([]string, len(*u))
	for i, id := range *u {
		ids[i] = id.String()
	}

	b, err := json.Marshal(ids)
	if err != nil {
		return nil, fmt.Errorf("sqlitex.UUIDs: marshal: %w", err)
	}

	return string(b), nil
}

// Scan implements sql.Scanner. Both NULL and "[]" scan as an empty non-nil
// slice (never nil), matching pgx's behaviour for an empty Postgres uuid[].
func (u *UUIDs) Scan(src any) error {
	*u = UUIDs{} // always non-nil

	var raw string

	switch v := src.(type) {
	case string:
		raw = v
	case []byte:
		raw = string(v)
	case nil:
		return nil
	default:
		return fmt.Errorf("sqlitex.UUIDs: unsupported type %T", src)
	}

	var strs []string
	if err := json.Unmarshal([]byte(raw), &strs); err != nil {
		return fmt.Errorf("sqlitex.UUIDs: unmarshal %q: %w", raw, err)
	}

	result := make(UUIDs, 0, len(strs))

	for _, s := range strs {
		id, err := uuid.Parse(s)
		if err != nil {
			return fmt.Errorf("sqlitex.UUIDs: parse element %q: %w", s, err)
		}

		result = append(result, id)
	}

	*u = result

	return nil
}
