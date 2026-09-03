// Package outbound defines the driven (outbound) ports — interfaces the
// application core requires from infrastructure. Nothing in this package
// imports pgx, echo, gqlgen or any adapter.
package outbound

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ──────────────────────────────────────────────────────────────────────────────
// Transactor — owns the transaction boundary
// ──────────────────────────────────────────────────────────────────────────────

// Transactor opens and commits a database transaction, passing a
// transaction-aware context to fn. The Postgres adapter stores the pgx.Tx
// inside the context; the in-memory adapter is a no-op that still enforces
// "no write outside a transaction" by construction.
type Transactor interface {
	WithinTx(ctx context.Context, fn func(context.Context) error) error
}

// ──────────────────────────────────────────────────────────────────────────────
// EventStore — the event log
// ──────────────────────────────────────────────────────────────────────────────

// Cursor is an opaque position in the event stream. Its internal representation
// is store-specific: (xid, seq) on Postgres, a rowid on SQLite. Nothing outside
// the store may interpret or compare cursors across store implementations.
type Cursor []byte

// EventStore is the append-only event log.
type EventStore interface {
	// Load replays all events for one aggregate stream in version order.
	Load(ctx context.Context, streamType string, id uuid.UUID) ([]eventsourcing.Event, error)

	// Append writes the aggregate's pending events atomically.
	// Returns the cursor of the last written event for consistent-read tokens.
	// Fails with a conflict error if another writer advanced the version.
	Append(ctx context.Context, a eventsourcing.Aggregate) (Cursor, error)

	// Read returns the next batch of global events starting after the given cursor,
	// ordered by (xid, seq). Used by the projector's catch-up loop.
	Read(ctx context.Context, after Cursor, limit int) ([]eventsourcing.Event, Cursor, error)
}

// ──────────────────────────────────────────────────────────────────────────────
// SnapshotStore — optional aggregate snapshots (default: no-op)
// ──────────────────────────────────────────────────────────────────────────────

// SnapshotStore persists and restores aggregate snapshots to amortise replay cost.
// The default implementation is a no-op — Load reports not-found, Save discards.
// A snapshot is always discardable: on schema-version mismatch the store throws
// it away and the repository replays from zero. Enable per aggregate type only
// on measured load latency, never speculatively.
type SnapshotStore interface {
	Load(ctx context.Context, streamType string, id uuid.UUID, a eventsourcing.Aggregate) (found bool, err error)
	Save(ctx context.Context, a eventsourcing.Aggregate) error
}

// ──────────────────────────────────────────────────────────────────────────────
// Infrastructure ports — kept clean of any concrete type
// ──────────────────────────────────────────────────────────────────────────────

// Clock provides the current wall-clock time. Injected into services so that
// the domain never calls time.Now() — making aggregate output deterministic.
type Clock interface {
	Now() time.Time
}

// IDs generates new unique identifiers. Injected into services so that the
// domain never calls uuid.New() — making aggregate output deterministic.
type IDs interface {
	New() uuid.UUID
}

// EventNotifier sends and receives change notifications so the projector can
// wake on commit rather than polling. On Postgres this is LISTEN/NOTIFY; on
// SQLite (single process) it is a buffered channel.
type EventNotifier interface {
	Notify(ctx context.Context) error
	Wait(ctx context.Context) error
}

// ErrLockHeld is returned by ProjectorLock.Acquire when another instance
// already holds the lock. Callers should idle and retry, not treat it as a
// failure.
var ErrLockHeld = errors.New("projector lock held by another instance")

// ProjectorLock provides a singleton lock so only one projector instance runs
// per projection at a time. Extra replicas acquire no lock and idle.
// On Postgres this is a session-level pg_try_advisory_lock; on SQLite/in-memory
// it is a sync.Mutex.
//
// Acquire is non-blocking: it returns ErrLockHeld when another instance holds
// the lock. release is nil on any error and must only be called after a nil
// error; it is idempotent.
type ProjectorLock interface {
	Acquire(ctx context.Context, projection string) (release func(), err error)
}

// LockLivenessChecker is an optional ProjectorLock extension for backends whose
// lock can be silently lost — a Postgres session-level advisory lock disappears
// if the underlying connection drops. A leader that implements this interface
// checks liveness after each catch-up cycle and steps down on failure, instead
// of running as a split-brain leader.
type LockLivenessChecker interface {
	// CheckHeld verifies the lock returned by the last successful Acquire is
	// still held by this instance.
	CheckHeld(ctx context.Context) error
}

// Projector reads the global event stream and applies handlers to read models.
// Run blocks until ctx is cancelled.
type Projector interface {
	Run(ctx context.Context) error
}
