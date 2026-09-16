package service

import (
	"context"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// ResourceService handles write-side operations for the Resource aggregate.
type ResourceService struct {
	tx             outbound.Transactor
	repo           outbound.ResourceRepository
	incidents      outbound.IncidentRepository
	schadenplaetze outbound.SchadenplatzRepository
	access         outbound.IncidentAccessChecker
	clock          outbound.Clock
	ids            outbound.IDs
	notifier       outbound.EventNotifier
	tracer         trace.Tracer
}

var _ inbound.ResourceService = (*ResourceService)(nil)

func NewResourceService(
	tx outbound.Transactor,
	repo outbound.ResourceRepository,
	incidents outbound.IncidentRepository,
	schadenplaetze outbound.SchadenplatzRepository,
	access outbound.IncidentAccessChecker,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *ResourceService {
	return &ResourceService{
		tx:             tx,
		repo:           repo,
		incidents:      incidents,
		schadenplaetze: schadenplaetze,
		access:         access,
		clock:          clock,
		ids:            ids,
		notifier:       notifier,
		tracer:         otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// AlertResource creates a new Resource assigned to a Schadenplatz.
// If input.SchadenplatzID is nil the incident's default Schadenplatz is used.
func (s *ResourceService) AlertResource(
	ctx context.Context,
	input inbound.AlertResourceInput,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	ctx, span := s.tracer.Start(ctx, "ResourceService.AlertResource",
		trace.WithAttributes(attribute.String("incident.id", input.IncidentID.String())))
	defer span.End()

	id := shared.ResourceID(s.ids.New())

	at := s.clock.Now()
	if input.OccurredAt != nil {
		at = *input.OccurredAt
	}

	var res *resource.Resource

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, input.IncidentID, access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, input.IncidentID)
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		schadenplatzID := input.SchadenplatzID
		if schadenplatzID == nil {
			defID := inc.DefaultSchadenplatzID()
			if defID == nil {
				return shared.ValidationError{Field: "schadenplatzId", Message: "incident has no default Schadenplatz"}
			}

			schadenplatzID = defID
		}

		res = resource.New(id)
		if err := res.Alert(
			input.IncidentID,
			*schadenplatzID,
			input.Formation,
			input.Name,
			input.Size,
			input.PersonnelCount,
			input.Hauptaufgabe,
			input.Contact,
			input.HomeLocation,
			input.SourceMessageID,
			actor.Sub,
			at,
		); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, res)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.ResourceState{}, err
	}

	span.SetAttributes(attribute.String("resource.id", id.String()))

	_ = s.notifier.Notify(ctx)

	return stateFromResource(res), nil
}

// MarkResourceReady transitions the resource from AUFGEBOTEN to EINSATZBEREIT.
func (s *ResourceService) MarkResourceReady(
	ctx context.Context,
	id shared.ResourceID,
	at *time.Time,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.MarkResourceReady",
		id,
		at,
		actor,
		func(res *resource.Resource, t time.Time) error {
			return res.MarkReady(actor.Sub, t)
		},
	)
}

// DeployResource transitions the resource from EINSATZBEREIT to EINGESETZT.
func (s *ResourceService) DeployResource(
	ctx context.Context,
	id shared.ResourceID,
	at *time.Time,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.DeployResource",
		id,
		at,
		actor,
		func(res *resource.Resource, t time.Time) error {
			return res.Deploy(actor.Sub, t)
		},
	)
}

// StandDownResource transitions the resource from EINGESETZT back to EINSATZBEREIT.
func (s *ResourceService) StandDownResource(
	ctx context.Context,
	id shared.ResourceID,
	at *time.Time,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.StandDownResource",
		id,
		at,
		actor,
		func(res *resource.Resource, t time.Time) error {
			return res.StandDown(actor.Sub, t)
		},
	)
}

// RelieveResource permanently terminates the resource's assignment.
func (s *ResourceService) RelieveResource(
	ctx context.Context,
	id shared.ResourceID,
	successorID *shared.ResourceID,
	at *time.Time,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	ctx, span := s.tracer.Start(ctx, "ResourceService.RelieveResource",
		trace.WithAttributes(attribute.String("resource.id", id.String())))
	defer span.End()

	resolvedAt := s.resolveAt(at)

	var res *resource.Resource

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error

		res, err = s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, res.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, res.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		if err := res.Relieve(successorID, actor.Sub, resolvedAt); err != nil {
			return err
		}

		if _, err = s.repo.Save(ctx, res); err != nil {
			return err
		}

		// Link the predecessor on the successor resource if provided.
		if successorID != nil {
			successor, err := s.repo.Load(ctx, *successorID)
			if err != nil {
				return err
			}

			if err := successor.LinkSuccession(id, actor.Sub, resolvedAt); err != nil {
				return err
			}

			_, err = s.repo.Save(ctx, successor)

			return err
		}

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.ResourceState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return stateFromResource(res), nil
}

