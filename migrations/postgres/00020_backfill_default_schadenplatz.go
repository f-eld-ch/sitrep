package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// upBackfillDefaultSchadenplatz creates a default Schadenplatz ("Allgemein") for every
// incident that does not yet have one. It is safe to rerun; already-backfilled incidents
// are skipped.
func upBackfillDefaultSchadenplatz(ctx context.Context, tx *sql.Tx) error {
	// Find incidents without a DefaultSchadenplatzLinked event.
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT ON (e.stream_id) e.stream_id, e.occurred_at
		FROM eventsourcing.events e
		WHERE e.stream_type = 'Incident'
		  AND NOT EXISTS (
			  SELECT 1 FROM eventsourcing.events x
			  WHERE x.stream_type = 'Incident'
			    AND x.stream_id   = e.stream_id
			    AND x.event_type  = 'DefaultSchadenplatzLinked'
		  )
		ORDER BY e.stream_id, e.version`)
	if err != nil {
		return fmt.Errorf("schadenplatz backfill: list incidents: %w", err)
	}
	defer func() { _ = rows.Close() }()

	type incidentRow struct {
		id         uuid.UUID
		occurredAt time.Time
	}

	var incidents []incidentRow

	for rows.Next() {
		var r incidentRow
		if err := rows.Scan(&r.id, &r.occurredAt); err != nil {
			return fmt.Errorf("schadenplatz backfill: scan incident: %w", err)
		}

		incidents = append(incidents, r)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("schadenplatz backfill: read incidents: %w", err)
	}

	meta := map[string]any{"actor": "system:migration", "source": "schadenplatz-backfill"}

	for _, inc := range incidents {
		spID := shared.SchadenplatzID(uuid.New())

		// 1. Write the Schadenplatz Created event.
		if err := appendEvent(ctx, tx, "Schadenplatz", uuid.UUID(spID), 1, "Created",
			schadenplatz.Created{
				IncidentID: shared.IncidentID(inc.id),
				Name:       "Allgemein",
				IsDefault:  true,
			}, meta, inc.occurredAt); err != nil {
			return fmt.Errorf("schadenplatz backfill: create schadenplatz for incident %s: %w", inc.id, err)
		}

		// 2. Index the new Schadenplatz stream under the incident.
		if err := indexStream(ctx, tx, "Schadenplatz", uuid.UUID(spID), inc.id); err != nil {
			return fmt.Errorf("schadenplatz backfill: index schadenplatz for incident %s: %w", inc.id, err)
		}

		// 3. Find the current max version on the Incident stream.
		var maxVersion int
		if err := tx.QueryRowContext(ctx, `
			SELECT MAX(version) FROM eventsourcing.events
			WHERE stream_type = 'Incident' AND stream_id = $1`, inc.id).Scan(&maxVersion); err != nil {
			return fmt.Errorf("schadenplatz backfill: max version for incident %s: %w", inc.id, err)
		}

		// 4. Append DefaultSchadenplatzLinked to the Incident stream.
		if err := appendEvent(ctx, tx, "Incident", inc.id, maxVersion+1, "DefaultSchadenplatzLinked",
			incident.DefaultSchadenplatzLinked{SchadenplatzID: spID},
			meta, inc.occurredAt); err != nil {
			return fmt.Errorf("schadenplatz backfill: link schadenplatz for incident %s: %w", inc.id, err)
		}
	}

	return nil
}

func downBackfillDefaultSchadenplatz(ctx context.Context, tx *sql.Tx) error {
	// Remove DefaultSchadenplatzLinked events written by this migration.
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events
		WHERE stream_type = 'Incident'
		  AND event_type  = 'DefaultSchadenplatzLinked'
		  AND metadata ->> 'source' = 'schadenplatz-backfill'`); err != nil {
		return fmt.Errorf("schadenplatz backfill: remove incident events: %w", err)
	}

	// Remove aggregate_index entries for Schadenplatz streams written by this migration.
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.aggregate_index ai
		WHERE ai.stream_type = 'Schadenplatz'
		  AND EXISTS (
			  SELECT 1 FROM eventsourcing.events e
			  WHERE e.stream_type = 'Schadenplatz'
			    AND e.stream_id   = ai.stream_id
			    AND e.metadata ->> 'source' = 'schadenplatz-backfill'
		  )`); err != nil {
		return fmt.Errorf("schadenplatz backfill: remove indexes: %w", err)
	}

	// Remove Schadenplatz events written by this migration.
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM eventsourcing.events
		WHERE stream_type = 'Schadenplatz'
		  AND metadata ->> 'source' = 'schadenplatz-backfill'`); err != nil {
		return fmt.Errorf("schadenplatz backfill: remove schadenplatz events: %w", err)
	}

	return nil
}
