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
var (
	_ outbound.UserRepository      = (*Repository)(nil)
	_ outbound.FirstUserRepository = (*Repository)(nil)
)

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
		 ON CONFLICT (sub)
		 DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()`,
		sub, email, name)

	return err
}

func (r *Repository) UpsertAndReportFirst(ctx context.Context, sub, email, name string) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(17731, 1)`); err != nil {
		return false, err
	}

	var empty bool
	if err := tx.QueryRow(ctx, `SELECT NOT EXISTS (SELECT 1 FROM users)`).Scan(&empty); err != nil {
		return false, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO users (sub, email, name)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (sub)
		 DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = NOW()`,
		sub, email, name,
	); err != nil {
		return false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}

	return empty, nil
}
