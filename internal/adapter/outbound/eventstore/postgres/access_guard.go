package postgres

import (
	"context"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const accessGuardLockID int32 = 2

type AccessGuard struct{}

func NewAccessGuard() *AccessGuard { return &AccessGuard{} }

func (g *AccessGuard) LockForUpdate(ctx context.Context) (func(), error) {
	tx, err := TxFromCtx(ctx)
	if err != nil {
		return nil, fmt.Errorf("access guard lock: %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, lockClassID, accessGuardLockID); err != nil {
		return nil, fmt.Errorf("access guard lock: %w", err)
	}
	return func() {}, nil
}

var _ outbound.AccessGuard = (*AccessGuard)(nil)
