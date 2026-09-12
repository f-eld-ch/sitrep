package sqlite

import (
	"context"
	"fmt"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.AccessGuard = (*AccessGuard)(nil)

// AccessGuard serialises cross-aggregate access validation within a write
// transaction. The implementation mirrors IncidentHierarchyGuard: an in-process
// mutex replaces pg_advisory_xact_lock, and MaxOpenConns(1) provides the
// structural serialisation guarantee. See doc.go.
type AccessGuard struct {
	mu sync.Mutex
}

func NewAccessGuard() *AccessGuard { return &AccessGuard{} }

func (g *AccessGuard) LockForUpdate(ctx context.Context) (func(), error) {
	if _, err := TxFromCtx(ctx); err != nil {
		return nil, fmt.Errorf("access guard lock: %w", err)
	}

	g.mu.Lock()

	return g.mu.Unlock, nil
}
