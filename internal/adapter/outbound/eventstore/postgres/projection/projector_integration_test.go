//go:build integration

package projection_test

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

func TestMain(m *testing.M) { os.Exit(pgtest.Main(m)) }

const (
	lockName = "readmodel.test"
	fast     = 50 * time.Millisecond // standby interval: elections retry quickly in tests
	patience = 15 * time.Second
)

// env is one database with an event store and the pieces a projector needs.
type env struct {
	pool     *pgxpool.Pool
	store    *pgstore.EventStore
	tx       *pgstore.Transactor
	notifier *pgstore.Notifier
}

func newEnv(t *testing.T) *env {
	t.Helper()

	pool := pgtest.Pool(t)
	notifier := pgstore.NewNotifier(pool, "events")

	// After the pool, so it closes first: the notifier holds a pooled connection.
	t.Cleanup(notifier.Close)

	return &env{pool: pool, store: pgstore.NewEventStore(pool), tx: pgstore.NewTransactor(pool), notifier: notifier}
}

// appendIncident writes one event (an incident opening) and returns the incident id.
func (e *env) appendIncident(t *testing.T, name string) uuid.UUID {
	t.Helper()

	id := shared.IncidentID(uuid.New())
	inc := incident.New(id)

	require.NoError(t, inc.Open(name, nil, nil, time.Now().UTC(), "sys"))
	require.NoError(t, e.tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := e.store.Append(ctx, inc)

		return err
	}))

	return uuid.UUID(id)
}

func (e *env) incidentRows(t *testing.T) int {
	t.Helper()

	var n int

	require.NoError(t, e.pool.QueryRow(t.Context(), `SELECT count(*) FROM readmodel.incident`).Scan(&n))

	return n
}

// projector builds a projector with the real incident handler.
func (e *env) projector(opts ...projection.Option) *projection.Projector {
	return e.projectorWith([]projection.Handler{projection.NewIncidentHandler(e.pool)}, opts...)
}

func (e *env) projectorWith(handlers []projection.Handler, opts ...projection.Option) *projection.Projector {
	return projection.NewProjector(e.pool, e.store, e.notifier, handlers, opts...)
}

// leaderOptions makes a projector take part in leader election on the shared lock.
func (e *env) leaderOptions(extra ...projection.Option) []projection.Option {
	return append([]projection.Option{
		projection.WithLock(pgstore.NewProjectorLock(e.pool)),
		projection.WithLockName(lockName),
		projection.WithStandbyInterval(fast),
	}, extra...)
}

// run starts p.Run and returns a function that stops it and returns Run's result. The cleanup
// stops it too, so a failing test cannot leave a leader holding connections that block the pool.
func run(t *testing.T, p *projection.Projector) (stop func() error) {
	t.Helper()

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() { done <- p.Run(ctx) }()

	var once sync.Once

	var result error

	stop = func() error {
		once.Do(func() {
			cancel()

			select {
			case result = <-done:
			case <-time.After(patience):
				result = errors.New("Run did not return after its context was cancelled")
			}
		})

		return result
	}

	t.Cleanup(func() { _ = stop() })

	return stop
}

func (e *env) leaderPIDs(t *testing.T) []int {
	t.Helper()

	rows, err := e.pool.Query(t.Context(), `
		SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND classid = $1 AND granted ORDER BY pid`, int32(0x5352))
	require.NoError(t, err)

	defer rows.Close()

	var pids []int

	for rows.Next() {
		var pid int
		require.NoError(t, rows.Scan(&pid))

		pids = append(pids, pid)
	}

	require.NoError(t, rows.Err())

	return pids
}

// ── Run loop ────────────────────────────────────────────────────────────────

func TestProjector_Run_ProjectsExistingAndNewEvents(t *testing.T) {
	e := newEnv(t)

	e.appendIncident(t, "before start")

	stop := run(t, e.projector())

	require.Eventually(t, func() bool { return e.incidentRows(t) == 1 }, patience, 20*time.Millisecond,
		"events written before the projector started are caught up")

	e.appendIncident(t, "after start")
	require.NoError(t, e.notifier.Notify(t.Context()))

	require.Eventually(t, func() bool { return e.incidentRows(t) == 2 }, patience, 20*time.Millisecond,
		"a notification wakes the projector for new events")

	require.ErrorIs(t, stop(), context.Canceled, "Run returns the cancellation of its context")
}

