//go:build integration

package postgres_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	pgprojection "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres/projection"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/testutil/pgtest"
)

// ── Notifier ────────────────────────────────────────────────────────────────

func newNotifier(t *testing.T, channel string) *postgres.Notifier {
	t.Helper()

	n := postgres.NewNotifier(pgtest.Pool(t), channel)

	// Registered after the pool, so it runs before the pool closes: the notifier holds a
	// pooled connection and the pool cannot shut down while it is out.
	t.Cleanup(n.Close)

	return n
}

// waitReturns runs Wait in the background and reports its result.
func waitReturns(ctx context.Context, n *postgres.Notifier) <-chan error {
	out := make(chan error, 1)

	go func() { out <- n.Wait(ctx) }()

	return out
}

func TestNotifier_NotifyWakesWait(t *testing.T) {
	n := newNotifier(t, "events")
	require.NoError(t, n.EnsureListening(t.Context()))

	done := waitReturns(t.Context(), n)

	require.NoError(t, n.Notify(t.Context()))

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("Wait did not return after Notify")
	}
}

// A notification sent while nobody is waiting must not be lost: the projector is busy applying
// events while writers keep notifying, and relies on the persistent LISTEN connection.
func TestNotifier_NotificationBeforeWaitIsQueued(t *testing.T) {
	n := newNotifier(t, "events")
	require.NoError(t, n.EnsureListening(t.Context()))
	require.NoError(t, n.Notify(t.Context()))

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	require.NoError(t, n.Wait(ctx), "the queued notification must wake the next Wait immediately")
}

func TestNotifier_OtherChannelDoesNotWake(t *testing.T) {
	pool := pgtest.Pool(t)
	listener := postgres.NewNotifier(pool, "events")
	t.Cleanup(listener.Close)

	require.NoError(t, listener.EnsureListening(t.Context()))
	require.NoError(t, postgres.NewNotifier(pool, "other").Notify(t.Context()))

	ctx, cancel := context.WithTimeout(t.Context(), blockedFor)
	defer cancel()

	require.ErrorIs(t, listener.Wait(ctx), context.DeadlineExceeded, "a different channel must stay silent")
}

func TestNotifier_WaitStopsWithItsContextAndKeepsListening(t *testing.T) {
	n := newNotifier(t, "events")

	ctx, cancel := context.WithTimeout(t.Context(), blockedFor)
	defer cancel()

	require.ErrorIs(t, n.Wait(ctx), context.DeadlineExceeded)

	// The timeout is not a failure of the connection: the next Wait still works.
	done := waitReturns(t.Context(), n)

	require.NoError(t, n.Notify(t.Context()))

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("Wait did not recover after a timed-out Wait")
	}
}

func TestNotifier_CloseThenListenAgain(t *testing.T) {
	n := newNotifier(t, "events")

	require.NoError(t, n.EnsureListening(t.Context()))
	require.NoError(t, n.EnsureListening(t.Context()), "listening twice is harmless")

	n.Close()
	n.Close() // closing twice is harmless

	require.NoError(t, n.EnsureListening(t.Context()), "a closed notifier listens again on demand")
	require.NoError(t, n.Notify(t.Context()))

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	require.NoError(t, n.Wait(ctx))
}

func TestNotifier_DefaultChannelIsEvents(t *testing.T) {
	pool := pgtest.Pool(t)
	listener := postgres.NewNotifier(pool, "")
	t.Cleanup(listener.Close)

	require.NoError(t, listener.EnsureListening(t.Context()))
	require.NoError(t, postgres.NewNotifier(pool, "events").Notify(t.Context()))

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	require.NoError(t, listener.Wait(ctx), "an empty channel name means \"events\"")
}

