// Package service contains the application services that orchestrate commands
// across domain aggregates. Services own the transaction boundary and call the
// domain methods — they must not contain business logic.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// IncidentService handles all write-side operations for the Incident aggregate.
type IncidentService struct {
	tx             outbound.Transactor
	repo           outbound.IncidentRepository
	layers         outbound.LayerRepository
	schadenplaetze outbound.SchadenplatzRepository
	hierarchy      outbound.IncidentHierarchyGuard
	access         outbound.IncidentAccessChecker
	accessRepo     outbound.IncidentAccessRepository
	accessQueries  outbound.AccessQueries
	queries        outbound.Queries
	messages       outbound.MessageRepository
	clock          outbound.Clock
	ids            outbound.IDs
	notifier       outbound.EventNotifier
	tracer         trace.Tracer
}

func NewIncidentService(
	tx outbound.Transactor,
	repo outbound.IncidentRepository,
	layers outbound.LayerRepository,
	hierarchy outbound.IncidentHierarchyGuard,
	access outbound.IncidentAccessChecker,
	accessRepo outbound.IncidentAccessRepository,
	clock outbound.Clock,
	ids outbound.IDs,
	notifier outbound.EventNotifier,
) *IncidentService {
	return &IncidentService{
		tx:         tx,
		repo:       repo,
		layers:     layers,
		hierarchy:  hierarchy,
		access:     access,
		accessRepo: accessRepo,
		clock:      clock,
		ids:        ids,
		notifier:   notifier,
		tracer:     otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// WithSchadenplatzRepository injects the Schadenplatz repository so the service
// can auto-create the default Schadenplatz on incident open.
func (s *IncidentService) WithSchadenplatzRepository(repo outbound.SchadenplatzRepository) {
	s.schadenplaetze = repo
}

// WithMessageSource injects what is needed to review an incident's messages: the read model to
// find them and the repository to replay their history. Without it there is no review.
func (s *IncidentService) WithMessageSource(queries outbound.Queries, messages outbound.MessageRepository) {
	s.queries = queries
	s.messages = messages
}

// CreateIncident opens a new incident, creates its divisions, and creates the
// requested layers (defaulting to one). All writes are in a single transaction.
// The access mode defaults to the configured default-access template (Restricted
// if no template has been set up).
func (s *IncidentService) CreateIncident(
	ctx context.Context,
	name string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	layerNames []string,
	actor identity.Actor,
) (inbound.CreateIncidentResult, error) {
	return s.CreateIncidentWithParentMode(
		ctx,
		name,
		location,
		divisions,
		layerNames,
		nil,
		s.defaultTemplateMode(ctx),
		actor,
	)
}

func (s *IncidentService) CreateIncidentWithParent(
	ctx context.Context,
	name string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	layerNames []string,
	parentID *shared.IncidentID,
	actor identity.Actor,
) (inbound.CreateIncidentResult, error) {
	return s.CreateIncidentWithParentMode(
		ctx,
		name,
		location,
		divisions,
		layerNames,
		parentID,
		s.defaultTemplateMode(ctx),
		actor,
	)
}

// defaultTemplateMode returns the access mode from the default-access template.
// Falls back to OpenOperational when no template is configured or accessible.
func (s *IncidentService) defaultTemplateMode(ctx context.Context) access.IncidentMode {
	if s.accessQueries == nil {
		return access.OpenOperational
	}

	tmpl, err := s.accessQueries.GetDefaultAccessTemplate(ctx)
	if err != nil {
		return access.OpenOperational
	}

	return tmpl.Mode
}

func (s *IncidentService) CreateIncidentWithParentMode(
	ctx context.Context,
	name string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	layerNames []string,
	parentID *shared.IncidentID,
	mode access.IncidentMode,
	actor identity.Actor,
) (inbound.CreateIncidentResult, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.CreateIncident",
		trace.WithAttributes(attribute.String("incident.name", name)))
	defer span.End()

	parentAttr := slog.String("parent_id", "")
	if parentID != nil {
		parentAttr = slog.String("parent_id", parentID.String())
	}

	slog.DebugContext(ctx, "creating incident",
		slog.String("name", name), parentAttr, slog.String("actor", actor.Sub))

	// The message map layer is always created by the backend; clients that still
	// send the legacy "Nachrichtenkarte" layer name must not get a duplicate.
	layerNames = slices.DeleteFunc(slices.Clone(layerNames), func(n string) bool {
		return n == shared.MessageMapLayerName
	})
	if len(layerNames) == 0 {
		layerNames = []string{"Lage"}
	}

	incID := shared.IncidentID(s.ids.New())
	at := s.clock.Now()

	// Pre-generate division IDs so the service (not the domain) is responsible.
	// The message map division is added by incident.Open, which also rejects
	// client-supplied system divisions.
	divisions = slices.Clone(divisions)
	for i := range divisions {
		if divisions[i].ID == (shared.DivisionID{}) {
			divisions[i].ID = shared.DivisionID(s.ids.New())
		}
	}

	messageMapLayerID := shared.LayerID(s.ids.New())

	layerIDs := make([]shared.LayerID, len(layerNames))
	for i := range layerIDs {
		layerIDs[i] = shared.LayerID(s.ids.New())
	}

	// Captured from inside the transaction to build the result.
	var (
		accessMode   access.IncidentMode
		accessGrants []access.Grant
	)

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if parentID != nil {
			release, err := s.lockHierarchy(ctx)
			if err != nil {
				return err
			}
			defer release()

			if err := s.requireValidParent(ctx, incID, *parentID); err != nil {
				return err
			}
		}

		// 1. Create the Incident aggregate.
		inc := incident.New(incID)
		if err := inc.Open(name, location, divisions, at, actor.Sub); err != nil {
			return err
		}

		if parentID != nil {
			if err := inc.LinkParent(*parentID, actor.Sub, at); err != nil {
				return err
			}
		}

		if _, err := s.repo.Save(ctx, inc); err != nil {
			return err
		}

		if s.accessRepo != nil {
			accessAggregate := access.NewIncidentAccess(incID)
			if err := accessAggregate.Initialize(&actor.Sub, mode, actor.Sub, at); err != nil {
				return err
			}

			// Apply default-access template grants (e.g. open-to-all viewer grant).
			if s.accessQueries != nil {
				if tmpl, err := s.accessQueries.GetDefaultAccessTemplate(ctx); err == nil {
					for _, g := range tmpl.Grants {
						// GrantRole is idempotent and skips no-ops; ignore non-fatal errors
						// (e.g. trying to grant Owner to AllPrincipal).
						_ = accessAggregate.GrantRole(g.Principal, g.Role, actor.Sub, at)
					}
				}
			}

			if _, err := s.accessRepo.Save(ctx, accessAggregate); err != nil {
				return err
			}

			accessMode = accessAggregate.Mode()
			accessGrants = accessAggregate.Grants()
		} else {
			accessMode = mode
		}

		// 2. Auto-create the default Schadenplatz and link it to the incident.
		if s.schadenplaetze != nil {
			spID := shared.SchadenplatzID(s.ids.New())

			sp := schadenplatz.New(spID)
			if err := sp.Create(incID, "Allgemein", true, actor.Sub, at); err != nil {
				return fmt.Errorf("create default schadenplatz: %w", err)
			}

			if _, err := s.schadenplaetze.Save(ctx, sp); err != nil {
				return err
			}

			// Record the default Schadenplatz ID on the Incident so LoadDefault is O(1).
			if err := inc.LinkDefaultSchadenplatz(spID, actor.Sub, at); err != nil {
				return fmt.Errorf("link default schadenplatz: %w", err)
			}

			if _, err := s.repo.Save(ctx, inc); err != nil {
				return err
			}
		}

		// 3. Create the message map layer, then each requested Layer.
		mapLayer := layer.New(messageMapLayerID)
		if err := mapLayer.CreateWithKind(
			incID, shared.MessageMapLayerName, shared.LayerKindMessageMap, actor.Sub, at,
		); err != nil {
			return fmt.Errorf("create message map layer: %w", err)
		}

		if _, err := s.layers.Save(ctx, mapLayer); err != nil {
			return err
		}

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
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "CreateIncident", err, slog.String("name", name))

		return inbound.CreateIncidentResult{}, err
	}

	span.SetAttributes(attribute.String("incident.id", incID.String()))
	slog.DebugContext(ctx, "incident created",
		slog.String("incident_id", incID.String()), slog.Int("layers", len(layerIDs)))
	_ = s.notifier.Notify(ctx)

	return inbound.CreateIncidentResult{
		IncidentID:        incID,
		ParentID:          parentID,
		LayerIDs:          layerIDs,
		MessageMapLayerID: messageMapLayerID,
		Name:              name,
		Location:          location,
		Divisions:         append([]incident.DivisionData{messageMapDivisionData(incID)}, divisions...),
		CreatedAt:         at,
		AccessMode:        accessMode,
		AccessGrants:      accessGrants,
	}, nil
}

