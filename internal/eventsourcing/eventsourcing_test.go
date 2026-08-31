package eventsourcing_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ── Minimal test aggregate ────────────────────────────────────────────────────

type (
	ThingCreated struct{ Name string }
	ThingRenamed struct{ Name string }
	ThingDeleted struct{}
)

type thing struct {
	root    eventsourcing.Root
	Name    string
	Deleted bool
}

func newThing(id uuid.UUID) *thing {
	a := &thing{}
	a.root.SetID(id)
	eventsourcing.Register(a, ThingCreated{}, ThingRenamed{}, ThingDeleted{})
	return a
}

func (a *thing) Root() *eventsourcing.Root { return &a.root }
func (a *thing) AggregateType() string     { return "Thing" }
func (a *thing) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case ThingCreated:
		a.Name = d.Name
	case ThingRenamed:
		a.Name = d.Name
	case ThingDeleted:
		a.Deleted = true
	}
	return nil
}

var now = time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

// ── Register / TypeFor ────────────────────────────────────────────────────────

func TestRegister_TypeFor_KnownType(t *testing.T) {
	a := newThing(uuid.New())

	typ, ok := eventsourcing.TypeFor(a, "ThingCreated")
	require.True(t, ok)
	assert.Equal(t, "ThingCreated", typ.Name())
}

func TestTypeFor_UnknownType(t *testing.T) {
	a := newThing(uuid.New())

	_, ok := eventsourcing.TypeFor(a, "DoesNotExist")
	assert.False(t, ok)
}

func TestRegister_PointerExampleNormalisedToValue(t *testing.T) {
	a := newThing(uuid.New())
	// Registering a *ThingCreated pointer should still be found by value name.
	eventsourcing.Register(a, &ThingCreated{})

	_, ok := eventsourcing.TypeFor(a, "ThingCreated")
	assert.True(t, ok)
}

// ── TrackChange ───────────────────────────────────────────────────────────────

func TestTrackChange_AppendsEvent(t *testing.T) {
	a := newThing(uuid.New())

	e := eventsourcing.TrackChange(a, ThingCreated{Name: "Foo"}, now, nil)

	assert.Equal(t, "Thing", e.StreamType)
	assert.Equal(t, "ThingCreated", e.EventType)
	assert.Equal(t, 1, e.Version)
	assert.Equal(t, now, e.OccurredAt)
	assert.Len(t, a.root.PendingEvents(), 1)
}

func TestTrackChange_AppliesImmediately(t *testing.T) {
	a := newThing(uuid.New())

	eventsourcing.TrackChange(a, ThingCreated{Name: "Bar"}, now, nil)

	// State is updated before Append; a second command can see it.
	assert.Equal(t, "Bar", a.Name)
}

func TestTrackChange_VersionIncrements(t *testing.T) {
	a := newThing(uuid.New())

	eventsourcing.TrackChange(a, ThingCreated{Name: "v1"}, now, nil)
	eventsourcing.TrackChange(a, ThingRenamed{Name: "v2"}, now, nil)

	pending := a.Root().PendingEvents()
	assert.Equal(t, 1, pending[0].Version)
	assert.Equal(t, 2, pending[1].Version)
	assert.Equal(t, "v2", a.Name)
}

func TestTrackChange_MetadataPassedThrough(t *testing.T) {
	a := newThing(uuid.New())
	meta := map[string]any{"actor": "alice"}

	e := eventsourcing.TrackChange(a, ThingCreated{Name: "X"}, now, meta)

	assert.Equal(t, "alice", e.Metadata["actor"])
}

func TestClearPending_EmptiesQueue(t *testing.T) {
	a := newThing(uuid.New())
	eventsourcing.TrackChange(a, ThingCreated{Name: "X"}, now, nil)
	require.Len(t, a.Root().PendingEvents(), 1)

	a.Root().ClearPending()

	assert.Empty(t, a.Root().PendingEvents())
}

// ── Apply ─────────────────────────────────────────────────────────────────────

func TestApply_DecodesJSONAndTransitions(t *testing.T) {
	a := newThing(uuid.New())

	raw, _ := json.Marshal(ThingCreated{Name: "decoded"})
	e := eventsourcing.Event{
		StreamType: "Thing",
		StreamID:   a.Root().ID(),
		Version:    1,
		EventType:  "ThingCreated",
		Data:       json.RawMessage(raw),
		OccurredAt: now,
	}

	require.NoError(t, eventsourcing.Apply(a, e))
	assert.Equal(t, "decoded", a.Name)
	assert.Equal(t, 1, a.Root().Version())
}

func TestApply_AdvancesVersion(t *testing.T) {
	a := newThing(uuid.New())

	for i := 1; i <= 3; i++ {
		raw, _ := json.Marshal(ThingRenamed{Name: "step"})
		e := eventsourcing.Event{
			Version: i, EventType: "ThingRenamed",
			Data: json.RawMessage(raw),
		}
		require.NoError(t, eventsourcing.Apply(a, e))
		assert.Equal(t, i, a.Root().Version())
	}
}

func TestApply_ConcreteDataSkipsDecoding(t *testing.T) {
	// When Data is already a concrete type (TrackChange path), Apply skips JSON
	// decoding and passes it directly to Transition.
	a := newThing(uuid.New())

	e := eventsourcing.Event{
		Version:   1,
		EventType: "ThingDeleted",
		Data:      ThingDeleted{}, // concrete, not json.RawMessage
	}

	require.NoError(t, eventsourcing.Apply(a, e))
	assert.True(t, a.Deleted)
}

func TestApply_UnknownEventType_ReturnsError(t *testing.T) {
	a := newThing(uuid.New())

	raw, _ := json.Marshal(struct{}{})
	e := eventsourcing.Event{
		Version:   1,
		EventType: "Unregistered",
		Data:      json.RawMessage(raw),
	}

	err := eventsourcing.Apply(a, e)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown event type")
}

func TestApply_MalformedJSON_ReturnsError(t *testing.T) {
	a := newThing(uuid.New())

	e := eventsourcing.Event{
		Version:   1,
		EventType: "ThingCreated",
		Data:      json.RawMessage(`{bad json`),
	}

	err := eventsourcing.Apply(a, e)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

// ── Root accessors ────────────────────────────────────────────────────────────

func TestRoot_IDAndVersion(t *testing.T) {
	id := uuid.New()
	a := newThing(id)

	assert.Equal(t, id, a.Root().ID())
	assert.Equal(t, 0, a.Root().Version())
}
