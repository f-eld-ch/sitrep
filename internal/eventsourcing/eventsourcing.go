// Package eventsourcing is the I/O-free shared kernel for event-sourced aggregates.
//
// Allowed imports: stdlib, github.com/google/uuid only.
// Infrastructure (pgx, echo, gqlgen, otel) must never appear here.
package eventsourcing

import (
	"encoding/json"
	"fmt"
	"reflect"
	"time"

	"github.com/google/uuid"
)

// Event is a single immutable fact stored in the event store.
type Event struct {
	StreamType string
	StreamID   uuid.UUID
	Version    int

	EventType string
	Data      any // concrete domain type after decoding; json.RawMessage before
	Metadata  map[string]any

	OccurredAt time.Time
	RecordedAt time.Time
}

// Root is embedded in every aggregate struct.
type Root struct {
	id       uuid.UUID
	version  int
	pending  []Event
	registry map[string]reflect.Type // eventType → concrete Go type
}

func (r *Root) ID() uuid.UUID          { return r.id }
func (r *Root) Version() int           { return r.version }
func (r *Root) PendingEvents() []Event { return r.pending }
func (r *Root) ClearPending()          { r.pending = nil }

// SetID is called once by the aggregate constructor.
func (r *Root) SetID(id uuid.UUID) { r.id = id }

// Aggregate must be implemented by every aggregate root.
type Aggregate interface {
	Root() *Root
	AggregateType() string
	Transition(Event) error // total: must not fail on a valid event
}

// Register binds event data types to an aggregate so the store can decode them.
// Pass zero-value examples of each event struct the aggregate handles:
//
//	eventsourcing.Register(a, incident.Opened{}, incident.Closed{})
func Register(a Aggregate, examples ...any) {
	root := a.Root()
	if root.registry == nil {
		root.registry = make(map[string]reflect.Type)
	}
	for _, ex := range examples {
		t := reflect.TypeOf(ex)
		if t.Kind() == reflect.Ptr {
			t = t.Elem()
		}
		root.registry[typeName(ex)] = t
	}
}

// TypeFor returns the Go type registered for eventType, or nil if unknown.
// Used by the event store to allocate the target for JSON decoding.
func TypeFor(a Aggregate, eventType string) (reflect.Type, bool) {
	root := a.Root()
	t, ok := root.registry[eventType]
	return t, ok
}

// TrackChange records a new event and immediately applies it to update in-memory
// state, so subsequent commands on the same aggregate see the current state.
// The store calls ClearPending + updates version after a successful Append.
func TrackChange(a Aggregate, data any, occurredAt time.Time, metadata map[string]any) Event {
	root := a.Root()
	e := Event{
		StreamType: a.AggregateType(),
		StreamID:   root.id,
		Version:    root.version + len(root.pending) + 1,
		EventType:  typeName(data),
		Data:       data,
		Metadata:   metadata,
		OccurredAt: occurredAt,
	}
	// Apply immediately so subsequent commands see the updated state.
	// The Data is already the concrete type here (not json.RawMessage), so
	// Transition handles it directly without decoding.
	_ = a.Transition(e) // Transition must be total — never returns an error for a valid event
	root.pending = append(root.pending, e)
	return e
}

// Apply replays a persisted event, decoding its Data from JSON if necessary,
// then calling Transition and advancing the aggregate's version.
// Used by the store during Load.
func Apply(a Aggregate, e Event) error {
	root := a.Root()

	// Decode json.RawMessage into the concrete type registered for this event.
	if raw, ok := e.Data.(json.RawMessage); ok {
		t, registered := TypeFor(a, e.EventType)
		if !registered {
			return fmt.Errorf("eventsourcing: unknown event type %q for aggregate %s", e.EventType, a.AggregateType())
		}
		ptr := reflect.New(t).Interface()
		if err := json.Unmarshal(raw, ptr); err != nil {
			return fmt.Errorf("eventsourcing: decode %s v%d: %w", e.EventType, e.Version, err)
		}
		e.Data = reflect.ValueOf(ptr).Elem().Interface()
	}

	if err := a.Transition(e); err != nil {
		return fmt.Errorf("eventsourcing: transition %s v%d: %w", e.EventType, e.Version, err)
	}
	root.version = e.Version
	return nil
}

// typeName returns the unqualified struct name, e.g. "incident.Opened" → "Opened".
func typeName(v any) string {
	t := fmt.Sprintf("%T", v)
	for i := len(t) - 1; i >= 0; i-- {
		if t[i] == '.' {
			return t[i+1:]
		}
	}
	return t
}
