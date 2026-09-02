package postgres

import (
	"context"
	"fmt"
	"hash/fnv"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// lockClassID namespaces sitrep's advisory locks. Using the two-int4 form of
// pg_try_advisory_lock (classid + objid) places these in a distinct lock space
// from the one-bigint form (pg_locks.objsubid = 2 vs 1), so they cannot collide
// with goose's session lock (internal/cli/migrate.go) or any other tenant of
// the database.
const lockClassID int32 = 0x5352 // "SR" (SitRep)

// Compile-time assertions.
var (
	_ outbound.ProjectorLock       = (*ProjectorLock)(nil)
	_ outbound.LockLivenessChecker = (*ProjectorLock)(nil)
)

// ProjectorLock implements outbound.ProjectorLock with a Postgres session-level
// advisory lock held on a dedicated pooled connection.
//
// The session-level form (pg_try_advisory_lock, not pg_try_advisory_xact_lock)
// is used deliberately: an xact-level lock would require keeping an open
// transaction for the entire process lifetime, causing idle-in-transaction
// overhead, blocking autovacuum, and conflicting with the projector's
// per-event transactions.
//
// # Deployment constraint
//
// Session-level advisory locks are NOT honoured under PgBouncer in
// transaction-pooling mode. In that configuration the session is shared across
// transactions, so two replicas can both succeed with pg_try_advisory_lock and
// believe they are the sole leader. Use session-pooling mode or a direct
// connection when deploying behind a connection proxy.
type ProjectorLock struct {
	pool *pgxpool.Pool
	log  *slog.Logger

	mu   sync.Mutex
	conn *pgxpool.Conn // non-nil while the lock is held
	key  int32
}

// NewProjectorLock returns a ProjectorLock backed by the given pool. One
// pooled connection is held for the lifetime of each successful Acquire.
func NewProjectorLock(pool *pgxpool.Pool) *ProjectorLock {
	return &ProjectorLock{
		pool: pool,
		log:  slog.Default().WithGroup("projector.lock"),
	}
}

// Acquire attempts a non-blocking pg_try_advisory_lock using a dedicated
// connection. It returns outbound.ErrLockHeld if another session holds the
// lock for this projection name. Any other error indicates an infrastructure
// failure.
//
// On success the connection is retained until release is called. The release
// function unlocks the advisory lock and returns the connection to the pool; it
// is idempotent.
func (l *ProjectorLock) Acquire(ctx context.Context, projection string) (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	key := lockKey(projection)

	conn, err := l.pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("projector lock: acquire connection: %w", err)
	}

	var ok bool
	if err := conn.QueryRow(ctx,
		`SELECT pg_try_advisory_lock($1, $2)`, lockClassID, key,
	).Scan(&ok); err != nil {
		conn.Release()
		return nil, fmt.Errorf("projector lock: pg_try_advisory_lock: %w", err)
	}

	if !ok {
		conn.Release()
		return nil, outbound.ErrLockHeld
	}

	l.conn = conn
	l.key = key

	var once sync.Once

	release := func() {
		once.Do(func() {
			// Use a detached context with a generous timeout so the unlock
			// succeeds even when the caller's context is already cancelled
			// (Teardown cancels projCtx before Run returns).
			unlockCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()

			_, unlockErr := conn.Exec(unlockCtx,
				`SELECT pg_advisory_unlock($1, $2)`, lockClassID, key)
			if unlockErr != nil {
				l.log.WarnContext(unlockCtx, "projector lock: advisory unlock failed — lock released by session end",
					"error", unlockErr)
			}

			l.mu.Lock()
			l.conn = nil
			l.mu.Unlock()

			conn.Release()
		})
	}

	return release, nil
}

// CheckHeld verifies that the advisory lock is still held by this session. It
// queries pg_locks on the retained connection, confirming both that the
// connection is alive and that the lock record is present.
//
// Returns an error if the lock was never acquired, the connection was lost, or
// the lock is no longer granted.
func (l *ProjectorLock) CheckHeld(ctx context.Context) error {
	l.mu.Lock()
	conn := l.conn
	key := l.key
	l.mu.Unlock()

	if conn == nil {
		return fmt.Errorf("projector lock: not currently held")
	}

	var count int
	if err := conn.QueryRow(ctx, `
		SELECT count(*)
		FROM pg_locks
		WHERE locktype   = 'advisory'
		  AND classid    = $1
		  AND objid      = $2
		  AND objsubid   = 2
		  AND pid        = pg_backend_pid()
		  AND granted`,
		lockClassID, key,
	).Scan(&count); err != nil {
		return fmt.Errorf("projector lock: liveness check failed: %w", err)
	}

	if count == 0 {
		return fmt.Errorf("projector lock: advisory lock no longer held (session may have been reset)")
	}

	return nil
}

// lockKey derives a stable int32 advisory-lock object-id from a projection
// name using FNV-32a.
//
// STABILITY CONTRACT: the derived key must never change between builds. Two
// builds using different keys for the same projection name would both win the
// election and project concurrently, corrupting read models. The mapping is
// pinned by TestLockKey in lock_test.go — update that test if (and only if)
// the algorithm intentionally changes.
func lockKey(projection string) int32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(projection))

	return int32(h.Sum32()) //nolint:gosec // wrap-around is intentional; we want the full 32-bit range
}
