package projection_test

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// recordingHandler is a Handler that records what the projector gives it.
type recordingHandler struct {
	mu       sync.Mutex
	name     string
	version  int
	halt     bool
	failOn   string // event type that fails
	attempts int
	applied  []string
	resets   int
	applyCh  chan string
}

func (h *recordingHandler) Name() string      { return h.name }
func (h *recordingHandler) Version() int      { return h.version }
func (h *recordingHandler) HaltOnError() bool { return h.halt }
func (h *recordingHandler) Handles(streamType, _ string) bool {
	return streamType == "Widget"
}

func (h *recordingHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if e.EventType == h.failOn {
		h.attempts++

		return errors.New("boom")
	}

	h.applied = append(h.applied, e.EventType)

	if h.applyCh != nil {
		h.applyCh <- e.EventType
	}

	return nil
}

func (h *recordingHandler) Reset(context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.resets++
	h.applied = nil

	return nil
}

func (h *recordingHandler) appliedEvents() []string {
	h.mu.Lock()
	defer h.mu.Unlock()

	return append([]string(nil), h.applied...)
}

// insertEvent appends one raw event of a Widget stream.
func insertEvent(t *testing.T, db *sql.DB, stream uuid.UUID, version int, eventType string) {
	t.Helper()

	now := sqlite.FormatTime(time.Now())
	_, err := db.ExecContext(t.Context(), `
		INSERT INTO eventsourcing_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
		VALUES ('Widget', ?, ?, ?, '{}', '{}', ?, ?)`,
		stream.String(), version, eventType, now, now)
	require.NoError(t, err)
}

func newProjector(
	t *testing.T, read, write *sql.DB, handlers []projection.Handler, opts ...projection.Option,
) (*projection.Projector, *sqstore.Notifier) {
	t.Helper()

	notifier := sqstore.NewNotifier()
	store := sqstore.NewEventStore(read, write, sqstore.WallClock{})

	return projection.NewProjector(read, write, store, notifier, handlers, opts...), notifier
}

func TestProjector_CatchUpAppliesEachEventOnce(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.handler", version: 1}
	proj, _ := newProjector(t, read, write, []projection.Handler{h})

	stream := uuid.New()
	insertEvent(t, write, stream, 1, "A")
	insertEvent(t, write, stream, 2, "B")

	// An event of a stream the handler does not handle is skipped.
	_, err := write.ExecContext(t.Context(), `
		INSERT INTO eventsourcing_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
		VALUES ('Other', ?, 1, 'X', '{}', '{}', ?, ?)`,
		uuid.NewString(), sqlite.FormatTime(time.Now()), sqlite.FormatTime(time.Now()))
	require.NoError(t, err)

	require.NoError(t, proj.CatchUp(t.Context()))
	assert.Equal(t, []string{"A", "B"}, h.appliedEvents())

	require.NoError(t, proj.CatchUp(t.Context()), "a second pass has nothing left to do")
	assert.Equal(t, []string{"A", "B"}, h.appliedEvents(), "the checkpoint advanced past the applied events")

	insertEvent(t, write, stream, 3, "C")
	require.NoError(t, proj.CatchUp(t.Context()))
	assert.Equal(t, []string{"A", "B", "C"}, h.appliedEvents())
}

func TestProjector_FailingEventIsParkedAndTheRestContinues(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.handler", version: 1, failOn: "BAD"}
	proj, _ := newProjector(t, read, write, []projection.Handler{h})

	stream := uuid.New()
	insertEvent(t, write, stream, 1, "A")
	insertEvent(t, write, stream, 2, "BAD")
	insertEvent(t, write, stream, 3, "C")

	require.NoError(t, proj.CatchUp(t.Context()), "a failing event of a tolerant handler does not stop the projection")
	assert.Equal(t, []string{"A", "C"}, h.appliedEvents())
	assert.Equal(t, 3, h.attempts, "an event is retried before it is parked")

	var (
		version  int
		message  string
		attempts int
	)

	require.NoError(t, write.QueryRowContext(t.Context(), `
		SELECT version, error, attempts FROM eventsourcing_projection_dead_letter
		WHERE projection = 'test.handler' AND stream_id = ?`, stream.String()).Scan(&version, &message, &attempts))
	assert.Equal(t, 2, version)
	assert.Equal(t, "boom", message)
	assert.Equal(t, 3, attempts)
}

