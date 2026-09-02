package inmem

import (
	"context"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion: ProjectorLock satisfies the outbound.ProjectorLock port.
var _ outbound.ProjectorLock = (*ProjectorLock)(nil)

// ProjectorLock is the in-process implementation of outbound.ProjectorLock.
// It is the reference implementation and the test double for leader-election
// behaviour — use it when you need to occupy a lock without a running Postgres
// instance.
//
// No LockLivenessChecker is implemented: an in-process lock cannot be silently
// lost.
type ProjectorLock struct {
	mu   sync.Mutex
	held map[string]struct{}
}

// NewProjectorLock returns a ProjectorLock ready for use.
func NewProjectorLock() *ProjectorLock {
	return &ProjectorLock{held: make(map[string]struct{})}
}

// Acquire attempts to acquire the named lock. It is non-blocking: if the name
// is already held it returns outbound.ErrLockHeld immediately. On success the
// returned release function removes the lock; it is idempotent and safe to call
// from multiple goroutines.
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