// UpdateIncident renames and/or changes the location and divisions.
func (s *IncidentService) UpdateIncident(
	ctx context.Context,
	id shared.IncidentID,
	name *string,
	location *incident.LocationData,
	divisions []incident.DivisionData,
	actor identity.Actor,
) (inbound.IncidentState, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.UpdateIncident",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "updating incident",
		slog.String("incident_id", id.String()), slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var state inbound.IncidentState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, id, access.IncidentWrite); err != nil {
			return err
		}

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
			if err := inc.ChangeLocation(location, actor.Sub, at); err != nil {
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

		if _, err = s.repo.Save(ctx, inc); err != nil {
			return err
		}

		state = incidentToState(inc, at)

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "UpdateIncident", err, slog.String("id", id.String()))

		return inbound.IncidentState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, nil
}

// CloseIncident closes the incident.
func (s *IncidentService) CloseIncident(
	ctx context.Context,
	id shared.IncidentID,
	actor identity.Actor,
) (inbound.IncidentState, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.CloseIncident",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "closing incident",
		slog.String("incident_id", id.String()), slog.String("actor", actor.Sub))

	state, err := s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		if err := requireIncidentAccess(ctx, s.access, actor, id, access.IncidentClose); err != nil {
			return err
		}

		at := s.clock.Now()
		if err := inc.Close(shared.ReasonManual, actor.Sub, at); err != nil {
			return err
		}

		s.recordReviewSummary(ctx, id, inc, actor.Sub, at)

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}

	return state, err
}