func TestProjector_Run_ReleasesTheLockWhenStopped(t *testing.T) {
	e := newEnv(t)

	stop := run(t, e.projector(e.leaderOptions()...))

	require.Eventually(t, func() bool { return len(e.leaderPIDs(t)) == 1 }, patience, 20*time.Millisecond)

	require.ErrorIs(t, stop(), context.Canceled)

	// Eventually, not immediately: when the cancellation interrupts the leader's own liveness query the
	// connection is closed and the unlock is left to Postgres, which drops the lock when it notices the
	// session is gone.
	require.Eventually(t, func() bool { return len(e.leaderPIDs(t)) == 0 }, patience, 20*time.Millisecond,
		"a stopped leader must not keep the lock")
}

func TestProjector_LeaderElection_OnlyOneLeadsAndStandbyTakesOver(t *testing.T) {
	e := newEnv(t)

	stopA := run(t, e.projector(e.leaderOptions()...))

	require.Eventually(t, func() bool { return len(e.leaderPIDs(t)) == 1 }, patience, 20*time.Millisecond)

	// A second instance with its own lock object finds the lock taken and waits.
	stopB := run(t, e.projector(e.leaderOptions()...))

	e.appendIncident(t, "one")
	require.NoError(t, e.notifier.Notify(t.Context()))
	require.Eventually(t, func() bool { return e.incidentRows(t) == 1 }, patience, 20*time.Millisecond)

	time.Sleep(4 * fast) // give the standby several election attempts
	assert.Len(t, e.leaderPIDs(t), 1, "two instances must never lead at the same time")

	// The leader goes away; the standby takes over and keeps projecting.
	require.ErrorIs(t, stopA(), context.Canceled)

	e.appendIncident(t, "two")
	require.NoError(t, e.notifier.Notify(t.Context()))
	require.Eventually(t, func() bool { return e.incidentRows(t) == 2 }, patience, 20*time.Millisecond,
		"the standby must take over after the leader stops")

	require.ErrorIs(t, stopB(), context.Canceled)
}

func TestProjector_LostLock_LeaderStepsDownAndIsElectedAgain(t *testing.T) {
	e := newEnv(t)

	run(t, e.projector(e.leaderOptions()...))

	require.Eventually(t, func() bool { return len(e.leaderPIDs(t)) == 1 }, patience, 20*time.Millisecond)

	e.appendIncident(t, "before")
	require.NoError(t, e.notifier.Notify(t.Context()))
	require.Eventually(t, func() bool { return e.incidentRows(t) == 1 }, patience, 20*time.Millisecond)

	// Kill the session holding the lock, as a network drop or a database failover would.
	old := e.leaderPIDs(t)
	require.Len(t, old, 1)

	_, err := e.pool.Exec(t.Context(), `SELECT pg_terminate_backend($1)`, old[0])
	require.NoError(t, err)

	// The leader notices at its next cycle, steps down and is elected again on a new session.
	require.Eventually(t, func() bool {
		_ = e.notifier.Notify(t.Context())
		pids := e.leaderPIDs(t)

		return len(pids) == 1 && pids[0] != old[0]
	}, patience, 50*time.Millisecond, "the leader must re-acquire the lock on a new session")

	e.appendIncident(t, "after")
	require.NoError(t, e.notifier.Notify(t.Context()))
	require.Eventually(t, func() bool { return e.incidentRows(t) == 2 }, patience, 20*time.Millisecond,
		"projection continues after re-election")
}

// ── Retention hook ──────────────────────────────────────────────────────────

func TestProjector_Retention_RebuildsReadModelsWhenItArchived(t *testing.T) {
	e := newEnv(t)

	e.appendIncident(t, "kept")

	// A row the event log knows nothing about: only a rebuild can remove it.
	_, err := e.pool.Exec(t.Context(), `
		INSERT INTO readmodel.incident (id, name, is_closed, is_deleted, created_at, updated_at)
		VALUES ($1, 'ghost', false, false, now(), now())`, uuid.New())
	require.NoError(t, err)

	var calls int

	var mu sync.Mutex

	retention := func(context.Context) (bool, error) {
		mu.Lock()
		defer mu.Unlock()

		calls++

		return calls == 1, nil // the first run archives something
	}

	run(t, e.projector(e.leaderOptions(projection.WithRetention(retention))...))

	require.Eventually(t, func() bool {
		var ghosts, kept int

		_ = e.pool.QueryRow(t.Context(), `SELECT count(*) FILTER (WHERE name = 'ghost'), count(*) FILTER (WHERE name = 'kept') FROM readmodel.incident`).
			Scan(&ghosts, &kept)

		return ghosts == 0 && kept == 1
	}, patience, 20*time.Millisecond, "after retention archived streams the read models are rebuilt from the log")

	mu.Lock()
	defer mu.Unlock()

	assert.GreaterOrEqual(t, calls, 1)
}

