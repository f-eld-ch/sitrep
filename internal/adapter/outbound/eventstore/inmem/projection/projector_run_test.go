package projection_test

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// logStore is an event store reduced to what the projector uses: a global log that can be
// appended to and read in batches. The cursor is the number of events already read.
type logStore struct {
	mu      sync.Mutex
	events  []eventsourcing.Event
	readErr error
}

func (s *logStore) add(events ...eventsourcing.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.events = append(s.events, events...)
}

func (s *logStore) Read(
	_ context.Context,
	after outbound.Cursor,
	limit int,
) ([]eventsourcing.Event, outbound.Cursor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.readErr != nil {
		return nil, after, s.readErr
	}

	from := 0
	if after != nil {
		from, _ = strconv.Atoi(string(after))
	}

	to := min(from+limit, len(s.events))

	return append([]eventsourcing.Event(nil), s.events[from:to]...), outbound.Cursor(strconv.Itoa(to)), nil
}

func (*logStore) Load(context.Context, string, uuid.UUID) ([]eventsourcing.Event, error) {
	return nil, errors.New("not used")
}

func (*logStore) LoadMany(context.Context, string, []uuid.UUID) (map[uuid.UUID][]eventsourcing.Event, error) {
	return nil, errors.New("not used")
}

func (*logStore) Append(context.Context, eventsourcing.Aggregate) (outbound.Cursor, error) {
	return nil, errors.New("not used")
}

// recorder is a handler that remembers what it was given.
type recorder struct {
	name    string
	handles string // stream type it is interested in
	mu      sync.Mutex
	applied []int
	resets  int
	failOn  int // version whose Apply fails (0 = never)
	failErr error
	once    bool // fail only the first time failOn is reached
	resetEr error
	signal  chan int // receives the version of every applied event, when set
}

func (r *recorder) Name() string              { return r.name }
func (r *recorder) Version() int              { return 1 }
func (r *recorder) Handles(st, _ string) bool { return st == r.handles }
func (r *recorder) Reset(_ context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.resets++
	r.applied = nil

	return r.resetEr
}

func (r *recorder) Apply(_ context.Context, e eventsourcing.Event) error {
	r.mu.Lock()
	if r.failOn == e.Version {
		if r.once {
			r.failOn = 0
		}

		r.mu.Unlock()

		return r.failErr
	}

	r.applied = append(r.applied, e.Version)
	signal := r.signal
	r.mu.Unlock()

	if signal != nil {
		signal <- e.Version
	}

	return nil
}

func (r *recorder) versions() []int {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]int(nil), r.applied...)
}

func versioned(streamType string, version int) eventsourcing.Event {
	e := evt(streamType, uuid.New(), "Something", obj{}, tm(version))
	e.Version = version

	return e
}

func TestProjector_CatchUpAppliesOnlyHandledEventsInOrderAndOnlyOnce(t *testing.T) {
	store := &logStore{}
	incidents := &recorder{name: "incidents", handles: "Incident"}
	messages := &recorder{name: "messages", handles: "Message"}
	p := projection.NewProjector(store, []projection.Handler{incidents, messages})

	store.add(versioned("Incident", 1), versioned("Message", 2), versioned("Incident", 3))
	require.NoError(t, p.CatchUp(t.Context()))

	assert.Equal(t, []int{1, 3}, incidents.versions())
	assert.Equal(t, []int{2}, messages.versions())

	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, []int{1, 3}, incidents.versions(), "a second pass does not reapply")

	store.add(versioned("Message", 4))
	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, []int{1, 3}, incidents.versions())
	assert.Equal(t, []int{2, 4}, messages.versions(), "only the new event is applied")
}

func TestProjector_CatchUpReadsAllBatches(t *testing.T) {
	store := &logStore{}
	h := &recorder{name: "h", handles: "Incident"}
	p := projection.NewProjector(store, []projection.Handler{h})

	// More than two batches of 100, and not a multiple of the batch size.
	const total = 250

	want := make([]int, total)
	for i := range total {
		want[i] = i + 1
		store.add(versioned("Incident", i+1))
	}

	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, want, h.versions())
}

func TestProjector_CatchUpErrors(t *testing.T) {
	t.Run("a failing handler stops the pass and the failed event is retried", func(t *testing.T) {
		store := &logStore{}
		boom := errors.New("boom")
		failing := &recorder{name: "failing", handles: "Incident", failOn: 2, failErr: boom}
		later := &recorder{name: "later", handles: "Incident"}
		p := projection.NewProjector(store, []projection.Handler{failing, later})

		store.add(versioned("Incident", 1), versioned("Incident", 2))

		err := p.CatchUp(t.Context())
		require.ErrorIs(t, err, boom)
		assert.Contains(t, err.Error(), "failing")
		assert.Contains(t, err.Error(), "v2")
		assert.Empty(t, later.versions(), "handlers after the failing one are not reached")

		failing.mu.Lock()
		failing.failOn = 0
		failing.mu.Unlock()

		require.NoError(t, p.CatchUp(t.Context()))
		assert.Equal(
			t,
			[]int{1, 2},
			failing.versions()[len(failing.versions())-2:],
			"the batch is replayed from its start",
		)
		assert.Equal(t, []int{1, 2}, later.versions())
	})

	t.Run("a failing read names the handler", func(t *testing.T) {
		store := &logStore{readErr: errors.New("disk gone")}
		p := projection.NewProjector(store, []projection.Handler{&recorder{name: "h", handles: "Incident"}})

		err := p.CatchUp(t.Context())
		require.ErrorContains(t, err, "disk gone")
		assert.ErrorContains(t, err, "read for h")
	})

	t.Run("a cancelled read is reported as cancellation", func(t *testing.T) {
		store := &logStore{readErr: context.Canceled}
		p := projection.NewProjector(store, []projection.Handler{&recorder{name: "h", handles: "Incident"}})

		require.ErrorIs(t, p.CatchUp(t.Context()), context.Canceled)
	})
}

