package service

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// LayerService handles write-side operations for the Layer aggregate.
type LayerService struct {
	tx       outbound.Transactor
	repo     outbound.LayerRepository
	clock    outbound.Clock
	ids      outbound.IDs
	notifier outbound.EventNotifier
}

func NewLayerService(
	tx outbound.Transactor,
	repo outbound.LayerRepository,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *LayerService {
	return &LayerService{tx: tx, repo: repo, clock: clock, ids: ids, notifier: notifier}
}

// CreateLayer creates a new layer for an incident.
func (s *LayerService) CreateLayer(
	ctx context.Context,
	incidentID shared.IncidentID,
	name string,
	actor identity.Actor,
) (shared.LayerID, error) {
	layerID := shared.LayerID(s.ids.New())
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		l := layer.New(layerID)
		if err := l.Create(incidentID, name, actor.Sub, at); err != nil {
			return err
		}
		_, err := s.repo.Save(ctx, l)
		return err
	})
	if err != nil {
		return shared.LayerID{}, err
	}
	_ = s.notifier.Notify(ctx)
	return layerID, nil
}

// RenameLayer renames an existing layer.
func (s *LayerService) RenameLayer(ctx context.Context, id shared.LayerID, name string, actor identity.Actor) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		l, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := l.Rename(name, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, l)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

// RemoveLayer removes a layer and should cascade feature removal at the service level.
func (s *LayerService) RemoveLayer(ctx context.Context, id shared.LayerID, actor identity.Actor) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		l, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := l.Remove(shared.DeleteReasonManual, actor.Sub, at); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, l)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}