// recordReviewSummary keeps the headline of the incident's review with the incident, to compare it
// with other incidents. It is best effort: it only serves the comparison, so closing the incident
// must not fail for it. Without it the incident is left out of comparisons until the summary is
// worked out afterwards (BackfillReviewSummaries).
func (s *IncidentService) recordReviewSummary(
	ctx context.Context,
	id shared.IncidentID,
	inc *incident.Incident,
	actor string,
	at time.Time,
) {
	report, err := s.computeReview(ctx, id, inc)
	if err != nil {
		slog.WarnContext(ctx, "review summary not recorded: could not work out the review",
			slog.String("incident_id", id.String()), slog.String("error", err.Error()))

		return
	}

	if report == nil {
		return
	}

	if err := inc.RecordReviewSummary(kpi.Summarize(*report), actor, at); err != nil {
		slog.WarnContext(ctx, "review summary not recorded",
			slog.String("incident_id", id.String()), slog.String("error", err.Error()))
	}
}

// IncidentReview works out the review of the incident's messages as it is now: how fast they were
// triaged and drawn, how they were spread over the divisions, how much had to be done again and
// when the load was highest.
//
// The figures only depend on the messages' history, so for a closed incident, whose messages can
// no longer change, they are always the same, and for an open one they are an interim status.
// Nil for an incident that comes from the legacy import, whose message history is not known, and
// when the service has no message source. The caller has to have checked that the actor may read
// the incident.
func (s *IncidentService) IncidentReview(ctx context.Context, id shared.IncidentID) (*kpi.Report, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.IncidentReview",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	fail := func(err error) (*kpi.Report, error) {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return nil, err
	}

	inc, err := s.repo.Load(ctx, id)
	if err != nil {
		return fail(err)
	}

	report, err := s.computeReview(ctx, id, inc)
	if err != nil {
		return fail(err)
	}

	return report, nil
}