func TestNotifier_ChannelNameIsQuoted(t *testing.T) {
	// Names are used as identifiers, so a hostile or odd name must not become SQL.
	n := newNotifier(t, `x"; DROP TABLE users; --`)

	require.NoError(t, n.EnsureListening(t.Context()))
	require.NoError(t, n.Notify(t.Context()))

	var exists bool

	require.NoError(t, pgtest.Pool(t).QueryRow(t.Context(),
		`SELECT to_regclass('public.users') IS NOT NULL`).Scan(&exists))
	assert.True(t, exists, "the users table must still exist")
}

// ── Projector lock ──────────────────────────────────────────────────────────

func TestProjectorLock_CheckHeld(t *testing.T) {
	pool := pgtest.Pool(t)
	lock := postgres.NewProjectorLock(pool)

	require.Error(t, lock.CheckHeld(t.Context()), "before Acquire nothing is held")

	release, err := lock.Acquire(t.Context(), "readmodel.test")
	require.NoError(t, err)

	require.NoError(t, lock.CheckHeld(t.Context()))

	// A second instance cannot take the same lock.
	_, err = postgres.NewProjectorLock(pool).Acquire(t.Context(), "readmodel.test")
	require.ErrorIs(t, err, outbound.ErrLockHeld)

	release()
	release() // releasing twice is harmless

	require.Error(t, lock.CheckHeld(t.Context()), "after release it is no longer held")

	// Released: another instance may lead now.
	other, err := postgres.NewProjectorLock(pool).Acquire(t.Context(), "readmodel.test")
	require.NoError(t, err)
	other()
}

func TestProjectorLock_CheckHeldDetectsLostConnection(t *testing.T) {
	pool := pgtest.Pool(t)
	lock := postgres.NewProjectorLock(pool)

	release, err := lock.Acquire(t.Context(), "readmodel.test")
	require.NoError(t, err)

	t.Cleanup(release)

	// Kill the session that holds the lock, as a network drop or a failover would.
	_, err = pool.Exec(t.Context(), `
		SELECT pg_terminate_backend(pid) FROM pg_locks
		WHERE locktype = 'advisory' AND classid = $1 AND granted AND pid <> pg_backend_pid()`,
		int32(0x5352))
	require.NoError(t, err)

	require.Eventually(
		t,
		func() bool { return lock.CheckHeld(t.Context()) != nil },
		10*time.Second,
		50*time.Millisecond,
		"a leader whose lock vanished must be able to notice and step down",
	)
}

func TestProjectorLock_DifferentProjectionsDoNotCollide(t *testing.T) {
	pool := pgtest.Pool(t)

	a, err := postgres.NewProjectorLock(pool).Acquire(t.Context(), "readmodel.a")
	require.NoError(t, err)

	defer a()

	b, err := postgres.NewProjectorLock(pool).Acquire(t.Context(), "readmodel.b")
	require.NoError(t, err)

	b()
}

// ── Clock, IDs, snapshots ───────────────────────────────────────────────────

func TestWallClockIsUTCAndCurrent(t *testing.T) {
	now := postgres.WallClock{}.Now()

	assert.Equal(t, time.UTC, now.Location())
	assert.WithinDuration(t, time.Now(), now, 5*time.Second)
}

func TestUUIDGen_ProducesTimeOrderedV7(t *testing.T) {
	gen := postgres.UUIDGen{}

	var prev uuid.UUID

	for range 100 {
		id := gen.New()

		assert.Equal(t, uuid.Version(7), id.Version())

		if prev != uuid.Nil {
			assert.Greater(t, id.String(), prev.String(), "ids sort in creation order")
		}

		prev = id
	}
}

func TestNoopSnapshotStore(t *testing.T) {
	s := postgres.NoopSnapshotStore{}

	found, err := s.Load(t.Context(), "Incident", uuid.New(), incident.New(shared.IncidentID(uuid.New())))
	require.NoError(t, err)
	assert.False(t, found, "there are no snapshots, so every load replays the stream")

	require.NoError(t, s.Save(t.Context(), incident.New(shared.IncidentID(uuid.New()))))
}

// ── Retention ───────────────────────────────────────────────────────────────

