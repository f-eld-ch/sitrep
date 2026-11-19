package inmem_test

import (
	"context"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var hierarchyAt = time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC)

// openIncident stores a new open incident and returns it for further commands.
func openIncident(t *testing.T, s *inmem.EventStore, name string) *incident.Incident {
	t.Helper()

	inc := incident.New(shared.IncidentID(uuid.New()))
	require.NoError(t, inc.Open(name, nil, nil, hierarchyAt, "sys"))

	_, err := s.Append(bg, inc)
	require.NoError(t, err)

	return inc
}

// save appends the incident's pending events.
func save(t *testing.T, s *inmem.EventStore, inc *incident.Incident) {
	t.Helper()

	_, err := s.Append(bg, inc)
	require.NoError(t, err)
}

func TestIncidentHierarchyGuard_HasChildren(t *testing.T) {
	s := inmem.NewEventStore()
	guard := inmem.NewIncidentHierarchyGuard(s)

	parent := openIncident(t, s, "Parent")
	other := openIncident(t, s, "Other")
	child := openIncident(t, s, "Child")

	has := func(id *incident.Incident) bool {
		t.Helper()

		got, err := guard.HasChildren(bg, shared.IncidentID(id.Root().ID()))
		require.NoError(t, err)

		return got
	}

	assert.False(t, has(parent), "nothing linked yet")

	require.NoError(t, child.LinkParent(shared.IncidentID(parent.Root().ID()), "sys", hierarchyAt))
	save(t, s, child)
	assert.True(t, has(parent))
	assert.False(t, has(other), "only the parent the child points to has children")
	assert.False(t, has(child))

	require.NoError(t, child.UnlinkParent("sys", hierarchyAt))
	save(t, s, child)
	assert.False(t, has(parent), "an unlinked child no longer counts")

	require.NoError(t, child.LinkParent(shared.IncidentID(other.Root().ID()), "sys", hierarchyAt))
	save(t, s, child)
	assert.False(t, has(parent), "the latest link wins")
	assert.True(t, has(other))

	require.NoError(t, child.Close(shared.ReasonManual, "sys", hierarchyAt))
	require.NoError(t, child.Delete(shared.DeleteReasonManual, "sys", hierarchyAt))
	save(t, s, child)
	assert.False(t, has(other), "a deleted child no longer counts")
}

// ParentLinked is an event of that name whose payload does not have the shape the hierarchy
// guard reads: parentId is a number, not an id.
type ParentLinked struct {
	ParentID int `json:"parentId"`
}

type brokenIncident struct{ root eventsourcing.Root }

func (a *brokenIncident) Root() *eventsourcing.Root          { return &a.root }
func (*brokenIncident) AggregateType() string                { return "Incident" }
func (*brokenIncident) Transition(eventsourcing.Event) error { return nil }

func TestIncidentHierarchyGuard_HasChildrenFailsOnAnUnreadableLink(t *testing.T) {
	s := inmem.NewEventStore()
	guard := inmem.NewIncidentHierarchyGuard(s)

	broken := &brokenIncident{}
	broken.root.SetID(uuid.New())
	eventsourcing.Register(broken, ParentLinked{})
	eventsourcing.TrackChange(broken, ParentLinked{ParentID: 7}, hierarchyAt, nil)

	_, err := s.Append(bg, broken)
	require.NoError(t, err)

	has, err := guard.HasChildren(bg, shared.IncidentID(uuid.New()))
	require.Error(t, err)
	assert.False(t, has)
}

func TestGuards_SerializeCriticalSections(t *testing.T) {
	s := inmem.NewEventStore()

	tests := []struct {
		name string
		lock func(ctx context.Context) (func(), error)
	}{
		{"incident hierarchy", inmem.NewIncidentHierarchyGuard(s).LockForUpdate},
		{"access", inmem.NewAccessGuard().LockForUpdate},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var (
				inside     atomic.Int32
				violations atomic.Int32
				wg         sync.WaitGroup
			)

			for range 50 {
				wg.Go(func() {
					release, err := tc.lock(bg)
					if err != nil {
						violations.Add(1)
						return
					}

					if inside.Add(1) != 1 {
						violations.Add(1)
					}

					runtime.Gosched() // give a caller that was wrongly let in time to overlap

					inside.Add(-1)
					release()
				})
			}

			wg.Wait()
			assert.Zero(t, violations.Load(), "two callers were inside the critical section at once")
		})
	}
}

func TestSnapshotStore_NeverHoldsSnapshots(t *testing.T) {
	var snapshots outbound.SnapshotStore = inmem.SnapshotStore{}

	a := newWidget(uuid.New())
	track(a, WidgetCreated{Name: "x"})

	require.NoError(t, snapshots.Save(bg, a))

	found, err := snapshots.Load(bg, "Widget", a.Root().ID(), newWidget(a.Root().ID()))
	require.NoError(t, err)
	assert.False(t, found, "the default store reports nothing found, so aggregates are replayed")
}

func TestProjector_RunBlocksUntilTheContextEnds(t *testing.T) {
	ctx, cancel := context.WithCancel(bg)
	done := make(chan error, 1)

	go func() { done <- inmem.NewProjector().Run(ctx) }()

	select {
	case err := <-done:
		require.FailNow(t, "Run returned before the context ended", "%v", err)
	default:
	}

	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
}

// unmarshalable cannot be encoded as JSON.
type unmarshalable struct{ C chan int }

type unmarshalableAggregate struct{ root eventsourcing.Root }

func (a *unmarshalableAggregate) Root() *eventsourcing.Root          { return &a.root }
func (*unmarshalableAggregate) AggregateType() string                { return "Bad" }
func (*unmarshalableAggregate) Transition(eventsourcing.Event) error { return nil }

func TestEventStore_Append_RejectsEventDataThatCannotBeEncoded(t *testing.T) {
	s := inmem.NewEventStore()

	a := &unmarshalableAggregate{}
	a.root.SetID(uuid.New())
	eventsourcing.Register(a, unmarshalable{})
	eventsourcing.TrackChange(a, unmarshalable{C: make(chan int)}, hierarchyAt, nil)

	cursor, err := s.Append(bg, a)
	require.ErrorContains(t, err, "marshal event data")
	assert.Nil(t, cursor)

	events, err := s.Load(bg, "Bad", a.Root().ID())
	require.NoError(t, err)
	assert.Empty(t, events, "nothing is stored for a failed append")
}