func TestProjector_Retention_FailureStepsDownAndRetries(t *testing.T) {
	e := newEnv(t)

	var (
		mu    sync.Mutex
		calls int
	)

	retention := func(context.Context) (bool, error) {
		mu.Lock()
		defer mu.Unlock()

		calls++

		if calls == 1 {
			return false, errors.New("retention broke")
		}

		return false, nil
	}

	run(t, e.projector(e.leaderOptions(projection.WithRetention(retention))...))

	require.Eventually(t, func() bool {
		mu.Lock()
		defer mu.Unlock()

		return calls >= 2
	}, patience, 20*time.Millisecond, "a failing retention run makes the leader step down; the next election runs it again")

	e.appendIncident(t, "still works")
	require.NoError(t, e.notifier.Notify(t.Context()))
	require.Eventually(t, func() bool { return e.incidentRows(t) == 1 }, patience, 20*time.Millisecond)
}

// ── Handlers: versions, failures, halting ───────────────────────────────────

// recorder is a handler that remembers what it was asked to do. It reads only the "Opened" event
// of an incident, so each appendIncident is exactly one event for it.
type recorder struct {
	name    string
	version int
	halt    bool

	mu      sync.Mutex
	applied []uuid.UUID
	resets  int
	failFor map[uuid.UUID]bool
}

func newRecorder(version int) *recorder {
	return &recorder{name: "test.recorder", version: version, failFor: map[uuid.UUID]bool{}}
}

func (r *recorder) Name() string { return r.name }
func (r *recorder) Version() int { return r.version }
func (r *recorder) Handles(streamType, eventType string) bool {
	return streamType == "Incident" && eventType == "Opened"
}
func (r *recorder) HaltOnError() bool { return r.halt }
func (r *recorder) Reset(context.Context) error {
	r.mu.Lock()
	r.resets++
	r.applied = nil
	r.mu.Unlock()

	return nil
}

func (r *recorder) Apply(_ context.Context, e eventsourcing.Event) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.failFor[e.StreamID] {
		return errors.New("cannot apply this event")
	}

	r.applied = append(r.applied, e.StreamID)

	return nil
}

func (r *recorder) appliedIDs() []uuid.UUID {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]uuid.UUID(nil), r.applied...)
}

func (r *recorder) allow(id uuid.UUID) {
	r.mu.Lock()
	delete(r.failFor, id)
	r.mu.Unlock()
}

func (r *recorder) resetCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.resets
}

func TestProjector_CatchUp_IsIncrementalAndRepeatable(t *testing.T) {
	e := newEnv(t)
	r := newRecorder(1)
	p := e.projectorWith([]projection.Handler{r})

	a := e.appendIncident(t, "a")
	require.NoError(t, p.CatchUp(t.Context()))
	require.NoError(t, p.CatchUp(t.Context()), "a second pass with nothing new does nothing")
	assert.Equal(t, []uuid.UUID{a}, r.appliedIDs())

	b := e.appendIncident(t, "b")
	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, []uuid.UUID{a, b}, r.appliedIDs(), "only the new event is applied, once")

	// A fresh projector continues from the stored checkpoint instead of starting over.
	r2 := newRecorder(1)
	require.NoError(t, e.projectorWith([]projection.Handler{r2}).CatchUp(t.Context()))
	assert.Empty(t, r2.appliedIDs())
}