func TestProjector_ResetRebuildsFromTheStartOfTheLog(t *testing.T) {
	store := &logStore{}
	h := &recorder{name: "h", handles: "Incident"}
	p := projection.NewProjector(store, []projection.Handler{h})

	store.add(versioned("Incident", 1), versioned("Incident", 2))
	require.NoError(t, p.CatchUp(t.Context()))
	require.Equal(t, []int{1, 2}, h.versions())

	require.NoError(t, p.Reset(t.Context()))
	assert.Equal(t, 1, h.resets)
	assert.Equal(t, []int{1, 2}, h.versions(), "reset clears the state and replays the whole log")

	t.Run("a failing reset is reported and nothing is replayed", func(t *testing.T) {
		boom := errors.New("cannot reset")
		bad := &recorder{name: "bad", handles: "Incident", resetEr: boom}
		p := projection.NewProjector(store, []projection.Handler{bad})

		err := p.Reset(t.Context())
		require.ErrorIs(t, err, boom)
		require.ErrorContains(t, err, "reset bad")
		assert.Empty(t, bad.versions())
	})
}

func TestProjector_RunWithoutNotifierCatchesUpThenWaitsForCancellation(t *testing.T) {
	store := &logStore{}
	h := &recorder{name: "h", handles: "Incident", signal: make(chan int, 10)}
	p := projection.NewProjector(store, []projection.Handler{h})

	store.add(versioned("Incident", 1))

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() { done <- p.Run(ctx) }()

	assert.Equal(t, 1, <-h.signal, "the initial catch-up ran")

	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
}

func TestProjector_RunReturnsAnInitialCatchUpFailure(t *testing.T) {
	boom := errors.New("cannot read")
	p := projection.NewProjector(
		&logStore{readErr: boom},
		[]projection.Handler{&recorder{name: "h", handles: "Incident"}},
	)

	require.ErrorIs(t, p.Run(t.Context()), boom)
}

func TestProjector_RunIgnoresACancelledInitialCatchUp(t *testing.T) {
	p := projection.NewProjector(
		&logStore{readErr: context.Canceled},
		[]projection.Handler{&recorder{name: "h", handles: "Incident"}},
	)

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	require.ErrorIs(t, p.Run(ctx), context.Canceled)
}

// chanNotifier delivers one wake-up per value sent on wake.
type chanNotifier struct{ wake chan struct{} }

func (chanNotifier) Notify(context.Context) error { return nil }

func (n chanNotifier) Wait(ctx context.Context) error {
	select {
	case <-n.wake:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestProjector_RunWithNotifierAppliesNewEventsOnWakeUp(t *testing.T) {
	store := &logStore{}
	h := &recorder{name: "h", handles: "Incident", signal: make(chan int, 10)}
	notifier := chanNotifier{wake: make(chan struct{})}
	p := projection.NewProjector(store, []projection.Handler{h}).WithNotifier(notifier)

	store.add(versioned("Incident", 1))

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() { done <- p.Run(ctx) }()

	require.Equal(t, 1, <-h.signal, "the initial catch-up ran")

	for v := 2; v <= 3; v++ {
		store.add(versioned("Incident", v))

		notifier.wake <- struct{}{}

		require.Equal(t, v, <-h.signal, "event %d is applied after a wake-up", v)
	}

	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
	assert.Equal(t, []int{1, 2, 3}, h.versions())
}

func TestProjector_RunKeepsRunningWhenACatchUpFails(t *testing.T) {
	store := &logStore{}
	boom := errors.New("transient")
	h := &recorder{name: "h", handles: "Incident", signal: make(chan int, 10), failOn: 2, failErr: boom, once: true}
	notifier := chanNotifier{wake: make(chan struct{})}
	p := projection.NewProjector(store, []projection.Handler{h}).WithNotifier(notifier)

	store.add(versioned("Incident", 1))

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() { done <- p.Run(ctx) }()

	require.Equal(t, 1, <-h.signal)

	store.add(versioned("Incident", 2))

	notifier.wake <- struct{}{} // this pass fails on version 2 and is only logged

	notifier.wake <- struct{}{} // received once that pass is over; this one retries it

	require.Equal(t, 2, <-h.signal)

	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
}
