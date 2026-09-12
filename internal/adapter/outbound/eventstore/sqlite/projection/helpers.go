package projection

import (
	"context"
	"database/sql"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"
)

// projTxKey is the context key for the projection transaction.
// It is distinct from the eventstore txKey so projection and service transactions
// never leak into each other.
type projTxKey struct{}

// txFromCtx retrieves the *sql.Tx set by applyInTx for the current event.
func txFromCtx(ctx context.Context) (*sql.Tx, bool) {
	tx, ok := ctx.Value(projTxKey{}).(*sql.Tx)
	return tx, ok && tx != nil
}

// exec discards the sql.Result so handlers can return errors directly.
func exec(tx *sql.Tx, ctx context.Context, query string, args ...any) error {
	_, err := tx.ExecContext(ctx, query, args...)
	return err
}

// remarshal round-trips event data through JSON so handlers can decode it
// into the struct they expect regardless of whether it arrived as a concrete
// type or as jsontext.Value.
func remarshal(data any, dst any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("remarshal marshal: %w", err)
	}

	if err := json.Unmarshal(b, dst); err != nil {
		return fmt.Errorf("remarshal unmarshal into %T: %w", dst, err)
	}

	return nil
}

// nullableJSON returns nil for empty or "null" JSON; otherwise returns the raw bytes.
// In SQLite TEXT columns, nil binds as NULL.
func nullableJSON(raw jsontext.Value) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}

	return string(raw)
}

// btoi converts a bool to 0/1 for STRICT INTEGER columns.
// SQLite STRICT mode rejects true/false; use explicit integers.
func btoi(b bool) int {
	if b {
		return 1
	}

	return 0
}
