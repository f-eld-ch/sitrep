// Package sqlite implements outbound.UserRepository against the SQLite users table.
// Users are not event-sourced — the table is a plain upsert target keyed on sub.
package sqlite

import (
	"context"
	"database/sql"

	"github.com/google/uuid"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	_ outbound.UserRepository      = (*Repository)(nil)
	_ outbound.FirstUserRepository = (*Repository)(nil)
)

// Repository implements outbound.UserRepository against the SQLite users table.
// The write handle is expected to have MaxOpenConns(1) and _txlock=immediate in
// its DSN, so UpsertAndReportFirst's BEGIN is always IMMEDIATE — the write lock
// replaces pg_advisory_xact_lock.
type Repository struct {
	write *sql.DB
	clock outbound.Clock
}

func NewRepository(write *sql.DB, clock outbound.Clock) *Repository {
	return &Repository{write: write, clock: clock}
}

func (r *Repository) Upsert(ctx context.Context, sub, email, name string) error {
	id := uuid.New().String()
	now := sqlite.FormatTime(r.clock.Now())

	_, err := r.write.ExecContext(ctx, `
		INSERT INTO users (id, sub, email, name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (sub) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = ?`,
		id, sub, email, name, now, now, now)

	return err
}

func (r *Repository) UpsertAndReportFirst(ctx context.Context, sub, email, name string) (bool, error) {
	tx, err := r.write.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	var empty bool
	if err := tx.QueryRowContext(ctx, `SELECT NOT EXISTS (SELECT 1 FROM users)`).Scan(&empty); err != nil {
		return false, err
	}

	id := uuid.New().String()
	now := sqlite.FormatTime(r.clock.Now())

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO users (id, sub, email, name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (sub) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = ?`,
		id, sub, email, name, now, now, now); err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}

	return empty, nil
}
