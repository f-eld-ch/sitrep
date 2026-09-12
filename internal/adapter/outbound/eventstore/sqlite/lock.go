package sqlite

import (
	"context"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.ProjectorLock = (*ProjectorLock)(nil)

// ProjectorLock is the SQLite implementation of outbound.ProjectorLock.
// It uses an in-process sync.Mutex. SQLite's MaxOpenConns(1) on the write
// handle already serialises all write transactions, so this lock is only
// needed to satisfy the conformance suite's lock sub-tests; production
// wiring does not call WithLock on the SQLite projector.
//
// Running two server processes against the same database file is unsupported:
// the second process will contend on SQLite's file-level write lock and log
// busy errors, but no OS-level guard is currently enforced at startup.
// No LockLivenessChecker is implemented: an in-process mutex cannot be
// silently lost.
type ProjectorLock struct {
	mu   sync.Mutex
	held map[string]struct{}
}

func NewProjectorLock() *ProjectorLock {
	return &ProjectorLock{held: make(map[string]struct{})}
}

func (l *ProjectorLock) Acquire(_ context.Context, projection string) (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if _, ok := l.held[projection]; ok {
		return nil, outbound.ErrLockHeld
	}

	l.held[projection] = struct{}{}

	var once sync.Once

	release := func() {
		once.Do(func() {
			l.mu.Lock()
			delete(l.held, projection)
			l.mu.Unlock()
		})
	}

	return release, nil
}
