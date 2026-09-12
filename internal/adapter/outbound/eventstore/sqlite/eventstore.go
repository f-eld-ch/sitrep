package sqlite

import (
	"context"
	"database/sql"
	"encoding/binary"
	"encoding/json/jsontext"
	"encoding/json/v2"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions.
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

// EventStore is the SQLite-backed event store.
// It uses a single seq column (AUTOINCREMENT rowid alias) as the global stream
// cursor. See doc.go for the single-writer correctness argument.
type EventStore struct {
	read  *sql.DB
	write *sql.DB
	clock outbound.Clock
}

func NewEventStore(read, write *sql.DB, clock outbound.Clock) *EventStore {
	return &EventStore{read: read, write: write, clock: clock}
}

func (s *EventStore) Load(ctx context.Context, streamType string, id uuid.UUID) ([]eventsourcing.Event, error) {
	// Prefer the transaction when one is present so Load inside a write tx
	// sees the current tx's appended events (read-your-own-writes).
	db := s.readHandle(ctx)

	rows, err := db.QueryContext(ctx, `
		SELECT stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at
		  FROM eventsourcing_events
		 WHERE stream_type = ? AND stream_id = ?
		 ORDER BY version`,
		streamType, id.String())
	if err != nil {
		return nil, fmt.Errorf("eventstore.Load: %w", err)
	}

	defer func() { _ = rows.Close() }()

	return scanEvents(rows)
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

	nowStr := sqlite.FormatTime(s.clock.Now())

	var lastSeq int64

	for _, e := range pending {
		data, err := json.Marshal(e.Data)
		if err != nil {
			return nil, fmt.Errorf("eventstore.Append marshal data: %w", err)
		}

		meta, err := json.Marshal(e.Metadata)
		if err != nil {
			return nil, fmt.Errorf("eventstore.Append marshal meta: %w", err)
		}

		occurredStr := sqlite.FormatTime(e.OccurredAt.UTC())

		var seq int64

		err = tx.QueryRowContext(ctx, `
			INSERT INTO eventsourcing_events
			  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			RETURNING seq`,
			e.StreamType, e.StreamID.String(), e.Version, e.EventType,
			string(data), string(meta),
			occurredStr, nowStr,
		).Scan(&seq)
		if err != nil {
			if isUniqueViolation(err) {
				return nil, fmt.Errorf("%w: stream %s/%s version %d",
					errOptimisticConflict, e.StreamType, e.StreamID, e.Version)
			}

			return nil, fmt.Errorf("eventstore.Append insert: %w", err)
		}

		lastSeq = seq

		if e.Version == 1 {
			if owned, ok := a.(eventsourcing.Owned); ok {
				_, err = tx.ExecContext(ctx, `
					INSERT OR IGNORE INTO eventsourcing_aggregate_index (stream_type, stream_id, incident_id)
					VALUES (?, ?, ?)`,
					e.StreamType, e.StreamID.String(), owned.OwnerIncidentID().String())
				if err != nil {
					return nil, fmt.Errorf("eventstore.Append index: %w", err)
				}
			}
		}
	}

	a.Root().ClearPending()

	return encodeCursor(lastSeq), nil
}

func (s *EventStore) Read(
	ctx context.Context,
	after outbound.Cursor,
	limit int,
) ([]eventsourcing.Event, outbound.Cursor, error) {
	afterSeq := decodeCursor(after)

	// Single-writer model: seq order == commit order. No watermark needed.
	rows, err := s.read.QueryContext(ctx, `
		SELECT stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at, seq
		  FROM eventsourcing_events
		 WHERE seq > ?
		 ORDER BY seq
		 LIMIT ?`,
		afterSeq, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("eventstore.Read: %w", err)
	}

	defer func() { _ = rows.Close() }()

	var (
		events []eventsourcing.Event
		cursor outbound.Cursor
	)

	for rows.Next() {
		var (
			e                eventsourcing.Event
			rawData, rawMeta string
			occurredStr      string
			recordedStr      string
			seq              int64
			streamIDStr      string
		)

		if err := rows.Scan(
			&e.StreamType, &streamIDStr, &e.Version, &e.EventType,
			&rawData, &rawMeta,
			&occurredStr, &recordedStr,
			&seq,
		); err != nil {
			return nil, nil, fmt.Errorf("eventstore.Read scan: %w", err)
		}

		id, err := uuid.Parse(streamIDStr)
		if err != nil {
			return nil, nil, fmt.Errorf("eventstore.Read parse stream_id: %w", err)
		}

		e.StreamID = id
		e.Data = jsontext.Value(rawData)

		if len(rawMeta) > 0 {
			_ = json.Unmarshal([]byte(rawMeta), &e.Metadata)
		}

		e.OccurredAt, _ = sqlite.ParseTime(occurredStr)
		e.RecordedAt, _ = sqlite.ParseTime(recordedStr)
		events = append(events, e)
		cursor = encodeCursor(seq)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	if cursor == nil {
		cursor = after
	}

	return events, cursor, nil
}

// dbQuerier is the subset of *sql.DB and *sql.Tx used by Load.
type dbQuerier interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// readHandle returns the active *sql.Tx when inside a WithinTx call so that
// Load sees events appended earlier in the same transaction (read-your-own-
// writes). Outside a transaction it returns the read pool.
func (s *EventStore) readHandle(ctx context.Context) dbQuerier {
	if tx, ok := ctx.Value(txKey{}).(*sql.Tx); ok && tx != nil {
		return tx
	}

	return s.read
}

// scanEvents decodes a *sql.Rows result set into eventsourcing.Event values.
func scanEvents(rows *sql.Rows) ([]eventsourcing.Event, error) {
	var events []eventsourcing.Event

	for rows.Next() {
		var (
			e                eventsourcing.Event
			rawData, rawMeta string
			occurredStr      string
			recordedStr      string
			streamIDStr      string
		)

		if err := rows.Scan(
			&e.StreamType, &streamIDStr, &e.Version, &e.EventType,
			&rawData, &rawMeta,
			&occurredStr, &recordedStr,
		); err != nil {
			return nil, fmt.Errorf("eventstore scan: %w", err)
		}

		id, err := uuid.Parse(streamIDStr)
		if err != nil {
			return nil, fmt.Errorf("eventstore scan parse stream_id: %w", err)
		}

		e.StreamID = id
		e.Data = jsontext.Value(rawData)

		if len(rawMeta) > 0 {
			_ = json.Unmarshal([]byte(rawMeta), &e.Metadata)
		}

		e.OccurredAt, _ = sqlite.ParseTime(occurredStr)
		e.RecordedAt, _ = sqlite.ParseTime(recordedStr)
		events = append(events, e)
	}

	return events, rows.Err()
}

// IsConflict reports whether err is an optimistic concurrency conflict.
func IsConflict(err error) bool { return errors.Is(err, errOptimisticConflict) }

// ──────────────────────────────────────────────────────────────────────────────
// Transactor
// ──────────────────────────────────────────────────────────────────────────────

type txKey struct{}

// Transactor implements outbound.Transactor using the write *sql.DB.
// _txlock=immediate in the DSN promotes every BEGIN to BEGIN IMMEDIATE,
// taking the write lock up front so busy_timeout applies.
type Transactor struct {
	write *sql.DB
}

func NewTransactor(write *sql.DB) *Transactor { return &Transactor{write: write} }

func (t *Transactor) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	tx, err := t.write.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("transactor: begin: %w", err)
	}

	txCtx := context.WithValue(ctx, txKey{}, tx)
	if err := fn(txCtx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

// TxFromCtx extracts the active *sql.Tx from the context, or returns an error.
// Used by EventStore.Append and the small guards that require an open tx.
func TxFromCtx(ctx context.Context) (*sql.Tx, error) {
	tx, ok := ctx.Value(txKey{}).(*sql.Tx)
	if !ok || tx == nil {
		return nil, fmt.Errorf("sqlite eventstore: no transaction in context; call WithinTx first")
	}

	return tx, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Notifier — in-process channel (single-process deployment)
// ──────────────────────────────────────────────────────────────────────────────

// Notifier is the SQLite equivalent of Postgres LISTEN/NOTIFY.
// Because SQLite targets single-machine deployments, a buffered channel is
// sufficient. The projector calls Wait after each catch-up cycle; Append
// (called by the service layer) calls Notify.
type Notifier struct {
	ch chan struct{}
}

func NewNotifier() *Notifier { return &Notifier{ch: make(chan struct{}, 16)} }

func (n *Notifier) Notify(_ context.Context) error {
	select {
	case n.ch <- struct{}{}:
	default:
	}

	return nil
}

func (n *Notifier) Wait(ctx context.Context) error {
	select {
	case <-n.ch:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// NoopSnapshotStore + WallClock + UUIDGen
// ──────────────────────────────────────────────────────────────────────────────

type NoopSnapshotStore struct{}

func (NoopSnapshotStore) Load(_ context.Context, _ string, _ uuid.UUID, _ eventsourcing.Aggregate) (bool, error) {
	return false, nil
}
func (NoopSnapshotStore) Save(_ context.Context, _ eventsourcing.Aggregate) error { return nil }

type WallClock struct{}

func (WallClock) Now() time.Time { return time.Now().UTC() }

// UUIDGen implements outbound.IDs using the time-ordered UUID v7 generator.
// v7 ids sort chronologically, reducing B-tree page splits on SD-card storage.
type UUIDGen struct{}

func (UUIDGen) New() uuid.UUID {
	id, err := uuid.NewV7()
	if err != nil {
		return uuid.New()
	}

	return id
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

var errOptimisticConflict = errors.New("optimistic concurrency conflict")

// isUniqueViolation detects SQLite UNIQUE constraint violations.
// modernc.org/sqlite does not enable extended result codes, so Code() returns
// primary code 19 (SQLITE_CONSTRAINT). We disambiguate from NOT NULL violations
// (also code 19) by matching the error message substring.
// Extended codes 1555/2067 are also checked so a future driver enabling them
// works correctly without code changes.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}

	type sqliteErr interface{ Code() int }

	var sqErr sqliteErr
	if errors.As(err, &sqErr) {
		code := sqErr.Code()
		// 19 = SQLITE_CONSTRAINT (primary), 1555 = SQLITE_CONSTRAINT_PRIMARYKEY,
		// 2067 = SQLITE_CONSTRAINT_UNIQUE
		if code == 1555 || code == 2067 {
			return true
		}

		if code == 19 && strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return true
		}
	}

	// Fallback: string match for environments without the Code() method.
	return strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func encodeCursor(seq int64) outbound.Cursor {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(seq)) // #nosec G115 -- seq is nonnegative

	return b
}

// decodeCursor is strict: a cursor must be exactly 8 bytes. A 16-byte Postgres
// cursor accidentally present in a copied checkpoint row would otherwise decode
// to a huge seq value and stall the projector at "no new events" forever.
func decodeCursor(c outbound.Cursor) int64 {
	if len(c) != 8 {
		return 0
	}

	return int64(c[0])<<56 | int64(c[1])<<48 | int64(c[2])<<40 | int64(c[3])<<32 |
		int64(c[4])<<24 | int64(c[5])<<16 | int64(c[6])<<8 | int64(c[7])
}
