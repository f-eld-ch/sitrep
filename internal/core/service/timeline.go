package service

import (
	"context"
	"slices"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// TimelineService answers "what did this look like at time T?" by replaying aggregates.
//
// The read models only keep the current state (a re-alerted resource loses its earlier
// timestamps, personnel counts and assignments are overwritten), so the past can only be
// recovered from the events. Commands may be backdated to the time of the message they come
// from, so events are replayed in order of when they took effect (occurred_at), not when they
// were recorded.
//
// Which streams to replay comes from the read models; the stream content comes from the event
// store. Neither checks who is asking: the caller has to have established that the actor may
// read the incident (the Incident resolver does).
type TimelineService struct {
	events  outbound.EventStore
	queries outbound.Queries
	tracer  trace.Tracer
}

func NewTimelineService(events outbound.EventStore, queries outbound.Queries) *TimelineService {
	return &TimelineService{
		events:  events,
		queries: queries,
		tracer:  otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// ResourcesAsOf returns the resources of an incident and its direct children as they were at
// asOf, relieved ones included. Resources that did not exist yet are left out.
func (s *TimelineService) ResourcesAsOf(
	ctx context.Context,
	incidentID shared.IncidentID,
	asOf time.Time,
) ([]inbound.ResourceState, error) {
	ctx, span := s.tracer.Start(ctx, "TimelineService.ResourcesAsOf",
		trace.WithAttributes(attribute.String("incident.id", incidentID.String())))
	defer span.End()

	rows, err := s.queries.ListResourcesForIncident(ctx, uuid.UUID(incidentID))
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return nil, err
	}

	out := make([]inbound.ResourceState, 0, len(rows))

	for _, row := range rows {
		res := resource.New(shared.ResourceID(row.ID))

		existed, err := s.replayAsOf(ctx, res, row.ID, asOf, nil)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())

			return nil, err
		}

		if existed {
			out = append(out, stateFromResource(res))
		}
	}

	return out, nil
}

// SchadenplaetzeAsOf returns the Schadenplätze of an incident as they were at asOf, with the
// casualty totals recorded up to then. A Schadenplatz merged into the default one later still
// counts as a separate one here; one merged by asOf is flagged as merged.
func (s *TimelineService) SchadenplaetzeAsOf(
	ctx context.Context,
	incidentID shared.IncidentID,
	asOf time.Time,
) ([]inbound.SchadenplatzState, error) {
	ctx, span := s.tracer.Start(ctx, "TimelineService.SchadenplaetzeAsOf",
		trace.WithAttributes(attribute.String("incident.id", incidentID.String())))
	defer span.End()

	rows, err := s.queries.ListAllSchadenplaetze(ctx, uuid.UUID(incidentID))
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return nil, err
	}

	out := make([]inbound.SchadenplatzState, 0, len(rows))

	for _, row := range rows {
		sp := schadenplatz.New(shared.SchadenplatzID(row.ID))

		// A Schadenplatz exists from the incident's start however late its record was made, while
		// its casualties are stamped with the (earlier) message times: pin its creation, so an
		// early casualty never ends up on a Schadenplatz without a name.
		existed, err := s.replayAsOf(ctx, sp, row.ID, asOf, func(e eventsourcing.Event) bool {
			return e.EventType == "Created"
		})
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())

			return nil, err
		}

		if existed {
			out = append(out, stateFromSchadenplatz(sp))
		}
	}

	// Same order as the read model: the default Schadenplatz first, then by name.
	slices.SortStableFunc(out, func(a, b inbound.SchadenplatzState) int {
		if a.IsDefault != b.IsDefault {
			if a.IsDefault {
				return -1
			}

			return 1
		}

		switch {
		case a.Name < b.Name:
			return -1
		case a.Name > b.Name:
			return 1
		}

		return 0
	})

	return out, nil
}

// replayAsOf rebuilds the aggregate from the events that had taken effect by asOf, in order of
// when they took effect. Events for which pinned reports true are applied regardless of time,
// before the others. It reports whether the aggregate existed at all by then, that is whether
// any event took effect.
func (s *TimelineService) replayAsOf(
	ctx context.Context,
	agg eventsourcing.Aggregate,
	id uuid.UUID,
	asOf time.Time,
	pinned func(eventsourcing.Event) bool,
) (bool, error) {
	events, err := s.events.Load(ctx, agg.AggregateType(), id)
	if err != nil {
		return false, err
	}

	var pinnedEvents, effective []eventsourcing.Event

	tookEffect := false

	for _, e := range events {
		if !e.OccurredAt.After(asOf) {
			tookEffect = true
		}

		switch {
		case pinned != nil && pinned(e):
			pinnedEvents = append(pinnedEvents, e)
		case !e.OccurredAt.After(asOf):
			effective = append(effective, e)
		}
	}

	if !tookEffect {
		return false, nil
	}

	slices.SortStableFunc(effective, func(a, b eventsourcing.Event) int {
		if c := a.OccurredAt.Compare(b.OccurredAt); c != 0 {
			return c
		}

		return a.Version - b.Version
	})

	ordered := slices.Concat(pinnedEvents, effective)

	for _, e := range ordered {
		if err := eventsourcing.Apply(agg, e); err != nil {
			return false, err
		}
	}

	return true, nil
}