func TestProjector_HandlerVersionBump_RebuildsFromTheStart(t *testing.T) {
	e := newEnv(t)

	a, b := e.appendIncident(t, "a"), e.appendIncident(t, "b")

	v1 := newRecorder(1)
	require.NoError(t, e.projectorWith([]projection.Handler{v1}).CatchUp(t.Context()))
	assert.ElementsMatch(t, []uuid.UUID{a, b}, v1.appliedIDs())

	// The next build changed the handler: the stored projection is rebuilt from the first event.
	v2 := newRecorder(2)
	require.NoError(t, e.projectorWith([]projection.Handler{v2}).CatchUp(t.Context()))
	assert.Equal(t, 1, v2.resetCount(), "a newer handler version resets the read model")
	assert.ElementsMatch(t, []uuid.UUID{a, b}, v2.appliedIDs(), "and replays every event")
}

func TestProjector_OlderBuildRefusesToRunBackwards(t *testing.T) {
	e := newEnv(t)

	e.appendIncident(t, "a")
	require.NoError(t, e.projectorWith([]projection.Handler{newRecorder(2)}).CatchUp(t.Context()))

	// A replica still running the old code during a rolling deploy must not rebuild the new read model.
	old := newRecorder(1)
	err := e.projectorWith([]projection.Handler{old}).CatchUp(t.Context())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ahead of this build")
	assert.Zero(t, old.resetCount(), "the newer projection must not be reset by an older build")
}

func TestProjector_FailingEvent_IsParkedAndTheProjectionContinues(t *testing.T) {
	e := newEnv(t)
	r := newRecorder(1)
	p := e.projectorWith([]projection.Handler{r})

	bad := e.appendIncident(t, "bad")
	good := e.appendIncident(t, "good")

	r.failFor[bad] = true

	require.NoError(t, p.CatchUp(t.Context()), "one bad event must not stop the projection")
	assert.Equal(t, []uuid.UUID{good}, r.appliedIDs())

	var parked int
	require.NoError(t, e.pool.QueryRow(t.Context(),
		`SELECT count(*) FROM eventsourcing.projection_dead_letter WHERE projection = $1 AND stream_id = $2`,
		r.Name(), bad).Scan(&parked))
	assert.Equal(t, 1, parked, "the failed event is parked for inspection")

	// The checkpoint moved past it: it is not retried on every pass.
	r.allow(bad)
	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, []uuid.UUID{good}, r.appliedIDs())
}

func TestProjector_HaltOnError_StopsAtTheFailingEventAndRetriesIt(t *testing.T) {
	e := newEnv(t)
	r := newRecorder(1)
	r.halt = true
	p := e.projectorWith([]projection.Handler{r})

	bad := e.appendIncident(t, "bad")
	r.failFor[bad] = true

	err := p.CatchUp(t.Context())
	require.Error(t, err, "a handler that must not skip events halts the projection")
	assert.Contains(t, err.Error(), "halted")

	var parked int
	require.NoError(t, e.pool.QueryRow(t.Context(),
		`SELECT count(*) FROM eventsourcing.projection_dead_letter WHERE projection = $1`, r.Name()).Scan(&parked))
	assert.Zero(t, parked, "a halting handler does not park events")

	// Once the cause is fixed the same event is applied: nothing was skipped.
	r.allow(bad)
	require.NoError(t, p.CatchUp(t.Context()))
	assert.Equal(t, []uuid.UUID{bad}, r.appliedIDs())
}

func TestProjector_ResetAll_ReplaysEverything(t *testing.T) {
	e := newEnv(t)
	r := newRecorder(1)
	p := e.projectorWith([]projection.Handler{r})

	a := e.appendIncident(t, "a")
	require.NoError(t, p.CatchUp(t.Context()))

	require.NoError(t, p.ResetAll(t.Context()))
	assert.Equal(t, 1, r.resetCount())
	assert.Equal(t, []uuid.UUID{a}, r.appliedIDs(), "after a reset the log is replayed")
}

func TestProjector_ApplySingle(t *testing.T) {
	e := newEnv(t)
	r := newRecorder(1)
	p := e.projectorWith([]projection.Handler{r})

	id := e.appendIncident(t, "a")

	events, err := e.store.Load(t.Context(), "Incident", id)
	require.NoError(t, err)
	require.NotEmpty(t, events)

	require.NoError(t, p.ApplySingle(t.Context(), r.Name(), events[0]))
	assert.Equal(t, []uuid.UUID{id}, r.appliedIDs())

	require.Error(t, p.ApplySingle(t.Context(), "no.such.handler", events[0]))
}
