// Package postgres is the Postgres-backed implementation of the event store ports
// and repository adapters. It provides EventStore, Transactor, Notifier,
// NoopSnapshotStore, WallClock, and all four aggregate repositories.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions: verify all Postgres implementations satisfy their ports.
var (
	_ outbound.EventStore    = (*EventStore)(nil)
	_ outbound.Transactor    = (*Transactor)(nil)
	_ outbound.EventNotifier = (*Notifier)(nil)
	_ outbound.SnapshotStore = NoopSnapshotStore{}
	_ outbound.Clock         = WallClock{}
	_ outbound.IDs           = UUIDGen{}
)

// ──────────────────────────────────────────────────────────────────────────────
// EventStore
// ──────────────────────────────────────────────────────────────────────────────

// EventStore is the Postgres-backed event store.
// It uses (xid8, seq) ordering to avoid the commit-visibility race that SERIAL
// has: xid8 values are monotonic and non-reusable, and pg_snapshot_xmin gives a
// safe watermark below which all transactions have committed.
type EventStore struct {
	pool *pgxpool.Pool
}

func NewEventStore(pool *pgxpool.Pool) *EventStore {
	return &EventStore{pool: pool}
}

func (s *EventStore) Load(ctx context.Context, streamType string, id uuid.UUID) ([]eventsourcing.Event, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at
		  FROM eventsourcing.events
		 WHERE stream_type = $1 AND stream_id = $2
		 ORDER BY version`,
		streamType, id)
	if err != nil {
		return nil, fmt.Errorf("eventstore.Load: %w", err)
	}
	defer rows.Close()

	var events []eventsourcing.Event
	for rows.Next() {
		var e eventsourcing.Event
		var rawData, rawMeta []byte
		if err := rows.Scan(
			&e.StreamType, &e.StreamID, &e.Version, &e.EventType,
			&rawData, &rawMeta,
			&e.OccurredAt, &e.RecordedAt,
		); err != nil {
			return nil, fmt.Errorf("eventstore.Load scan: %w", err)
		}
		e.Data = json.RawMessage(rawData)
		if len(rawMeta) > 0 {
			_ = json.Unmarshal(rawMeta, &e.Metadata)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (s *EventStore) Append(ctx context.Context, a eventsourcing.Aggregate) (outbound.Cursor, error) {
	pending := a.Root().PendingEvents()
	if len(pending) == 0 {
		return nil, nil
	}

	tx, err := TxFromCtx(ctx)
	if err != nil {
		return nil, err
	}

	var lastCursor outbound.Cursor
	for _, e := range pending {
		data, err := json.Marshal(e.Data)
		if err != nil {
			return nil, fmt.Errorf("eventstore.Append marshal data: %w", err)
		}
		meta, err := json.Marshal(e.Metadata)
		if err != nil {
			return nil, fmt.Errorf("eventstore.Append marshal meta: %w", err)
		}

		var xid pgtype.Uint64
		var seq int64
		err = tx.QueryRow(ctx, `
			INSERT INTO eventsourcing.events
			  (stream_type, stream_id, version, event_type, data, metadata, occurred_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING xid, seq`,
			e.StreamType, e.StreamID, e.Version, e.EventType, data, meta, e.OccurredAt.UTC(),
		).Scan(&xid, &seq)
		if err != nil {
			if isUniqueViolation(err) {
				return nil, fmt.Errorf("%w: stream %s/%s version %d",
					errOptimisticConflict, e.StreamType, e.StreamID, e.Version)
			}
			return nil, fmt.Errorf("eventstore.Append insert: %w", err)
		}
		lastCursor = encodeCursor(xid.Uint64, seq)

		if e.Version == 1 {
			if owned, ok := a.(eventsourcing.Owned); ok {
				_, err = tx.Exec(ctx, `
					INSERT INTO eventsourcing.aggregate_index (stream_type, stream_id, incident_id)
					VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
					e.StreamType, e.StreamID, owned.OwnerIncidentID())
				if err != nil {
					return nil, fmt.Errorf("eventstore.Append index: %w", err)
				}
			}
		}
	}

	a.Root().ClearPending()
	return lastCursor, nil
}

