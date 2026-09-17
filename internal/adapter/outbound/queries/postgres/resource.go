package postgres

import (
	"context"
	"encoding/json/v2"
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
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
		       predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
		FROM readmodel.resource WHERE id = $1`, id)

	rm, err := scanPgResource(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, shared.ErrNotFound
	}

	return rm, err
}

func (q *Queries) ListResourcesForSchadenplatz(
	ctx context.Context,
	schadenplatzID uuid.UUID,
) ([]*outbound.ResourceRM, error) {
	return q.listResources(ctx, `WHERE schadenplatz_id = $1 AND status != 'ABGELOEST'`, schadenplatzID)
}

func (q *Queries) ListResourcesForIncident(ctx context.Context, incidentID uuid.UUID) ([]*outbound.ResourceRM, error) {
	if !q.canRead(ctx, incidentID) {
		return nil, shared.ErrNotFound
	}

	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
		       predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
		FROM readmodel.resource
		WHERE incident_id = $1
		   OR incident_id IN (
		       SELECT id FROM readmodel.incident WHERE parent_id = $1 AND is_deleted = false
		   )
		ORDER BY created_at ASC`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*outbound.ResourceRM{}

	for rows.Next() {
		rm, err := scanPgResource(rows)
		if err != nil {
			return nil, err
		}

		if q.canRead(ctx, rm.IncidentID) {
			out = append(out, rm)
		}
	}

	return out, rows.Err()
}

func (q *Queries) listResources(ctx context.Context, where string, arg uuid.UUID) ([]*outbound.ResourceRM, error) {
	rows, err := q.pool.Query(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
		       predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
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

func scanPgResource(s incidentScanner) (*outbound.ResourceRM, error) {
	var (
		rm                outbound.ResourceRM
		contactMedium     *string
		contactDetail     *string
		homeName          *string
		homeLat           *float64
		homeLng           *float64
		deployLat         *float64
		deployLng         *float64
		deployLabel       *string
		statusAt          time.Time
		alertedAt         time.Time
		readyAt           *time.Time
		deployedAt        *time.Time
		stoodDownAt       *time.Time
		relievedAt        *time.Time
		einsatzBeginn     *time.Time
		einsatzEnde       *time.Time
		deploymentHistory []byte
	)

	if err := s.Scan(
		&rm.ID, &rm.IncidentID, &rm.SchadenplatzID, &rm.Formation, &rm.Name, &rm.Size,
		&rm.PersonnelCount, &rm.Hauptaufgabe,
		&contactMedium, &contactDetail, &homeName, &homeLat, &homeLng,
		&deployLat, &deployLng, &deployLabel,
		&rm.Status, &statusAt, &alertedAt, &readyAt, &deployedAt, &stoodDownAt, &relievedAt,
		&einsatzBeginn, &einsatzEnde,
		&rm.PredecessorID, &rm.SuccessorID, &rm.SourceMessageID, &rm.CreatedAt, &rm.UpdatedAt,
		&deploymentHistory,
	); err != nil {
		return nil, err
	}

	rm.ContactMedium = contactMedium
	rm.ContactDetail = contactDetail
	rm.HomeLocationName = homeName
	rm.HomeLocationLat = homeLat
	rm.HomeLocationLng = homeLng
	rm.StatusAt = statusAt.UTC()
	rm.AlertedAt = alertedAt.UTC()
	rm.CreatedAt = rm.CreatedAt.UTC()
	rm.UpdatedAt = rm.UpdatedAt.UTC()
	rm.EinsatzBeginn = einsatzBeginn
	rm.EinsatzEnde = einsatzEnde
	if len(deploymentHistory) > 0 {
		var periods []struct {
			StartedAt        time.Time  `json:"startedAt"`
			EndedAt          *time.Time `json:"endedAt"`
			SchadenplatzID   uuid.UUID  `json:"schadenplatzId"`
			Formation        string     `json:"formation"`
			Name             string     `json:"name"`
			HomeLocationName *string    `json:"homeLocationName"`
			Hauptaufgabe     string     `json:"hauptaufgabe"`
			PersonnelCount   int        `json:"personnelCount"`
		}
		if err := json.Unmarshal(deploymentHistory, &periods); err != nil {
			return nil, err
		}
		for _, period := range periods {
			rm.DeploymentHistory = append(rm.DeploymentHistory, outbound.DeploymentPeriodRM{
				StartedAt: period.StartedAt, EndedAt: period.EndedAt, SchadenplatzID: period.SchadenplatzID,
				Formation: period.Formation, Name: period.Name, HomeLocationName: period.HomeLocationName,
				Hauptaufgabe: period.Hauptaufgabe, PersonnelCount: period.PersonnelCount,
			})
		}
	}

	if readyAt != nil {
		t := readyAt.UTC()
		rm.ReadyAt = &t
	}

	if deployedAt != nil {
		t := deployedAt.UTC()
		rm.DeployedAt = &t
	}

	if stoodDownAt != nil {
		t := stoodDownAt.UTC()
		rm.StoodDownAt = &t
	}

	if relievedAt != nil {
		t := relievedAt.UTC()
		rm.RelievedAt = &t
	}

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
			Lat:   deployLat,
			Lng:   deployLng,
			Label: label,
		}
	}

	return &rm, nil
}
