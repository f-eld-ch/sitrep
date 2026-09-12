package sqlite

import (
	"context"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.ProjectorLock = (*ProjectorLock)(nil)

// ProjectorLock is the SQLite implementation of outbound.ProjectorLock.
// It uses an in-process sync.Mutex because SQLite's single-writer model
// means there is exactly one process owning the database (enforced by the
// OS-level flock in the stack constructor). No LockLivenessChecker is
// implemented: an in-process mutex cannot be silently lost.
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
