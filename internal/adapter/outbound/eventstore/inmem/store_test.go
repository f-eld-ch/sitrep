package inmem_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ── Minimal aggregate for store tests ────────────────────────────────────────

type WidgetCreated struct{ Name string }
type WidgetRenamed struct{ Name string }

type widget struct {
	root eventsourcing.Root
	Name string
}

func newWidget(id uuid.UUID) *widget {
	a := &widget{}
	a.root.SetID(id)
	eventsourcing.Register(a, WidgetCreated{}, WidgetRenamed{})
	return a
}

func (a *widget) Root() *eventsourcing.Root { return &a.root }
func (a *widget) AggregateType() string     { return "Widget" }
func (a *widget) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case WidgetCreated:
		a.Name = d.Name
	case WidgetRenamed:
		a.Name = d.Name
	}
	return nil
}

var bg = context.Background()

func track(a *widget, data any) {
	eventsourcing.TrackChange(a, data, time.Now().UTC(), nil)
}

// ── EventStore.Load ───────────────────────────────────────────────────────────

func TestEventStore_Load_EmptyStream(t *testing.T) {
	s := inmem.NewEventStore()
	events, err := s.Load(bg, "Widget", uuid.New())
	require.NoError(t, err)
	assert.Empty(t, events)
}

func TestEventStore_Load_AfterAppend(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "Gadget"})

	_, err := s.Append(bg, a)
	require.NoError(t, err)

	events, err := s.Load(bg, "Widget", a.Root().ID())
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, "WidgetCreated", events[0].EventType)
}

func TestEventStore_Load_ReturnsCopy(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "X"})
	_, err := s.Append(bg, a)
	require.NoError(t, err)

	events1, _ := s.Load(bg, "Widget", a.Root().ID())
	events2, _ := s.Load(bg, "Widget", a.Root().ID())
	// Mutations to the returned slice must not affect subsequent loads.
	events1[0].EventType = "tampered"
	assert.Equal(t, "WidgetCreated", events2[0].EventType)
}

// ── EventStore.Append ─────────────────────────────────────────────────────────

func TestEventStore_Append_NoPending_ReturnNilCursor(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())

	cursor, err := s.Append(bg, a)
	require.NoError(t, err)
	assert.Nil(t, cursor)
}

func TestEventStore_Append_ClearsPending(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "Y"})
	require.Len(t, a.Root().PendingEvents(), 1)

	_, err := s.Append(bg, a)
	require.NoError(t, err)
	assert.Empty(t, a.Root().PendingEvents())
}

func TestEventStore_Append_OptimisticConflict(t *testing.T) {
	s := inmem.NewEventStore()

	// First writer appends v1.
	a1 := newWidget(uuid.New())
	track(a1, WidgetCreated{Name: "A"})
	_, err := s.Append(bg, a1)
	require.NoError(t, err)

	// Second writer loads the same stream and tries to append a competing v1.
	a2 := newWidget(a1.Root().ID())
	track(a2, WidgetCreated{Name: "B"}) // version 1 again → conflict

	_, err = s.Append(bg, a2)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "optimistic conflict")
}

func TestEventStore_Append_MultipleEvents(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "V1"})
	track(a, WidgetRenamed{Name: "V2"})

	_, err := s.Append(bg, a)
	require.NoError(t, err)

	events, _ := s.Load(bg, "Widget", a.Root().ID())
	require.Len(t, events, 2)
	assert.Equal(t, "WidgetRenamed", events[1].EventType)
}

// ── EventStore.Read ───────────────────────────────────────────────────────────

func TestEventStore_Read_FromBeginning(t *testing.T) {
	s := inmem.NewEventStore()
	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "R1"})
	track(a, WidgetRenamed{Name: "R2"})
	_, err := s.Append(bg, a)
	require.NoError(t, err)

	events, cursor, err := s.Read(bg, nil, 100)
	require.NoError(t, err)
	assert.Len(t, events, 2)
	assert.NotNil(t, cursor)
}

func TestEventStore_Read_PaginationWithLimit(t *testing.T) {
	s := inmem.NewEventStore()
	for i := 0; i < 5; i++ {
		w := newWidget(uuid.New())
		track(w, WidgetCreated{Name: "w"})
		_, err := s.Append(bg, w)
		require.NoError(t, err)
	}

	page1, cur1, err := s.Read(bg, nil, 3)
	require.NoError(t, err)
	assert.Len(t, page1, 3)

	page2, _, err := s.Read(bg, cur1, 10)
	require.NoError(t, err)
	assert.Len(t, page2, 2)
}

func TestEventStore_Read_EmptyStore(t *testing.T) {
	s := inmem.NewEventStore()
	events, cursor, err := s.Read(bg, nil, 10)
	require.NoError(t, err)
	assert.Empty(t, events)
	assert.Nil(t, cursor)
}

func TestEventStore_Read_CursorIdempotent(t *testing.T) {
	s := inmem.NewEventStore()
	w := newWidget(uuid.New())
	track(w, WidgetCreated{Name: "x"})
	_, err := s.Append(bg, w)
	require.NoError(t, err)

	_, cur, _ := s.Read(bg, nil, 10)
	// Reading again with the last cursor returns nothing new.
	events, _, err := s.Read(bg, cur, 10)
	require.NoError(t, err)
	assert.Empty(t, events)
}

// ── Notifier ──────────────────────────────────────────────────────────────────

func TestNotifier_NotifyAndWait(t *testing.T) {
	n := inmem.NewNotifier()

	require.NoError(t, n.Notify(bg))

	err := n.Wait(bg)
	require.NoError(t, err)
}

func TestNotifier_Wait_CancelledContext(t *testing.T) {
	n := inmem.NewNotifier()
	ctx, cancel := context.WithCancel(bg)
	cancel()

	err := n.Wait(ctx)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestNotifier_Notify_NonBlocking(t *testing.T) {
	n := inmem.NewNotifier()
	// Fill the channel buffer (size 16) — further Notify calls must not block.
	for i := 0; i < 20; i++ {
		require.NoError(t, n.Notify(bg))
	}
}

// ── MessageCounter ────────────────────────────────────────────────────────────

func TestMessageCounter_SequentialPerIncident(t *testing.T) {
	c := inmem.NewMessageCounter()
	id := shared.IncidentID(uuid.New())

	n1, err := c.Next(bg, id)
	require.NoError(t, err)
	n2, err := c.Next(bg, id)
	require.NoError(t, err)
	n3, err := c.Next(bg, id)
	require.NoError(t, err)

	assert.Equal(t, 1, n1)
	assert.Equal(t, 2, n2)
	assert.Equal(t, 3, n3)
}

func TestMessageCounter_IndependentPerIncident(t *testing.T) {
	c := inmem.NewMessageCounter()
	idA := shared.IncidentID(uuid.New())
	idB := shared.IncidentID(uuid.New())

	nA1, _ := c.Next(bg, idA)
	nA2, _ := c.Next(bg, idA)
	nB1, _ := c.Next(bg, idB)

	assert.Equal(t, 1, nA1)
	assert.Equal(t, 2, nA2)
	assert.Equal(t, 1, nB1, "counter for B must start independently at 1")
}
