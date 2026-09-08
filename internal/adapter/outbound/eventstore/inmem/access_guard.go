package inmem

import (
	"context"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

type AccessGuard struct{ mu sync.Mutex }

func NewAccessGuard() *AccessGuard { return &AccessGuard{} }

func (g *AccessGuard) LockForUpdate(_ context.Context) (func(), error) {
	g.mu.Lock()
	return g.mu.Unlock, nil
}

var _ outbound.AccessGuard = (*AccessGuard)(nil)