// computeReview works out the review of an incident's messages. Nil for an incident that comes from
// the legacy import and when the service has no message source.
//
//nolint:nilnil // no review is a normal outcome (imported incident), not an error
func (s *IncidentService) computeReview(
	ctx context.Context,
	id shared.IncidentID,
	inc *incident.Incident,
) (*kpi.Report, error) {
	if s.queries == nil || s.messages == nil || inc.IsImported() {
		return nil, nil
	}

	rows, err := s.queries.ListMessages(ctx, uuid.UUID(id))
	if err != nil {
		return nil, fmt.Errorf("review: list messages: %w", err)
	}

	ids := make([]shared.MessageID, len(rows))
	for i, row := range rows {
		ids[i] = shared.MessageID(row.ID)
	}

	messages, err := s.messages.LoadMany(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("review: load messages: %w", err)
	}

	divisions := make([]kpi.Division, 0, len(inc.Divisions()))
	for _, d := range inc.Divisions() {
		divisions = append(divisions, kpi.Division{ID: d.ID, Name: d.Name, Description: d.Description, Kind: d.Kind})
	}

	slices.SortFunc(divisions, func(a, b kpi.Division) int { return strings.Compare(a.Name, b.Name) })

	report := kpi.Compute(kpi.Input{
		OpenedAt:  inc.CreatedAt(),
		ClosedAt:  inc.ClosedAt(),
		Divisions: divisions,
		Messages:  messages,
	})

	return &report, nil
}

// CompareIncident sets an incident's review headline against the other incidents' the actor can
// read: the ones that were closed and kept theirs. `current` is the incident's own headline as
// it is now, so an open incident can be compared too. The caller has to have checked that the
// actor may read the incident.
func (s *IncidentService) CompareIncident(
	ctx context.Context,
	id shared.IncidentID,
	current kpi.Summary,
) (kpi.Comparison, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.CompareIncident",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	if s.queries == nil {
		return kpi.Compare(current, nil), nil
	}

	rows, err := s.queries.ListReviewSummaries(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return kpi.Comparison{}, fmt.Errorf("compare: list review summaries: %w", err)
	}

	peers := make([]kpi.Summary, 0, len(rows))

	for _, row := range rows {
		if row.IncidentID != uuid.UUID(id) {
			peers = append(peers, row.Summary)
		}
	}

	span.SetAttributes(attribute.Int("compare.peers", len(peers)))

	return kpi.Compare(current, peers), nil
}

// BackfillReviewSummaries works out and keeps the review headline of every closed incident that
// has none, those closed before it was kept, so they take part in comparisons. Incidents that come
// from the legacy import have no message history and are left out. It can be run again: incidents
// that have one are not touched. A failure with one incident does not stop the others.
func (s *IncidentService) BackfillReviewSummaries(
	ctx context.Context,
	actor string,
) (inbound.BackfillResult, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.BackfillReviewSummaries")
	defer span.End()

	var result inbound.BackfillResult

	if s.queries == nil || s.messages == nil {
		err := errors.New("review backfill: no message source")
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return result, err
	}

	ids, err := s.queries.ListClosedIncidentsWithoutReviewSummary(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())

		return result, fmt.Errorf("review backfill: list incidents: %w", err)
	}

	for _, raw := range ids {
		id := shared.IncidentID(raw)

		recorded, err := s.backfillReviewSummary(ctx, id, actor)

		switch {
		case err != nil:
			result.Failed++

			slog.WarnContext(ctx, "review summary not backfilled",
				slog.String("incident_id", id.String()), slog.String("error", err.Error()))
		case recorded:
			result.Recorded++
		default:
			result.Skipped++
		}
	}

	span.SetAttributes(
		attribute.Int("backfill.recorded", result.Recorded),
		attribute.Int("backfill.skipped", result.Skipped),
		attribute.Int("backfill.failed", result.Failed),
	)

	return result, nil
}

