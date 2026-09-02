package inmem

import (
	"context"
	"encoding/json"
	"slices"
	"sync"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var _ outbound.IncidentHierarchyGuard = (*IncidentHierarchyGuard)(nil)

type IncidentHierarchyGuard struct {
	store *EventStore
	mu    sync.Mutex
}

func NewIncidentHierarchyGuard(store *EventStore) *IncidentHierarchyGuard {
	return &IncidentHierarchyGuard{store: store}
}

func (g *IncidentHierarchyGuard) LockForUpdate(_ context.Context) (func(), error) {
	g.mu.Lock()

	return g.mu.Unlock, nil
}

func (g *IncidentHierarchyGuard) HasChildren(_ context.Context, incidentID shared.IncidentID) (bool, error) {
	g.store.mu.RLock()
	defer g.store.mu.RUnlock()

	for key, stream := range g.store.streams {
		if key.streamType != "Incident" || childDeleted(stream) {
			continue
		}

		parentID, hasParent, err := latestParent(stream)
		if err != nil {
			return false, err
		}

		if hasParent && parentID == incidentID {
			return true, nil
		}
	}

	return false, nil
}

func childDeleted(stream []eventsourcing.Event) bool {
	for _, event := range slices.Backward(stream) {
		if event.EventType == "Deleted" {
			return true
		}
	}

	return false
}

func latestParent(stream []eventsourcing.Event) (shared.IncidentID, bool, error) {
	for _, event := range slices.Backward(stream) {
		switch event.EventType {
		case "ParentUnlinked":
			return shared.IncidentID{}, false, nil
		case "ParentLinked":
			var data struct {
				ParentID shared.IncidentID `json:"parentId"`
			}
			if err := remarshalHierarchyData(event.Data, &data); err != nil {
				return shared.IncidentID{}, false, err
			}

			return data.ParentID, true, nil
		}
	}

	return shared.IncidentID{}, false, nil
}

func remarshalHierarchyData(in, out any) error {
	b, err := json.Marshal(in)
	if err != nil {
		return err
	}

	return json.Unmarshal(b, out)
}