// ReassignResource moves the resource to a different Schadenplatz.
func (s *ResourceService) ReassignResource(
	ctx context.Context,
	id shared.ResourceID,
	schadenplatzID shared.SchadenplatzID,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.ReassignResource",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.Reassign(schadenplatzID, actor.Sub, at)
		},
	)
}

// UpdateDeploymentLocation sets or clears the precise operational position.
func (s *ResourceService) UpdateDeploymentLocation(
	ctx context.Context,
	id shared.ResourceID,
	loc *resource.DeploymentLocation,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.UpdateDeploymentLocation",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.UpdateDeploymentLocation(loc, actor.Sub, at)
		},
	)
}

// ChangeHauptaufgabe updates the primary task description.
func (s *ResourceService) ChangeHauptaufgabe(
	ctx context.Context,
	id shared.ResourceID,
	hauptaufgabe string,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.ChangeHauptaufgabe",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.ChangeHauptaufgabe(hauptaufgabe, actor.Sub, at)
		},
	)
}

// UpdateContact changes the resource's communication details.
func (s *ResourceService) UpdateContact(
	ctx context.Context,
	id shared.ResourceID,
	contact resource.Contact,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.UpdateContact",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.UpdateContact(contact, actor.Sub, at)
		},
	)
}

// UpdatePersonnelCount corrects the resource's headcount.
func (s *ResourceService) UpdatePersonnelCount(
	ctx context.Context,
	id shared.ResourceID,
	count int,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.UpdatePersonnelCount",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.UpdatePersonnelCount(count, actor.Sub, at)
		},
	)
}

// RecordEinsatzDauer records the operational period for this resource.
func (s *ResourceService) RecordEinsatzDauer(
	ctx context.Context,
	id shared.ResourceID,
	beginn time.Time,
	ende *time.Time,
	actor identity.Actor,
) (inbound.ResourceState, error) {
	return s.simpleTransition(
		ctx,
		"ResourceService.RecordEinsatzDauer",
		id,
		nil,
		actor,
		func(res *resource.Resource, at time.Time) error {
			return res.RecordEinsatzDauer(beginn, ende, actor.Sub, at)
		},
	)
}

func (s *ResourceService) resolveAt(at *time.Time) time.Time {
	if at != nil {
		return *at
	}

	return s.clock.Now()
}

// simpleTransition handles the common load-access-mutate-save pattern for resource commands.
func (s *ResourceService) simpleTransition(
	ctx context.Context,
	spanName string,
	id shared.ResourceID,
	at *time.Time,
	actor identity.Actor,
	fn func(*resource.Resource, time.Time) error,
) (inbound.ResourceState, error) {
	ctx, span := s.tracer.Start(ctx, spanName,
		trace.WithAttributes(attribute.String("resource.id", id.String())))
	defer span.End()

	resolvedAt := s.resolveAt(at)

	var res *resource.Resource

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error

		res, err = s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := requireIncidentAccess(ctx, s.access, actor, res.IncidentID(), access.IncidentWrite); err != nil {
			return err
		}

		inc, err := s.incidents.Load(ctx, res.IncidentID())
		if err != nil {
			return err
		}

		if !inc.IsOpen() {
			return shared.ErrIncidentNotOpen
		}

		if err := fn(res, resolvedAt); err != nil {
			return err
		}

		_, err = s.repo.Save(ctx, res)

		return err
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return inbound.ResourceState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return stateFromResource(res), nil
}

func stateFromResource(res *resource.Resource) inbound.ResourceState {
	return inbound.ResourceState{
		ID:                 res.ID(),
		IncidentID:         res.IncidentID(),
		SchadenplatzID:     res.SchadenplatzID(),
		Formation:          res.Formation(),
		Name:               res.Name(),
		Size:               res.Size(),
		PersonnelCount:     res.PersonnelCount(),
		Hauptaufgabe:       res.Hauptaufgabe(),
		Contact:            res.Contact(),
		HomeLocation:       res.HomeLocation(),
		DeploymentLocation: res.DeploymentLocation(),
		Status:             res.Status(),
		StatusAt:           res.StatusAt(),
		AlertedAt:          res.AlertedAt(),
		ReadyAt:            res.ReadyAt(),
		DeployedAt:         res.DeployedAt(),
		StoodDownAt:        res.StoodDownAt(),
		RelievedAt:         res.RelievedAt(),
		EinsatzBeginn:      res.EinsatzBeginn(),
		EinsatzEnde:        res.EinsatzEnde(),
		PredecessorID:      res.PredecessorID(),
		SuccessorID:        res.SuccessorID(),
		SourceMessageID:    res.SourceMessageID(),
	}
}
