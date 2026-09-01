// Package inmem provides in-memory implementations of the write-side ports.
//
// These are real adapters, not test scaffolding: they prove a second
// implementation is possible and let every core/service test run without
// a database. Scope is write-side only — no read-model implementations.
package inmem

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertions: verify inmem implementations satisfy their ports.
var (
	_ outbound.EventStore     = (*EventStore)(nil)
	_ outbound.Transactor     = (*Transactor)(nil)
	_ outbound.EventNotifier  = (*Notifier)(nil)
	_ outbound.SnapshotStore  = SnapshotStore{}
	_ outbound.Clock          = WallClock{}
	_ outbound.IDs            = UUIDGen{}
	_ outbound.MessageCounter = (*MessageCounter)(nil)
	_ outbound.Projector      = (*Projector)(nil)
)

// ──────────────────────────────────────────────────────────────────────────────
// EventStore
// ──────────────────────────────────────────────────────────────────────────────

type streamKey struct {
	streamType string
	id         uuid.UUID
}

// EventStore is an in-memory event store safe for concurrent use.
type EventStore struct {
	mu      sync.RWMutex
	streams map[streamKey][]eventsourcing.Event
	global  []eventsourcing.Event
	seq     int64
}

func NewEventStore() *EventStore {
	return &EventStore{streams: make(map[streamKey][]eventsourcing.Event)}
}

func (s *EventStore) Load(_ context.Context, streamType string, id uuid.UUID) ([]eventsourcing.Event, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	key := streamKey{streamType: streamType, id: id}
	events := s.streams[key]
	if len(events) == 0 {
		return nil, nil
	}
	out := make([]eventsourcing.Event, len(events))
	copy(out, events)
	return out, nil
}

func (s *EventStore) Append(_ context.Context, a eventsourcing.Aggregate) (outbound.Cursor, error) {
	pending := a.Root().PendingEvents()
	if len(pending) == 0 {
		return nil, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	key := streamKey{streamType: a.AggregateType(), id: a.Root().ID()}
	existing := s.streams[key]

	if len(existing) > 0 && pending[0].Version != len(existing)+1 {
		return nil, fmt.Errorf("inmem: optimistic conflict on %s/%s: expected v%d, got v%d",
			a.AggregateType(), a.Root().ID(), len(existing)+1, pending[0].Version)
	}

	var lastSeq int64
	for _, e := range pending {
		// Round-trip through JSON so Apply decoding is exercised in service tests.
		data, _ := json.Marshal(e.Data)
		e.Data = json.RawMessage(data)
		e.RecordedAt = time.Now().UTC()

		lastSeq = atomic.AddInt64(&s.seq, 1)
		existing = append(existing, e)
		s.global = append(s.global, e)
	}
	s.streams[key] = existing
	a.Root().ClearPending()

	return encodeInmemCursor(lastSeq), nil
}

func (s *EventStore) Read(_ context.Context, after outbound.Cursor, limit int) ([]eventsourcing.Event, outbound.Cursor, error) {
	afterSeq := decodeInmemCursor(after)

	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []eventsourcing.Event
	var lastSeq int64
	for i, e := range s.global {
		eSeq := int64(i + 1)
		if eSeq > afterSeq {
			out = append(out, e)
			lastSeq = eSeq
			if len(out) >= limit {
				break
			}
		}
	}
	cursor := after
	if len(out) > 0 {
		cursor = encodeInmemCursor(lastSeq)
	}
	return out, cursor, nil
}

func encodeInmemCursor(seq int64) outbound.Cursor {
	b := make([]byte, 8)
	b[0] = byte(seq >> 56)
	b[1] = byte(seq >> 48)
	b[2] = byte(seq >> 40)
	b[3] = byte(seq >> 32)
	b[4] = byte(seq >> 24)
	b[5] = byte(seq >> 16)
	b[6] = byte(seq >> 8)
	b[7] = byte(seq)
	return b
}

func decodeInmemCursor(c outbound.Cursor) int64 {
	if len(c) < 8 {
		return 0
	}
	return int64(c[0])<<56 | int64(c[1])<<48 | int64(c[2])<<40 | int64(c[3])<<32 |
		int64(c[4])<<24 | int64(c[5])<<16 | int64(c[6])<<8 | int64(c[7])
}

// ──────────────────────────────────────────────────────────────────────────────
// Transactor — no-op that still enforces "call WithinTx first"
// ──────────────────────────────────────────────────────────────────────────────

type txKey struct{}

type Transactor struct{}

func NewTransactor() *Transactor { return &Transactor{} }

func (t *Transactor) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	txCtx := context.WithValue(ctx, txKey{}, true)
	return fn(txCtx)
}

// ──────────────────────────────────────────────────────────────────────────────
// EventNotifier — in-process channel
// ──────────────────────────────────────────────────────────────────────────────

type Notifier struct {
	ch chan struct{}
}

func NewNotifier() *Notifier {
	return &Notifier{ch: make(chan struct{}, 16)}
}

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
// SnapshotStore — no-op
// ──────────────────────────────────────────────────────────────────────────────

type SnapshotStore struct{}

func (SnapshotStore) Load(_ context.Context, _ string, _ uuid.UUID, _ eventsourcing.Aggregate) (bool, error) {
	return false, nil
}
func (SnapshotStore) Save(_ context.Context, _ eventsourcing.Aggregate) error { return nil }

// ──────────────────────────────────────────────────────────────────────────────
// IDs + Clock
// ──────────────────────────────────────────────────────────────────────────────

type UUIDGen struct{}

func (UUIDGen) New() uuid.UUID { return uuid.New() }

type WallClock struct{}

func (WallClock) Now() time.Time { return time.Now().UTC() }

// ──────────────────────────────────────────────────────────────────────────────
// MessageCounter — in-memory atomic counter per incident
// ──────────────────────────────────────────────────────────────────────────────

// MessageCounter is a thread-safe per-incident sequence counter for use in
// service tests. Unlike the Postgres variant it does not require a transaction.
type MessageCounter struct {
	mu       sync.Mutex
	counters map[string]int
}

func NewMessageCounter() *MessageCounter {
	return &MessageCounter{counters: make(map[string]int)}
}

func (c *MessageCounter) Next(_ context.Context, incidentID shared.IncidentID) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counters[incidentID.String()]++
	return c.counters[incidentID.String()], nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Projector — no-op for testing; satisfies outbound.Projector
// ──────────────────────────────────────────────────────────────────────────────

// Projector is a no-op projector for service-level tests where read-model
// correctness is tested separately against a real Postgres instance. It blocks
// until ctx is cancelled, exactly like the real projector does.
type Projector struct{}

func NewProjector() *Projector { return &Projector{} }

func (p *Projector) Run(ctx context.Context) error {
	<-ctx.Done()
	return ctx.Err()
}