func TestProjector_HaltingHandlerStopsCatchUp(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.access", version: 1, halt: true, failOn: "BAD"}
	proj, _ := newProjector(t, read, write, []projection.Handler{h})

	stream := uuid.New()
	insertEvent(t, write, stream, 1, "A")
	insertEvent(t, write, stream, 2, "BAD")
	insertEvent(t, write, stream, 3, "C")

	err := proj.CatchUp(t.Context())
	require.ErrorContains(t, err, "halted on event BAD")
	assert.Equal(t, []string{"A"}, h.appliedEvents(), "nothing after the failing event is applied")

	var parked int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM eventsourcing_projection_dead_letter`).Scan(&parked))
	assert.Zero(t, parked, "a halting handler does not park the event")
}

func TestProjector_VersionChangeRebuildsAndDowngradeIsRefused(t *testing.T) {
	read, write := openTestDB(t)
	stream := uuid.New()

	v1 := &recordingHandler{name: "test.handler", version: 1}
	proj, _ := newProjector(t, read, write, []projection.Handler{v1})

	insertEvent(t, write, stream, 1, "A")
	require.NoError(t, proj.CatchUp(t.Context()))
	require.Equal(t, 0, v1.resets, "a first start has nothing to reset")

	v2 := &recordingHandler{name: "test.handler", version: 2}
	proj, _ = newProjector(t, read, write, []projection.Handler{v2})
	require.NoError(t, proj.CatchUp(t.Context()))
	assert.Equal(t, 1, v2.resets, "a newer handler version resets the read model")
	assert.Equal(t, []string{"A"}, v2.appliedEvents(), "and replays every event")

	var stored int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT version FROM eventsourcing_projection_checkpoint WHERE name = 'test.handler'`).Scan(&stored))
	assert.Equal(t, 2, stored)

	old := &recordingHandler{name: "test.handler", version: 1}
	proj, _ = newProjector(t, read, write, []projection.Handler{old})
	require.ErrorContains(t, proj.CatchUp(t.Context()), "ahead of this build")
	assert.Zero(t, old.resets, "a downgrade must not wipe the read model")
}

func TestProjector_ResetAllReplaysEverything(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.handler", version: 1}
	proj, _ := newProjector(t, read, write, []projection.Handler{h})

	stream := uuid.New()
	insertEvent(t, write, stream, 1, "A")
	insertEvent(t, write, stream, 2, "B")
	require.NoError(t, proj.CatchUp(t.Context()))

	// Park a dead letter to see that a reset clears it.
	_, err := write.ExecContext(t.Context(), `
		INSERT INTO eventsourcing_projection_dead_letter
		  (projection, cursor, stream_type, stream_id, version, error, attempts, parked_at)
		VALUES ('test.handler', x'00', 'Widget', ?, 9, 'old', 3, ?)`,
		stream.String(), sqlite.FormatTime(time.Now()))
	require.NoError(t, err)

	require.NoError(t, proj.ResetAll(t.Context()))
	assert.Equal(t, 1, h.resets)
	assert.Equal(t, []string{"A", "B"}, h.appliedEvents())

	var parked int
	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT COUNT(*) FROM eventsourcing_projection_dead_letter`).Scan(&parked))
	assert.Zero(t, parked, "a reset forgets the dead letters of the handler")
}

func TestProjector_ApplySingleUnknownHandler(t *testing.T) {
	read, write := openTestDB(t)
	proj, _ := newProjector(t, read, write, nil)

	err := proj.ApplySingle(t.Context(), "nope", eventsourcing.Event{})
	require.ErrorContains(t, err, `no handler named "nope"`)
}

func TestProjector_RunProjectsOnNotificationAndStopsOnCancel(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.handler", version: 1, applyCh: make(chan string, 8)}

	retentionCalls := make(chan struct{}, 4)

	proj, notifier := newProjector(t, read, write, []projection.Handler{h},
		projection.WithRetention(func(context.Context) (bool, error) {
			retentionCalls <- struct{}{}

			return false, nil
		}))

	stream := uuid.New()
	insertEvent(t, write, stream, 1, "A")

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := make(chan error, 1)

	go func() { done <- proj.Run(ctx) }()

	waitFor := func(want string) {
		t.Helper()

		select {
		case got := <-h.applyCh:
			assert.Equal(t, want, got)
		case <-time.After(10 * time.Second):
			require.FailNow(t, "projection did not apply "+want)
		}
	}

	waitFor("A") // the initial catch-up

	select {
	case <-retentionCalls:
	case <-time.After(10 * time.Second):
		require.FailNow(t, "retention did not run after the first catch-up")
	}

	insertEvent(t, write, stream, 2, "B")
	require.NoError(t, notifier.Notify(ctx))
	waitFor("B") // a notification triggers the next pass

	cancel()

	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(10 * time.Second):
		require.FailNow(t, "Run did not stop after cancel")
	}

	assert.Empty(t, retentionCalls, "retention runs once, not after every pass")
}

func TestProjector_RetentionArchivingRebuildsTheReadModels(t *testing.T) {
	read, write := openTestDB(t)
	h := &recordingHandler{name: "test.handler", version: 1, applyCh: make(chan string, 8)}

	retention := func(context.Context) (bool, error) { return true, errors.New("partial failure") }
	proj, _ := newProjector(t, read, write, []projection.Handler{h}, projection.WithRetention(retention))

	insertEvent(t, write, uuid.New(), 1, "A")

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := make(chan error, 1)

	go func() { done <- proj.Run(ctx) }()

	// The first catch-up applies A; archiving then resets the handler and replays A.
	for range 2 {
		select {
		case got := <-h.applyCh:
			assert.Equal(t, "A", got)
		case <-time.After(10 * time.Second):
			require.FailNow(t, "the read model was not rebuilt after archiving")
		}
	}

	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
	assert.Equal(t, 1, h.resets)
}

func TestProjector_RunFailsWhenProjectionIsAheadOfBuild(t *testing.T) {
	read, write := openTestDB(t)

	_, err := write.ExecContext(t.Context(),
		`INSERT INTO eventsourcing_projection_checkpoint (name, version, cursor) VALUES ('test.handler', 9, NULL)`)
	require.NoError(t, err)

	proj, _ := newProjector(t, read, write, []projection.Handler{&recordingHandler{name: "test.handler", version: 1}})
	require.ErrorContains(t, proj.Run(t.Context()), "init checkpoints")
}
