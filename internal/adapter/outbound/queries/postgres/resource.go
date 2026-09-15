package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func (q *Queries) GetResource(ctx context.Context, id uuid.UUID) (*outbound.ResourceRM, error) {
	row := q.pool.QueryRow(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, einsatz_beginn, einsatz_ende,
		       predecessor_id, successor_id, source_message_id, created_at, updated_at
		FROM readmodel.resource WHERE id = $1`, id)

	rm, err := scanPgResource(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}

	return rm, err
}

func (q *Queries) ListResourcesForSchadenplatz(ctx context.Context, schadenplatzID uuid.UUID) ([]*outbound.ResourceRM, error) {
	return q.listResources(ctx, `WHERE schadenplatz_id = $1 AND status != 'ABGELOEST'`, schadenplatzID)
}

func (q *Queries) ListResourcesForIncident(ctx context.Context, incidentID uuid.UUID) ([]*outbound.ResourceRM, error) {
	return q.listResources(ctx, `WHERE incident_id = $1`, incidentID)
}

func (q *Queries) listResources(ctx context.Context, where string, arg uuid.UUID) ([]*outbound.ResourceRM, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, einsatz_beginn, einsatz_ende,
		       predecessor_id, successor_id, source_message_id, created_at, updated_at
		FROM readmodel.resource `+where+` ORDER BY created_at ASC`, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*outbound.ResourceRM

	for rows.Next() {
		rm, err := scanPgResource(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, rm)
	}

	return out, rows.Err()
}

func scanPgResource(s pgScanner) (*outbound.ResourceRM, error) {
	var (
		rm              outbound.ResourceRM
		contactMedium   *string
		contactDetail   *string
		homeName        *string
		homeLat         *float64
		homeLng         *float64
		deployLat       *float64
		deployLng       *float64
		deployLabel     *string
		statusAt        time.Time
		einsatzBeginn   *time.Time
		einsatzEnde     *time.Time
	)

	if err := s.Scan(
		&rm.ID, &rm.IncidentID, &rm.SchadenplatzID, &rm.Formation, &rm.Name, &rm.Size,
		&rm.PersonnelCount, &rm.Hauptaufgabe,
		&contactMedium, &contactDetail, &homeName, &homeLat, &homeLng,
		&deployLat, &deployLng, &deployLabel,
		&rm.Status, &statusAt, &einsatzBeginn, &einsatzEnde,
		&rm.PredecessorID, &rm.SuccessorID, &rm.SourceMessageID, &rm.CreatedAt, &rm.UpdatedAt,
	); err != nil {
		return nil, err
	}

	rm.ContactMedium = contactMedium
	rm.ContactDetail = contactDetail
	rm.HomeLocationName = homeName
	rm.HomeLocationLat = homeLat
	rm.HomeLocationLng = homeLng
	rm.StatusAt = statusAt.UTC()
	rm.CreatedAt = rm.CreatedAt.UTC()
	rm.UpdatedAt = rm.UpdatedAt.UTC()
	rm.EinsatzBeginn = einsatzBeginn
	rm.EinsatzEnde = einsatzEnde

	if einsatzBeginn != nil {
		t := einsatzBeginn.UTC()
		rm.EinsatzBeginn = &t
	}

	if einsatzEnde != nil {
		t := einsatzEnde.UTC()
		rm.EinsatzEnde = &t
	}

	if deployLat != nil && deployLng != nil {
		label := ""
		if deployLabel != nil {
			label = *deployLabel
		}
		rm.DeploymentLocation = &outbound.DeploymentLocationRM{
			Lat:   *deployLat,
			Lng:   *deployLng,
			Label: label,
		}
	}

	return &rm, nil
}