type retentionEnv struct {
	store *postgres.EventStore
	tx    *postgres.Transactor
	ret   *postgres.IncidentRetention
	proj  *pgprojection.Projector
	now   time.Time
}

func newRetentionEnv(t *testing.T) *retentionEnv {
	t.Helper()

	pool := pgtest.Pool(t)
	store := postgres.NewEventStore(pool)

	return &retentionEnv{
		store: store,
		tx:    postgres.NewTransactor(pool),
		ret:   postgres.NewIncidentRetention(pool),
		proj: pgprojection.NewProjector(pool, store, postgres.NewNotifier(pool, "events"), []pgprojection.Handler{
			pgprojection.NewIncidentHandler(pool),
		}),
		now: time.Now().UTC().Truncate(time.Second),
	}
}

// incidentAt opens an incident at opened, optionally closes it at closed and deletes it at deleted.
func (e *retentionEnv) incidentAt(t *testing.T, opened time.Time, closed, deleted *time.Time) shared.IncidentID {
	t.Helper()

	id := shared.IncidentID(uuid.New())
	inc := incident.New(id)

	require.NoError(t, inc.Open("incident", nil, nil, opened, "sys"))

	if closed != nil {
		require.NoError(t, inc.Close(shared.ReasonManual, "sys", *closed))
	}

	if deleted != nil {
		require.NoError(t, inc.Delete(shared.DeleteReasonManual, "sys", *deleted))
	}

	require.NoError(t, e.tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := e.store.Append(ctx, inc)

		return err
	}))

	return id
}

func (e *retentionEnv) project(t *testing.T) {
	t.Helper()

	require.NoError(t, e.proj.CatchUp(t.Context()))
}

func (e *retentionEnv) ago(d time.Duration) time.Time { return e.now.Add(-d) }

//go:fix inline

const day = 24 * time.Hour

func TestRetention_OpenBefore(t *testing.T) {
	e := newRetentionEnv(t)

	stale := e.incidentAt(t, e.ago(40*day), nil, nil)
	_ = e.incidentAt(t, e.ago(1*day), nil, nil)                                // recent
	_ = e.incidentAt(t, e.ago(50*day), new(e.ago(45*day)), nil)                // closed, not open
	_ = e.incidentAt(t, e.ago(60*day), new(e.ago(55*day)), new(e.ago(50*day))) // deleted
	e.project(t)

	got, err := e.ret.OpenBefore(t.Context(), e.ago(30*day), 10)
	require.NoError(t, err)
	assert.Equal(t, []shared.IncidentID{stale}, got, "only the open incident untouched for 30 days is a candidate")
}

func TestRetention_OpenBefore_OrdersOldestFirstAndHonoursLimit(t *testing.T) {
	e := newRetentionEnv(t)

	oldest := e.incidentAt(t, e.ago(90*day), nil, nil)
	middle := e.incidentAt(t, e.ago(60*day), nil, nil)
	_ = e.incidentAt(t, e.ago(40*day), nil, nil)
	e.project(t)

	got, err := e.ret.OpenBefore(t.Context(), e.ago(30*day), 2)
	require.NoError(t, err)
	assert.Equal(t, []shared.IncidentID{oldest, middle}, got)
}

func TestRetention_ArchiveBefore(t *testing.T) {
	e := newRetentionEnv(t)

	closedOld := e.incidentAt(t, e.ago(60*day), new(e.ago(40*day)), nil)
	_ = e.incidentAt(t, e.ago(60*day), new(e.ago(1*day)), nil) // closed recently
	_ = e.incidentAt(t, e.ago(2*day), nil, nil)                // still open
	deletedOld := e.incidentAt(t, e.ago(90*day), new(e.ago(80*day)), new(e.ago(35*day)))
	_ = e.incidentAt(t, e.ago(90*day), new(e.ago(80*day)), new(e.ago(2*day))) // deleted recently
	e.project(t)

	got, err := e.ret.ArchiveBefore(t.Context(), e.ago(30*day), e.ago(30*day), 10)
	require.NoError(t, err)
	// Oldest first, by the date the incident was deleted (or else closed): closed 40 days ago, deleted 35.
	assert.Equal(t, []shared.IncidentID{closedOld, deletedOld}, got)

	// Closed and deleted use separate thresholds.
	got, err = e.ret.ArchiveBefore(t.Context(), e.ago(30*day), e.ago(1*day), 10)
	require.NoError(t, err)
	assert.Len(t, got, 3, "a shorter deleted-threshold adds the recently deleted incident")

	got, err = e.ret.ArchiveBefore(t.Context(), e.ago(30*day), e.ago(30*day), 1)
	require.NoError(t, err)
	assert.Len(t, got, 1, "the limit caps the batch")
}

