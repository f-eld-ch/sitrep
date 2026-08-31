package projection

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// pgxTxFromCtx retrieves the pgx.Tx set by the projector for the current batch.
func pgxTxFromCtx(ctx context.Context) (pgx.Tx, bool) {
	tx, ok := ctx.Value(txKeyType{}).(pgx.Tx)
	return tx, ok && tx != nil
}

// remarshal round-trips the event data through JSON so handlers can decode
// it into the struct they expect, regardless of whether it arrived as a
// concrete type or as json.RawMessage.
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

// nullableJSON returns nil if raw is empty or "null", otherwise the raw bytes.
func nullableJSON(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return []byte(raw)
}

// exec discards the CommandTag so handlers can return Exec errors directly.
func exec(tx pgx.Tx, ctx context.Context, sql string, args ...any) error {
	_, err := tx.Exec(ctx, sql, args...)
	return err
}