// backfillReviewSummary keeps the review headline of one closed incident. It reports false for an
// incident there is nothing to keep for.
func (s *IncidentService) backfillReviewSummary(
	ctx context.Context,
	id shared.IncidentID,
	actor string,
) (bool, error) {
	inc, err := s.repo.Load(ctx, id)
	if err != nil {
		return false, err
	}

	report, err := s.computeReview(ctx, id, inc)
	if err != nil || report == nil {
		return false, err
	}

	summary := kpi.Summarize(*report)

	_, err = s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		return inc.RecordReviewSummary(summary, actor, s.clock.Now())
	})

	return err == nil, err
}

// ReopenIncident reopens a closed incident.
func (s *IncidentService) ReopenIncident(
	ctx context.Context,
	id shared.IncidentID,
	actor identity.Actor,
) (inbound.IncidentState, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.ReopenIncident",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "reopening incident",
		slog.String("incident_id", id.String()), slog.String("actor", actor.Sub))

	state, err := s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		if err := requireIncidentAccess(ctx, s.access, actor, id, access.IncidentReopen); err != nil {
			return err
		}

		return inc.Reopen(actor.Sub, s.clock.Now())
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}

	return state, err
}

// DeleteIncident deletes a closed incident.
func (s *IncidentService) DeleteIncident(ctx context.Context, id shared.IncidentID, actor identity.Actor) error {
	ctx, span := s.tracer.Start(ctx, "IncidentService.DeleteIncident",
		trace.WithAttributes(attribute.String("incident.id", id.String())))
	defer span.End()

	slog.DebugContext(ctx, "deleting incident",
		slog.String("incident_id", id.String()), slog.String("actor", actor.Sub))

	_, err := s.writeIncident(ctx, id, func(inc *incident.Incident) error {
		if err := requireIncidentAccess(ctx, s.access, actor, id, access.IncidentDelete); err != nil {
			return err
		}

		return inc.Delete(shared.DeleteReasonManual, actor.Sub, s.clock.Now())
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}

	return err
}

func (s *IncidentService) LinkIncidentParent(
	ctx context.Context,
	childID, parentID shared.IncidentID,
	actor identity.Actor,
) (inbound.IncidentState, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.LinkIncidentParent",
		trace.WithAttributes(
			attribute.String("incident.child_id", childID.String()),
			attribute.String("incident.parent_id", parentID.String()),
		))
	defer span.End()

	slog.DebugContext(ctx, "linking incident parent",
		slog.String("child_id", childID.String()),
		slog.String("parent_id", parentID.String()),
		slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var state inbound.IncidentState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, childID, access.IncidentLinkParent); err != nil {
			return err
		}

		release, err := s.lockHierarchy(ctx)
		if err != nil {
			return err
		}
		defer release()

		child, err := s.repo.Load(ctx, childID)
		if err != nil {
			return err
		}

		if err := s.requireValidParent(ctx, childID, parentID); err != nil {
			return err
		}

		if err := child.LinkParent(parentID, actor.Sub, at); err != nil {
			return err
		}

		if _, err = s.repo.Save(ctx, child); err != nil {
			return err
		}

		state = incidentToState(child, at)

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "LinkIncidentParent", err,
			slog.String("child_id", childID.String()), slog.String("parent_id", parentID.String()))

		return inbound.IncidentState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, nil
}

func (s *IncidentService) UnlinkIncidentParent(
	ctx context.Context,
	childID shared.IncidentID,
	actor identity.Actor,
) (inbound.IncidentState, error) {
	ctx, span := s.tracer.Start(ctx, "IncidentService.UnlinkIncidentParent",
		trace.WithAttributes(attribute.String("incident.child_id", childID.String())))
	defer span.End()

	slog.DebugContext(ctx, "unlinking incident parent",
		slog.String("child_id", childID.String()), slog.String("actor", actor.Sub))

	at := s.clock.Now()

	var state inbound.IncidentState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := requireIncidentAccess(ctx, s.access, actor, childID, access.IncidentUnlinkParent); err != nil {
			return err
		}

		release, err := s.lockHierarchy(ctx)
		if err != nil {
			return err
		}
		defer release()

		inc, err := s.repo.Load(ctx, childID)
		if err != nil {
			return err
		}

		if err := inc.UnlinkParent(actor.Sub, at); err != nil {
			return err
		}

		if _, err = s.repo.Save(ctx, inc); err != nil {
			return err
		}

		state = incidentToState(inc, at)

		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "UnlinkIncidentParent", err, slog.String("child_id", childID.String()))

		return inbound.IncidentState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, err
}

