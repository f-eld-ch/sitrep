package readmodel

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.UserRepository = (*UserRepository)(nil)

// UserRepository implements outbound.UserRepository against the public.users table.
type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Upsert(ctx context.Context, sub, email, name string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (sub, email, name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT ON CONSTRAINT users_name_key
		 DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()`,
		sub, email, name)
	return err
}