func (s *EventStore) Read(ctx context.Context, after outbound.Cursor, limit int) ([]eventsourcing.Event, outbound.Cursor, error) {
	afterXID, afterSeq := decodeCursor(after)

	rows, err := s.pool.Query(ctx, `
		SELECT stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at,
		       xid, seq
		  FROM eventsourcing.events
		 WHERE (xid, seq) > ($1, $2)
		   AND xid < pg_snapshot_xmin(pg_current_snapshot())
		 ORDER BY xid, seq
		 LIMIT $3`,
		pgtype.Uint64{Uint64: afterXID, Valid: true}, afterSeq, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("eventstore.Read: %w", err)
	}
	defer rows.Close()

	var events []eventsourcing.Event
	var cursor outbound.Cursor
	for rows.Next() {
		var e eventsourcing.Event
		var rawData, rawMeta []byte
		var xid pgtype.Uint64
		var seq int64
		if err := rows.Scan(
			&e.StreamType, &e.StreamID, &e.Version, &e.EventType,
			&rawData, &rawMeta,
			&e.OccurredAt, &e.RecordedAt,
			&xid, &seq,
		); err != nil {
			return nil, nil, fmt.Errorf("eventstore.Read scan: %w", err)
		}
		e.Data = json.RawMessage(rawData)
		if len(rawMeta) > 0 {
			_ = json.Unmarshal(rawMeta, &e.Metadata)
		}
		events = append(events, e)
		cursor = encodeCursor(xid.Uint64, seq)
	}
	if rows.Err() != nil {
		return nil, nil, rows.Err()
	}
	if cursor == nil {
		cursor = after
	}
	return events, cursor, nil
}

// IsConflict reports whether err is an optimistic concurrency conflict.
func IsConflict(err error) bool { return errors.Is(err, errOptimisticConflict) }

// ──────────────────────────────────────────────────────────────────────────────
// Transactor
// ──────────────────────────────────────────────────────────────────────────────

type txKey struct{}

// Transactor implements outbound.Transactor using pgxpool.
type Transactor struct {
	pool *pgxpool.Pool
}

func NewTransactor(pool *pgxpool.Pool) *Transactor {
	return &Transactor{pool: pool}
}

func (t *Transactor) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	tx, err := t.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("transactor: begin: %w", err)
	}
	txCtx := context.WithValue(ctx, txKey{}, tx)
	if err := fn(txCtx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

// TxFromCtx extracts the active pgx.Tx from the context, or returns an error if absent.
// Used by EventStore.Append and repositories to run queries within the write transaction.
func TxFromCtx(ctx context.Context) (pgx.Tx, error) {
	tx, ok := ctx.Value(txKey{}).(pgx.Tx)
	if !ok || tx == nil {
		return nil, fmt.Errorf("postgres eventstore: no transaction in context; call WithinTx first")
	}
	return tx, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Notifier (EventNotifier)
// ──────────────────────────────────────────────────────────────────────────────

type Notifier struct {
	pool    *pgxpool.Pool
	channel string
}

func NewNotifier(pool *pgxpool.Pool, channel string) *Notifier {
	if channel == "" {
		channel = "events"
	}
	return &Notifier{pool: pool, channel: channel}
}

func (n *Notifier) Notify(ctx context.Context) error {
	_, err := n.pool.Exec(ctx, fmt.Sprintf("NOTIFY %s", n.channel))
	return err
}

func (n *Notifier) Wait(ctx context.Context) error {
	conn, err := n.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, fmt.Sprintf("LISTEN %s", n.channel)); err != nil {
		return err
	}
	_, err = conn.Conn().WaitForNotification(ctx)
	return err
}

// ──────────────────────────────────────────────────────────────────────────────
// NoopSnapshotStore + WallClock
// ──────────────────────────────────────────────────────────────────────────────

type NoopSnapshotStore struct{}

func (NoopSnapshotStore) Load(_ context.Context, _ string, _ uuid.UUID, _ eventsourcing.Aggregate) (bool, error) {
	return false, nil
}
func (NoopSnapshotStore) Save(_ context.Context, _ eventsourcing.Aggregate) error { return nil }

type WallClock struct{}

func (WallClock) Now() time.Time { return time.Now().UTC() }

// UUIDGen implements outbound.IDs using the random UUID generator.
type UUIDGen struct{}

func (UUIDGen) New() uuid.UUID { return uuid.New() }

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

var errOptimisticConflict = errors.New("optimistic concurrency conflict")

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}

func encodeCursor(xid uint64, seq int64) outbound.Cursor {
	b := make([]byte, 16)
	b[0], b[1], b[2], b[3] = byte(xid>>56), byte(xid>>48), byte(xid>>40), byte(xid>>32)
	b[4], b[5], b[6], b[7] = byte(xid>>24), byte(xid>>16), byte(xid>>8), byte(xid)
	b[8], b[9], b[10], b[11] = byte(seq>>56), byte(seq>>48), byte(seq>>40), byte(seq>>32)
	b[12], b[13], b[14], b[15] = byte(seq>>24), byte(seq>>16), byte(seq>>8), byte(seq)
	return b
}

func decodeCursor(c outbound.Cursor) (xid uint64, seq int64) {
	if len(c) < 16 {
		return 0, 0
	}
	xid = uint64(c[0])<<56 | uint64(c[1])<<48 | uint64(c[2])<<40 | uint64(c[3])<<32 |
		uint64(c[4])<<24 | uint64(c[5])<<16 | uint64(c[6])<<8 | uint64(c[7])
	seq = int64(c[8])<<56 | int64(c[9])<<48 | int64(c[10])<<40 | int64(c[11])<<32 |
		int64(c[12])<<24 | int64(c[13])<<16 | int64(c[14])<<8 | int64(c[15])
	return
}
