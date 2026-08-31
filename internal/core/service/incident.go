// Package service contains the application services that orchestrate commands
// across domain aggregates. Services own the transaction boundary and call the
// domain methods — they must not contain business logic.
package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// IncidentService handles all write-side operations for the Incident aggregate.
type IncidentService struct {
	tx       outbound.Transactor
	repo     outbound.IncidentRepository
	layers   outbound.LayerRepository
	clock    outbound.Clock
	ids      outbound.IDs
	notifier outbound.EventNotifier
}

func NewIncidentService(
	tx outbound.Transactor,
	repo outbound.IncidentRepository,
	layers outbound.LayerRepository,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *IncidentService {
	return &IncidentService{tx: tx, repo: repo, layers: layers, clock: clock, ids: ids, notifier: notifier}
}

// CreateIncident opens a new incident, creates its divisions, and creates the
// requested layers (defaulting to one). All writes are in a single transaction.
func (s *IncidentService) CreateIncident(
	ctx context.Context,
	name string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	layerNames []string,
	actor identity.Actor,
) (inbound.CreateIncidentResult, error) {
	if len(layerNames) == 0 {
		layerNames = []string{"Lage"}
	}

	incID := shared.IncidentID(s.ids.New())
	at := s.clock.Now()

	// Pre-generate division IDs so the service (not the domain) is responsible.
	for i := range divisions {
		if divisions[i].ID == (shared.DivisionID{}) {
			divisions[i].ID = shared.DivisionID(s.ids.New())
		}
	}

	layerIDs := make([]shared.LayerID, len(layerNames))
	for i := range layerNames {
		layerIDs[i] = shared.LayerID(s.ids.New())
	}

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		// 1. Create the Incident aggregate.
		inc := incident.New(incID)
		if err := inc.Open(name, location, divisions, at, actor.Sub); err != nil {
			return err
		}
		if _, err := s.repo.Save(ctx, inc); err != nil {
			return err
		}

		// 2. Create each Layer.
		for i, layerName := range layerNames {
			l := layer.New(layerIDs[i])
			if err := l.Create(incID, layerName, actor.Sub, at); err != nil {
				return fmt.Errorf("create layer %q: %w", layerName, err)
			}
			if _, err := s.layers.Save(ctx, l); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return inbound.CreateIncidentResult{}, err
	}
	_ = s.notifier.Notify(ctx)
	return inbound.CreateIncidentResult{IncidentID: incID, LayerIDs: layerIDs}, nil
}

// UpdateIncident renames and/or changes the location and divisions.
func (s *IncidentService) UpdateIncident(
	ctx context.Context,
	id shared.IncidentID,
	name *string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	actor identity.Actor,
) error {
	at := s.clock.Now()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if name != nil {
			if err := inc.Rename(*name, actor.Sub, at); err != nil {
				return err
			}
		}
		if location != nil {
			if err := inc.ChangeLocation(*location, actor.Sub, at); err != nil {
				return err
			}
		}
		if divisions != nil {
			// pre-generate IDs for new divisions
			for i := range divisions {
				if divisions[i].ID == (shared.DivisionID{}) {
					divisions[i].ID = shared.DivisionID(s.ids.New())
				}
			}
			if err := inc.UpdateDivisions(divisions, actor.Sub, at); err != nil {
				return err
			}
		}
		_, err = s.repo.Save(ctx, inc)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

// CloseIncident closes the incident.
func (s *IncidentService) CloseIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error {
	return s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		return inc.Close(shared.ReasonManual, actor.Sub, s.clock.Now())
	})
}

// ReopenIncident reopens a closed incident.
func (s *IncidentService) ReopenIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error {
	return s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		return inc.Reopen(actor.Sub, s.clock.Now())
	})
}

// DeleteIncident deletes a closed incident.
func (s *IncidentService) DeleteIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error {
	return s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		return inc.Delete(shared.DeleteReasonManual, actor.Sub, s.clock.Now())
	})
}

func (s *IncidentService) writeIncident(ctx context.Context, id shared.IncidentID, fn func(*incident.Incident) error) error {
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}
		if err := fn(inc); err != nil {
			return err
		}
		_, err = s.repo.Save(ctx, inc)
		return err
	})
	if err != nil {
		return err
	}
	_ = s.notifier.Notify(ctx)
	return nil
}

// LoadIncident returns the incident aggregate (for queries that need aggregate state).
func (s *IncidentService) LoadIncident(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	idVal, err := uuid.Parse(id.String())
	if err != nil {
		return nil, shared.ErrNotFound
	}
	return s.repo.Load(ctx, shared.IncidentID(idVal))
}