func TestRetention_ArchiveBefore_NothingDue(t *testing.T) {
	e := newRetentionEnv(t)

	_ = e.incidentAt(t, e.ago(2*day), new(e.ago(1*day)), nil)
	e.project(t)

	got, err := e.ret.ArchiveBefore(t.Context(), e.ago(30*day), e.ago(30*day), 10)
	require.NoError(t, err)
	assert.Empty(t, got)
}

func TestRetention_Archive_MovesTheStreamsOutOfTheLiveLog(t *testing.T) {
	pool := pgtest.Pool(t)
	e := &retentionEnv{
		store: postgres.NewEventStore(pool),
		tx:    postgres.NewTransactor(pool),
		ret:   postgres.NewIncidentRetention(pool),
		now:   time.Now().UTC().Truncate(time.Second),
	}
	counter := postgres.NewMessageCounter()

	target := e.incidentAt(t, e.ago(60*day), new(e.ago(40*day)), nil)
	other := e.incidentAt(t, e.ago(60*day), new(e.ago(40*day)), nil)

	for _, id := range []shared.IncidentID{target, other} {
		require.NoError(t, e.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := counter.Next(ctx, id)

			return err
		}))
	}

	count := func(query string, id shared.IncidentID) int {
		var n int

		require.NoError(t, pool.QueryRow(t.Context(), query, uuid.UUID(id)).Scan(&n))

		return n
	}

	const (
		live     = `SELECT count(*) FROM eventsourcing.events WHERE stream_id = $1`
		archived = `SELECT count(*) FROM eventsourcing.archive_events WHERE stream_id = $1`
		indexed  = `SELECT count(*) FROM eventsourcing.aggregate_index WHERE incident_id = $1`
		counters = `SELECT count(*) FROM eventsourcing.incident_counters WHERE incident_id = $1`
		audit    = `SELECT count(*) FROM eventsourcing.archived_incidents WHERE incident_id = $1`
	)

	liveBefore := count(live, target)
	require.Positive(t, liveBefore)

	archive := func() error {
		return e.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			return e.ret.Archive(ctx, target, e.now)
		})
	}

	require.NoError(t, archive())

	assert.Zero(t, count(live, target), "the live log no longer holds the incident")
	assert.Equal(t, liveBefore, count(archived, target), "every event moved to the archive")
	assert.Zero(t, count(indexed, target), "the live index entry is gone")
	assert.Zero(t, count(counters, target), "the message counter is gone")
	assert.Equal(t, 1, count(audit, target), "the archive is audited")

	// The other incident is untouched.
	assert.Positive(t, count(live, other))
	assert.Equal(t, 1, count(counters, other))
	assert.Zero(t, count(audit, other))

	// Running it again must not fail or duplicate anything.
	require.NoError(t, archive())
	assert.Equal(t, liveBefore, count(archived, target))
	assert.Equal(t, 1, count(audit, target))
}

func TestRetention_Archive_RequiresTransaction(t *testing.T) {
	pool := pgtest.Pool(t)

	err := postgres.NewIncidentRetention(pool).Archive(t.Context(), shared.IncidentID(uuid.New()), time.Now())
	require.Error(t, err, "archiving moves rows between tables and must be atomic")
}
