package service

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

const (
	retentionBatchSize          = 100
	manuallyDeletedArchiveAfter = 7 * 24 * time.Hour
)

// RetentionResult reports completed retention work. Archived indicates that
// read models need rebuilding because live event streams were removed.
type RetentionResult struct {
	Closed   int
	Archived int
}

// RetentionService applies automatic incident lifecycle retention.
type RetentionService struct {
	tx        outbound.Transactor
	incidents outbound.IncidentRepository
	retention outbound.IncidentRetention
	clock     outbound.Clock
	notifier  outbound.EventNotifier
	batchSize int
	tracer    trace.Tracer
}

func NewRetentionService(
	tx outbound.Transactor,
	incidents outbound.IncidentRepository,
	retention outbound.IncidentRetention,
	clock outbound.Clock,
	notifier outbound.EventNotifier,
) *RetentionService {
	return &RetentionService{
		tx: tx, incidents: incidents, retention: retention, clock: clock, notifier: notifier,
		batchSize: retentionBatchSize,
		tracer:    otel.Tracer("github.com/f-eld-ch/sitrep/service"),
	}
}

// Run applies enabled retention policies. A zero day count disables its policy.
func (s *RetentionService) Run(ctx context.Context, autoCloseDays, autoArchiveDays uint) (RetentionResult, error) {
	ctx, span := s.tracer.Start(ctx, "RetentionService.Run",
		trace.WithAttributes(
			attribute.Int("retention.auto_close_days", int(autoCloseDays)),
			attribute.Int("retention.auto_archive_days", int(autoArchiveDays)),
		))
	defer span.End()
	result := RetentionResult{}
	now := s.clock.Now()
	slog.DebugContext(ctx, "running incident retention",
		"auto_close_days", autoCloseDays, "auto_archive_days", autoArchiveDays)

	if autoCloseDays > 0 {
		cutoff := now.AddDate(0, 0, -int(autoCloseDays))
		ids, err := s.retention.OpenBefore(ctx, cutoff, s.batchSize)
		if err != nil {
			logIfUnexpected(ctx, "Retention.OpenBefore", err, "cutoff", cutoff)
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return result, err
		}
		slog.InfoContext(ctx, "incident retention auto-close candidates",
			"count", len(ids), "cutoff", cutoff, "batch_size", s.batchSize)
		for _, id := range ids {
			closed, err := s.close(ctx, id, now)
			if err != nil {
				logIfUnexpected(ctx, "Retention.Close", err, "incident_id", id)
				span.RecordError(err)
				span.SetStatus(codes.Error, err.Error())
				return result, err
			}
			if closed {
				result.Closed++
				slog.InfoContext(ctx, "incident automatically closed", "incident_id", id)
			}
		}
	} else {
		slog.InfoContext(ctx, "incident retention auto-close disabled")
	}

	if autoArchiveDays > 0 {
		closedCutoff := now.AddDate(0, 0, -int(autoArchiveDays))
		deletedCutoff := now.Add(-manuallyDeletedArchiveAfter)
		ids, err := s.retention.ArchiveBefore(ctx, closedCutoff, deletedCutoff, s.batchSize)
		if err != nil {
			logIfUnexpected(ctx, "Retention.ArchiveBefore", err,
				"closed_cutoff", closedCutoff, "deleted_cutoff", deletedCutoff)
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return result, err
		}
		slog.InfoContext(ctx, "incident retention archive candidates",
			"count", len(ids), "closed_cutoff", closedCutoff,
			"deleted_cutoff", deletedCutoff, "batch_size", s.batchSize)
		for _, id := range ids {
			archived, err := s.archive(ctx, id, now)
			if err != nil {
				logIfUnexpected(ctx, "Retention.Archive", err, "incident_id", id)
				span.RecordError(err)
				span.SetStatus(codes.Error, err.Error())
				return result, err
			}
			if archived {
				result.Archived++
				slog.InfoContext(ctx, "incident event streams archived", "incident_id", id)
			}
		}
	} else {
		slog.InfoContext(ctx, "incident retention archive disabled")
	}

	if result.Closed > 0 || result.Archived > 0 {
		if err := s.notifier.Notify(ctx); err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
			return result, err
		}
	}
	span.SetAttributes(attribute.Int("retention.closed", result.Closed), attribute.Int("retention.archived", result.Archived))
	slog.InfoContext(ctx, "incident retention complete", "closed", result.Closed, "archived", result.Archived)
	return result, nil
}

func (s *RetentionService) close(ctx context.Context, id shared.IncidentID, at time.Time) (bool, error) {
	closed := false
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.incidents.Load(ctx, id)
		if err != nil {
			return err
		}
		if !inc.IsOpen() {
			return nil
		}
		if err := inc.Close(shared.ReasonAutoTimeout, "retention", at); err != nil {
			return err
		}
		_, err = s.incidents.Save(ctx, inc)
		closed = err == nil
		return err
	})
	return closed, err
}

func (s *RetentionService) archive(ctx context.Context, id shared.IncidentID, at time.Time) (bool, error) {
	archived := false
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		inc, err := s.incidents.Load(ctx, id)
		if err != nil {
			return err
		}
		if !inc.IsClosed() && !inc.IsDeleted() {
			return nil
		}
		if inc.IsClosed() {
			if err := inc.Delete(shared.DeleteReasonPurge, "retention", at); err != nil {
				return err
			}
			if _, err := s.incidents.Save(ctx, inc); err != nil {
				return err
			}
		}
		if err := s.retention.Archive(ctx, id, at); err != nil {
			return err
		}
		archived = true
		return nil
	})
	return archived, err
}
