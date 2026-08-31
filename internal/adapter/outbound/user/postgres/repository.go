// Package postgres implements the outbound.UserRepository port against the
// public.users table. Users are not event-sourced — the table is a plain
// upsert target keyed on the OIDC subject claim.
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.UserRepository = (*Repository)(nil)

// Repository implements outbound.UserRepository.
type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Upsert(ctx context.Context, sub, email, name string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO users (sub, email, name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT ON CONSTRAINT users_name_key
		 DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()`,
		sub, email, name)
	return err
}