func (s *IncidentService) requireAcyclicParent(ctx context.Context, childID, parentID shared.IncidentID) error {
	if childID == parentID {
		return shared.ValidationError{Field: "parentId", Message: "must not reference the incident itself"}
	}

	seen := map[shared.IncidentID]struct{}{childID: {}}
	currentID := parentID

	for {
		if _, ok := seen[currentID]; ok {
			return shared.ErrConflict
		}

		seen[currentID] = struct{}{}

		current, err := s.repo.Load(ctx, currentID)
		if err != nil {
			return err
		}

		if current.ParentID() == nil {
			return nil
		}

		currentID = *current.ParentID()
	}
}

func (s *IncidentService) writeIncident(
	ctx context.Context,
	id shared.IncidentID,
	fn func(*incident.Incident) error,
) (inbound.IncidentState, error) {
	at := s.clock.Now()

	var state inbound.IncidentState

	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.repo.Load(ctx, id)
		if err != nil {
			return err
		}

		if err := fn(inc); err != nil {
			return err
		}

		if _, err = s.repo.Save(ctx, inc); err != nil {
			return err
		}

		state = incidentToState(inc, at)

		return nil
	})
	if err != nil {
		logIfUnexpected(ctx, "writeIncident", err, slog.String("id", id.String()))
		return inbound.IncidentState{}, err
	}

	_ = s.notifier.Notify(ctx)

	return state, nil
}

func (s *IncidentService) requireValidParent(ctx context.Context, childID, parentID shared.IncidentID) error {
	hasChildren, err := s.hierarchy.HasChildren(ctx, childID)
	if err != nil {
		return err
	}

	if hasChildren {
		return shared.ErrInvalidParent
	}

	parent, err := s.repo.Load(ctx, parentID)
	if err != nil {
		return err
	}

	if parent.IsDeleted() {
		return shared.ErrIncidentDeleted
	}

	if parent.ParentID() != nil {
		return shared.ErrInvalidParent
	}

	return s.requireAcyclicParent(ctx, childID, parentID)
}

func (s *IncidentService) lockHierarchy(ctx context.Context) (func(), error) {
	if s.hierarchy == nil {
		return func() {}, nil
	}

	return s.hierarchy.LockForUpdate(ctx)
}

// LoadIncident returns the incident aggregate (for queries that need aggregate state).
func (s *IncidentService) LoadIncident(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	idVal, err := uuid.Parse(id.String())
	if err != nil {
		return nil, shared.ErrNotFound
	}

	return s.repo.Load(ctx, shared.IncidentID(idVal))
}

// incidentToState builds an IncidentState DTO from the aggregate after a write,
// using updatedAt as the mutation timestamp (the aggregate does not track this separately).
func incidentToState(inc *incident.Incident, updatedAt time.Time) inbound.IncidentState {
	state := inbound.IncidentState{
		ID:        shared.IncidentID(inc.Root().ID()),
		ParentID:  inc.ParentID(),
		Name:      inc.Name(),
		CreatedAt: inc.CreatedAt(),
		UpdatedAt: updatedAt,
		IsClosed:  inc.IsClosed(),
		ClosedAt:  inc.ClosedAt(),
	}
	if l := inc.Location(); l != nil {
		state.Location = &incident.LocationData{Name: l.Name, Coordinates: l.Coordinates}
	}

	for _, d := range inc.Divisions() {
		state.Divisions = append(state.Divisions, incident.DivisionData(d))
	}

	return state
}

func messageMapDivisionData(incID shared.IncidentID) incident.DivisionData {
	return incident.DivisionData{
		ID:          incident.MessageMapDivisionID(incID),
		Name:        shared.MessageMapDivisionName,
		Description: shared.MessageMapDivisionDescription,
		Kind:        shared.DivisionKindMessageMap,
	}
}
