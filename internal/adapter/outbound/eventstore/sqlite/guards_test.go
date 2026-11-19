package sqlite_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlitestore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

type stack struct {
	read, write *sql.DB
	store       *sqlitestore.EventStore
	tx          *sqlitestore.Transactor
}

func newStack(t *testing.T) *stack {
	t.Helper()

	read, write := openTestDB(t)

	return &stack{
		read: read, write: write,
		store: sqlitestore.NewEventStore(read, write, sqlitestore.WallClock{}),
		tx:    sqlitestore.NewTransactor(write),
	}
}

// openIncident appends an Opened event for a new incident and returns its id.
func (s *stack) openIncident(t *testing.T, name string) shared.IncidentID {
	t.Helper()

	id := shared.IncidentID(uuid.New())
	inc := incident.New(id)
	require.NoError(t, inc.Open(name, nil, nil, time.Now().UTC(), "sys"))
	require.NoError(t, s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
		_, err := s.store.Append(ctx, inc)

		return err
	}))

	return id
}

// insertEvent writes one raw event of an Incident stream, bypassing the aggregate.
func (s *stack) insertEvent(t *testing.T, stream uuid.UUID, version int, eventType, data string) {
	t.Helper()

	now := sqlite.FormatTime(time.Now())
	_, err := s.write.ExecContext(t.Context(), `
		INSERT INTO eventsourcing_events
		  (stream_type, stream_id, version, event_type, data, metadata, occurred_at, recorded_at)
		VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
		"Incident", stream.String(), version, eventType, data, now, now)
	require.NoError(t, err)
}

func countRows(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()

	var n int

	require.NoError(t, db.QueryRowContext(t.Context(), query, args...).Scan(&n))

	return n
}

func TestMessageCounter(t *testing.T) {
	s := newStack(t)
	counter := sqlitestore.NewMessageCounter()
	a, b := shared.IncidentID(uuid.New()), shared.IncidentID(uuid.New())

	next := func(id shared.IncidentID) int {
		var n int

		require.NoError(t, s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			var err error

			n, err = counter.Next(ctx, id)

			return err
		}))

		return n
	}

	assert.Equal(t, 1, next(a))
	assert.Equal(t, 2, next(a))
	assert.Equal(t, 1, next(b), "every incident counts on its own")
	assert.Equal(t, 3, next(a))

	t.Run("a rolled back transaction leaves no gap", func(t *testing.T) {
		err := s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			n, err := counter.Next(ctx, a)
			require.NoError(t, err)
			assert.Equal(t, 4, n)

			return assert.AnError
		})
		require.ErrorIs(t, err, assert.AnError)

		assert.Equal(t, 4, next(a), "the number of the failed write is handed out again")
	})

	t.Run("needs a transaction", func(t *testing.T) {
		_, err := counter.Next(t.Context(), a)
		require.ErrorContains(t, err, "no transaction in context")
	})
}

func TestTxFromCtxWithoutTransaction(t *testing.T) {
	_, err := sqlitestore.TxFromCtx(t.Context())
	require.ErrorContains(t, err, "no transaction in context")
}

func TestGuards_RequireTransaction(t *testing.T) {
	_, err := sqlitestore.NewIncidentHierarchyGuard().LockForUpdate(t.Context())
	require.ErrorContains(t, err, "incident hierarchy lock")

	_, err = sqlitestore.NewIncidentHierarchyGuard().HasChildren(t.Context(), shared.IncidentID(uuid.New()))
	require.ErrorContains(t, err, "incident hierarchy children")

	_, err = sqlitestore.NewAccessGuard().LockForUpdate(t.Context())
	require.ErrorContains(t, err, "access guard lock")

	err = sqlitestore.NewIncidentRetention(nil).Archive(t.Context(), shared.IncidentID(uuid.New()), time.Now())
	require.ErrorContains(t, err, "archive incident")
}

// lockedSection checks that a second LockForUpdate waits until the first is released.
func lockedSection(
	t *testing.T, s *stack, lock func(context.Context) (func(), error), releaseTwice bool,
) {
	t.Helper()

	require.NoError(t, s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
		release, err := lock(ctx)
		require.NoError(t, err)

		acquired := make(chan struct{})

		go func() {
			rel, lockErr := lock(ctx)
			if lockErr == nil {
				close(acquired)
				rel()
			}
		}()

		select {
		case <-acquired:
			require.FailNow(t, "the second lock was granted while the first was held")
		case <-time.After(50 * time.Millisecond):
		}

		release()

		if releaseTwice {
			release() // the hierarchy guard tolerates a second release
		}

		select {
		case <-acquired:
		case <-time.After(5 * time.Second):
			require.FailNow(t, "the second lock was not granted after the release")
		}

		return nil
	}))
}

func TestGuards_SerialiseWriters(t *testing.T) {
	s := newStack(t)

	t.Run("incident hierarchy", func(t *testing.T) {
		lockedSection(t, s, sqlitestore.NewIncidentHierarchyGuard().LockForUpdate, true)
	})

	t.Run("access", func(t *testing.T) {
		guard := sqlitestore.NewAccessGuard()

		lockedSection(t, s, guard.LockForUpdate, false)
	})
}

func TestIncidentHierarchyGuard_HasChildren(t *testing.T) {
	s := newStack(t)
	guard := sqlitestore.NewIncidentHierarchyGuard()

	parent, child, other := uuid.New(), uuid.New(), uuid.New()

	hasChildren := func(id uuid.UUID) bool {
		var got bool

		require.NoError(t, s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			var err error

			got, err = guard.HasChildren(ctx, shared.IncidentID(id))

			return err
		}))

		return got
	}

	assert.False(t, hasChildren(parent), "no events, no children")

	s.insertEvent(t, child, 1, "ParentLinked", `{"parentId":"`+parent.String()+`"}`)
	assert.True(t, hasChildren(parent), "a linked child counts")
	assert.False(t, hasChildren(other), "only the linked parent has children")

	s.insertEvent(t, child, 2, "ParentUnlinked", `{}`)
	assert.False(t, hasChildren(parent), "an unlinked child no longer counts")

	s.insertEvent(t, child, 3, "ParentLinked", `{"parentId":"`+parent.String()+`"}`)
	assert.True(t, hasChildren(parent), "re-linking counts again")

	s.insertEvent(t, child, 4, "Deleted", `{}`)
	assert.False(t, hasChildren(parent), "a deleted child no longer counts")
}

func TestAppend_ConflictIsReportedAsConflict(t *testing.T) {
	s := newStack(t)
	id := shared.IncidentID(uuid.New())

	open := func() error {
		inc := incident.New(id)
		require.NoError(t, inc.Open("Same stream", nil, nil, time.Now().UTC(), "sys"))

		return s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := s.store.Append(ctx, inc)

			return err
		})
	}

	require.NoError(t, open())

	err := open()
	require.Error(t, err)
	assert.True(t, sqlitestore.IsConflict(err))
	require.ErrorIs(t, err, shared.ErrConflict)
	assert.False(t, sqlitestore.IsConflict(assert.AnError))
	assert.False(t, sqlitestore.IsConflict(nil))
}

func TestAppend_IndexesOwnedStreamsAndSkipsEmptyAggregates(t *testing.T) {
	s := newStack(t)
	id := s.openIncident(t, "Owned")

	assert.Equal(t, 1, countRows(
		t,
		s.write,
		`SELECT COUNT(*) FROM eventsourcing_aggregate_index WHERE stream_type = 'Incident' AND stream_id = ? AND incident_id = ?`,
		uuid.UUID(id).String(),
		uuid.UUID(id).String(),
	))

	// An aggregate without pending events appends nothing and needs no transaction.
	cursor, err := s.store.Append(t.Context(), incident.New(shared.IncidentID(uuid.New())))
	require.NoError(t, err)
	assert.Nil(t, cursor)

	// Appending without a transaction fails instead of writing outside one.
	inc := incident.New(shared.IncidentID(uuid.New()))
	require.NoError(t, inc.Open("No tx", nil, nil, time.Now().UTC(), "sys"))

	_, err = s.store.Append(t.Context(), inc)
	require.ErrorContains(t, err, "no transaction in context")
}

func TestNoopSnapshotStoreAndGenerators(t *testing.T) {
	var snap sqlitestore.NoopSnapshotStore

	found, err := snap.Load(t.Context(), "Incident", uuid.New(), incident.New(shared.IncidentID(uuid.New())))
	require.NoError(t, err)
	assert.False(t, found, "there is never a snapshot to load")
	require.NoError(t, snap.Save(t.Context(), incident.New(shared.IncidentID(uuid.New()))))

	gen := sqlitestore.UUIDGen{}
	a, b := gen.New(), gen.New()
	assert.NotEqual(t, a, b)
	assert.Equal(t, uuid.Version(7), a.Version(), "ids are time-ordered")
	assert.Less(t, a.String(), b.String(), "later ids sort after earlier ones")

	assert.WithinDuration(t, time.Now(), sqlitestore.WallClock{}.Now(), time.Second)
	assert.Equal(t, time.UTC, sqlitestore.WallClock{}.Now().Location())
}

func TestIncidentRetention(t *testing.T) {
	s := newStack(t)
	retention := sqlitestore.NewIncidentRetention(s.read)

	old := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	cutoff := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	recent := time.Date(2025, 12, 1, 0, 0, 0, 0, time.UTC)

	var (
		openOld     = uuid.New()
		openRecent  = uuid.New()
		closedOld   = uuid.New()
		closedFresh = uuid.New()
		deletedOld  = uuid.New()
		deletedNew  = uuid.New()
	)

	insert := func(id uuid.UUID, updated time.Time, closedAt, deletedAt *time.Time) {
		_, err := s.write.ExecContext(t.Context(), `
			INSERT INTO readmodel_incident (id, name, is_closed, is_deleted, closed_at, deleted_at, created_at, updated_at)
			VALUES (?, 'x', ?, ?, ?, ?, ?, ?)`,
			id.String(), btoi(closedAt != nil), btoi(deletedAt != nil),
			fmtPtr(closedAt), fmtPtr(deletedAt), sqlite.FormatTime(updated), sqlite.FormatTime(updated))
		require.NoError(t, err)
	}

	insert(openOld, old, nil, nil)
	insert(openRecent, recent, nil, nil)
	insert(closedOld, old, &old, nil)
	insert(closedFresh, recent, &recent, nil)
	insert(deletedOld, old, nil, &old)
	insert(deletedNew, recent, nil, &recent)

	toUUIDs := func(ids []shared.IncidentID) []uuid.UUID {
		out := make([]uuid.UUID, len(ids))
		for i, id := range ids {
			out[i] = uuid.UUID(id)
		}

		return out
	}

	t.Run("OpenBefore lists open incidents untouched since the cutoff", func(t *testing.T) {
		ids, err := retention.OpenBefore(t.Context(), cutoff, 10)
		require.NoError(t, err)
		assert.Equal(t, []uuid.UUID{openOld}, toUUIDs(ids))

		ids, err = retention.OpenBefore(t.Context(), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 1)
		require.NoError(t, err)
		assert.Len(t, ids, 1, "the limit is respected")
		assert.Equal(t, uuid.UUID(ids[0]), openOld, "oldest first")
	})

	t.Run("ArchiveBefore lists closed and deleted incidents past their own cutoff", func(t *testing.T) {
		ids, err := retention.ArchiveBefore(t.Context(), cutoff, cutoff, 10)
		require.NoError(t, err)
		assert.ElementsMatch(t, []uuid.UUID{closedOld, deletedOld}, toUUIDs(ids))

		ids, err = retention.ArchiveBefore(t.Context(), cutoff, recent.Add(time.Hour), 10)
		require.NoError(t, err)
		assert.ElementsMatch(t, []uuid.UUID{closedOld, deletedOld, deletedNew}, toUUIDs(ids),
			"the deleted cutoff applies to deleted incidents only")

		none, err := retention.ArchiveBefore(t.Context(), old.Add(-time.Hour), old.Add(-time.Hour), 10)
		require.NoError(t, err)
		assert.Empty(t, none)
	})

	t.Run("a closed incident that is not yet old enough stays", func(t *testing.T) {
		ids, err := retention.ArchiveBefore(t.Context(), cutoff, cutoff, 10)
		require.NoError(t, err)
		assert.NotContains(t, toUUIDs(ids), closedFresh)
	})
}

func fmtPtr(t *time.Time) any {
	if t == nil {
		return nil
	}

	return sqlite.FormatTime(*t)
}

func btoi(b bool) int {
	if b {
		return 1
	}

	return 0
}

func TestIncidentRetention_ArchiveMovesTheStreamsOutOfTheLiveLog(t *testing.T) {
	s := newStack(t)
	retention := sqlitestore.NewIncidentRetention(s.read)

	keep := s.openIncident(t, "Keep")
	gone := s.openIncident(t, "Gone")

	liveEvents := func(id shared.IncidentID) int {
		return countRows(
			t,
			s.write,
			`SELECT COUNT(*) FROM eventsourcing_events WHERE stream_id = ?`,
			uuid.UUID(id).String(),
		)
	}

	goneEvents, keepEvents := liveEvents(gone), liveEvents(keep)
	require.Positive(t, goneEvents)

	var firstSeq int

	require.NoError(t, s.write.QueryRowContext(t.Context(),
		`SELECT MIN(seq) FROM eventsourcing_events WHERE stream_id = ?`, uuid.UUID(gone).String()).Scan(&firstSeq))

	_, err := s.write.ExecContext(t.Context(),
		`INSERT INTO eventsourcing_incident_counters (incident_id, next_number) VALUES (?, 3)`,
		uuid.UUID(gone).String())
	require.NoError(t, err)

	archivedAt := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

	archive := func() {
		require.NoError(t, s.tx.WithinTx(t.Context(), func(ctx context.Context) error {
			return retention.Archive(ctx, gone, archivedAt)
		}))
	}

	archive()
	archive() // archiving twice is harmless

	id := uuid.UUID(gone).String()

	assert.Zero(t, countRows(t, s.write, `SELECT COUNT(*) FROM eventsourcing_events WHERE stream_id = ?`, id))
	assert.Zero(
		t,
		countRows(t, s.write, `SELECT COUNT(*) FROM eventsourcing_aggregate_index WHERE incident_id = ?`, id),
	)
	assert.Zero(
		t,
		countRows(t, s.write, `SELECT COUNT(*) FROM eventsourcing_incident_counters WHERE incident_id = ?`, id),
	)

	assert.Equal(t, goneEvents, countRows(t, s.write,
		`SELECT COUNT(*) FROM eventsourcing_archive_events WHERE stream_id = ?`, id),
		"every event of the incident is kept in the archive before it leaves the live log")
	assert.Equal(t, firstSeq, countRows(
		t,
		s.write,
		`SELECT MIN(seq) FROM eventsourcing_archive_events WHERE stream_id = ?`,
		id,
	), "the archive keeps the original position")
	assert.Equal(t, 1, countRows(t, s.write,
		`SELECT COUNT(*) FROM eventsourcing_archive_aggregate_index WHERE incident_id = ?`, id))
	assert.Equal(t, 1, countRows(t, s.write,
		`SELECT COUNT(*) FROM eventsourcing_archived_incidents WHERE incident_id = ? AND reason = 'PURGE'`, id))

	assert.Equal(t, keepEvents, liveEvents(keep), "other incidents are untouched")

	events, err := s.store.Load(t.Context(), "Incident", uuid.UUID(gone))
	require.NoError(t, err)
	assert.Empty(t, events, "an archived stream cannot be loaded from the live log")
}
