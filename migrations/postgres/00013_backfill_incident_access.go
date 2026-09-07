package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
)

// backfillIncidentAccess initializes access streams for incidents imported
// before per-incident RBAC. It is safe to rerun after a partial migration.
func upBackfillIncidentAccess(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT ON (stream_id) stream_id, occurred_at
		FROM eventsourcing.events
		WHERE stream_type = 'Incident'
		ORDER BY stream_id, version`)
	if err != nil {
		return fmt.Errorf("access backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	type incidentStream struct {
		id         uuid.UUID
		occurredAt time.Time
	}

	var incidents []incidentStream

	for rows.Next() {
		var incident incidentStream
		if err := rows.Scan(&incident.id, &incident.occurredAt); err != nil {
			return fmt.Errorf("access backfill: scan incident: %w", err)
		}

		incidents = append(incidents, incident)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("access backfill: read incidents: %w", err)
	}

	for _, incident := range incidents {
		var exists bool
		if err := tx.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM eventsourcing.events
				WHERE stream_type = 'IncidentAccess' AND stream_id = $1
			)`, incident.id).Scan(&exists); err != nil {
			return fmt.Errorf("access backfill: check incident %s: %w", incident.id, err)
		}

		if exists {
			continue
		}

		owner, err := backfillIncidentOwner(ctx, tx, incident.id)
		if errors.Is(err, errBackfillOwnerNotFound) {
			err = nil
		}

		if err != nil {
			return err
		}

		if err := appendEvent(
			ctx,
			tx,
			"IncidentAccess",
			incident.id,
			1,
			"AccessInitialized",
			access.AccessInitialized{Mode: access.OpenOperational, OwnerSub: owner},
			map[string]any{"actor": "system:migration", "source": "access-backfill"},
			incident.occurredAt,
		); err != nil {
			return fmt.Errorf("access backfill: append incident %s: %w", incident.id, err)
		}

		if err := indexStream(ctx, tx, "IncidentAccess", incident.id, incident.id); err != nil {
			return fmt.Errorf("access backfill: index incident %s: %w", incident.id, err)
		}
	}

	return nil
}

func backfillIncidentOwner(ctx context.Context, tx *sql.Tx, incidentID uuid.UUID) (*string, error) {
	var owner string

	err := tx.QueryRowContext(ctx, `
		SELECT u.sub
		FROM eventsourcing.events e
		JOIN public.users u ON u.sub = e.metadata ->> 'actor'
		WHERE e.stream_type = 'Incident'
		  AND e.stream_id = $1
		  AND e.event_type = 'Opened'
		  AND e.metadata ->> 'actor' NOT LIKE 'system:%'
		  AND e.metadata ->> 'actor' <> 'local-user'
		ORDER BY e.version
		LIMIT 1`, incidentID).Scan(&owner)
	if err == nil {
		return &owner, nil
	}

	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("access backfill: find incident %s owner: %w", incidentID, err)
	}

	err = tx.QueryRowContext(ctx, `
		SELECT u.sub
		FROM eventsourcing.events e
		JOIN public.users u ON u.sub = e.data ->> 'authorSub'
		WHERE e.stream_type = 'Message'
		  AND e.event_type = 'Imported'
		  AND e.data ->> 'incidentId' = $1
		  AND e.data ->> 'authorSub' IS NOT NULL
		  AND e.data ->> 'authorSub' <> ''
		  AND e.data ->> 'authorSub' NOT LIKE 'system:%'
		  AND e.data ->> 'authorSub' <> 'local-user'
		GROUP BY u.sub
		ORDER BY count(*) DESC, u.sub
		LIMIT 1`, incidentID.String()).Scan(&owner)
	if err == sql.ErrNoRows {
		return nil, errBackfillOwnerNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("access backfill: find imported owner for incident %s: %w", incidentID, err)
	}

	return &owner, nil
}

var errBackfillOwnerNotFound = errors.New("access backfill: owner not found")

func downBackfillIncidentAccess(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.aggregate_index
		WHERE stream_type = 'IncidentAccess'
		  AND EXISTS (
			SELECT 1
			FROM eventsourcing.events e
			WHERE e.stream_type = 'IncidentAccess'
			  AND e.stream_id = aggregate_index.stream_id
			  AND e.metadata ->> 'source' = 'access-backfill'
		  )`); err != nil {
		return fmt.Errorf("access backfill: remove indexes: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events
		WHERE stream_type = 'IncidentAccess'
		  AND metadata ->> 'source' = 'access-backfill'`); err != nil {
		return fmt.Errorf("access backfill: remove events: %w", err)
	}

	return nil
}
