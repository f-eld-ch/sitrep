package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	sqliteh "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func (q *Queries) GetResource(ctx context.Context, id uuid.UUID) (*outbound.ResourceRM, error) {
	row := q.db.QueryRowContext(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
			predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
		FROM readmodel_resource WHERE id = ?`, id.String())

	rm, err := scanSQLiteResource(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, shared.ErrNotFound
	}

	return rm, err
}

func (q *Queries) ListResourcesForSchadenplatz(
	ctx context.Context,
	schadenplatzID uuid.UUID,
) ([]*outbound.ResourceRM, error) {
	return q.listResources(
		ctx,
		`SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
			predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
		FROM readmodel_resource WHERE schadenplatz_id = ? AND status != 'ABGELOEST' ORDER BY created_at ASC`,
		schadenplatzID.String(),
	)
}

func (q *Queries) ListResourcesForIncident(ctx context.Context, incidentID uuid.UUID) ([]*outbound.ResourceRM, error) {
	if !q.canRead(ctx, incidentID) {
		return nil, shared.ErrNotFound
	}

	rows, err := q.db.QueryContext(ctx, `
		SELECT id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
		       contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
		       deployment_lat, deployment_lng, deployment_label,
		       status, status_at, alerted_at, ready_at, deployed_at, stood_down_at, relieved_at,
		       einsatz_beginn, einsatz_ende,
			predecessor_id, successor_id, source_message_id, created_at, updated_at, deployment_history
		FROM readmodel_resource
		WHERE incident_id = ?
		   OR incident_id IN (
		       SELECT id FROM readmodel_incident WHERE parent_id = ? AND is_deleted = 0
		   )
		ORDER BY created_at ASC`, incidentID.String(), incidentID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	out := []*outbound.ResourceRM{}

	for rows.Next() {
		rm, err := scanSQLiteResource(rows)
		if err != nil {
			return nil, err
		}

		if q.canRead(ctx, rm.IncidentID) {
			out = append(out, rm)
		}
	}

	return out, rows.Err()
}

func (q *Queries) listResources(ctx context.Context, query string, arg string) ([]*outbound.ResourceRM, error) {
	rows, err := q.db.QueryContext(ctx, query, arg)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []*outbound.ResourceRM

	for rows.Next() {
		rm, err := scanSQLiteResource(rows)
		if err != nil {
			return nil, err
		}

		out = append(out, rm)
	}

	return out, rows.Err()
}

func scanSQLiteResource(s incidentScanner) (*outbound.ResourceRM, error) {
	var (
		idStr              string
		incidentIDStr      string
		schadenplatzIDStr  string
		contactMedium      sql.NullString
		contactDetail      sql.NullString
		homeName           sql.NullString
		homeLat            sql.NullFloat64
		homeLng            sql.NullFloat64
		deployLat          sql.NullFloat64
		deployLng          sql.NullFloat64
		deployLabel        sql.NullString
		statusAt           sqliteh.Time
		alertedAt          sqliteh.Time
		readyAt            sqliteh.NullTime
		deployedAt         sqliteh.NullTime
		stoodDownAt        sqliteh.NullTime
		relievedAt         sqliteh.NullTime
		einsatzBeginn      sqliteh.NullTime
		einsatzEnde        sqliteh.NullTime
		predecessorIDStr   sql.NullString
		successorIDStr     sql.NullString
		sourceMessageIDStr sql.NullString
		createdAt          sqliteh.Time
		updatedAt          sqliteh.Time
		deploymentHistory  string
		rm                 outbound.ResourceRM
	)

	if err := s.Scan(
		&idStr, &incidentIDStr, &schadenplatzIDStr, &rm.Formation, &rm.Name, &rm.Size,
		&rm.PersonnelCount, &rm.Hauptaufgabe,
		&contactMedium, &contactDetail, &homeName, &homeLat, &homeLng,
		&deployLat, &deployLng, &deployLabel,
		&rm.Status, &statusAt, &alertedAt, &readyAt, &deployedAt, &stoodDownAt, &relievedAt,
		&einsatzBeginn, &einsatzEnde,
		&predecessorIDStr, &successorIDStr, &sourceMessageIDStr, &createdAt, &updatedAt,
		&deploymentHistory,
	); err != nil {
		return nil, err
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		return nil, err
	}

	incidentID, err := uuid.Parse(incidentIDStr)
	if err != nil {
		return nil, err
	}

	schadenplatzID, err := uuid.Parse(schadenplatzIDStr)
	if err != nil {
		return nil, err
	}

	rm.ID = id
	rm.IncidentID = incidentID
	rm.SchadenplatzID = schadenplatzID
	rm.StatusAt = statusAt.V
	rm.AlertedAt = alertedAt.V
	rm.CreatedAt = createdAt.V
	rm.UpdatedAt = updatedAt.V

	if readyAt.V != nil {
		rm.ReadyAt = readyAt.V
	}

	if deployedAt.V != nil {
		rm.DeployedAt = deployedAt.V
	}

	if stoodDownAt.V != nil {
		rm.StoodDownAt = stoodDownAt.V
	}

	if relievedAt.V != nil {
		rm.RelievedAt = relievedAt.V
	}

	if contactMedium.Valid {
		rm.ContactMedium = &contactMedium.String
	}

	if contactDetail.Valid {
		rm.ContactDetail = &contactDetail.String
	}

	if homeName.Valid {
		rm.HomeLocationName = &homeName.String
	}

	if homeLat.Valid {
		rm.HomeLocationLat = &homeLat.Float64
	}

	if homeLng.Valid {
		rm.HomeLocationLng = &homeLng.Float64
	}

	if einsatzBeginn.V != nil {
		rm.EinsatzBeginn = einsatzBeginn.V
	}

	if einsatzEnde.V != nil {
		rm.EinsatzEnde = einsatzEnde.V
	}

	if predecessorIDStr.Valid && predecessorIDStr.String != "" {
		pid, err := uuid.Parse(predecessorIDStr.String)
		if err != nil {
			return nil, err
		}

		rm.PredecessorID = &pid
	}

	if successorIDStr.Valid && successorIDStr.String != "" {
		sid, err := uuid.Parse(successorIDStr.String)
		if err != nil {
			return nil, err
		}

		rm.SuccessorID = &sid
	}

	if sourceMessageIDStr.Valid && sourceMessageIDStr.String != "" {
		mid, err := uuid.Parse(sourceMessageIDStr.String)
		if err != nil {
			return nil, err
		}

		rm.SourceMessageID = &mid
	}

	if deployLat.Valid && deployLng.Valid {
		label := ""
		if deployLabel.Valid {
			label = deployLabel.String
		}

		lat := deployLat.Float64
		lng := deployLng.Float64
		rm.DeploymentLocation = &outbound.DeploymentLocationRM{
			Lat:   &lat,
			Lng:   &lng,
			Label: label,
		}
	}

	if deploymentHistory != "" {
		var periods []struct {
			StartedAt        time.Time  `json:"startedAt"`
			EndedAt          *time.Time `json:"endedAt"`
			SchadenplatzID   string     `json:"schadenplatzId"`
			Formation        string     `json:"formation"`
			Name             string     `json:"name"`
			HomeLocationName *string    `json:"homeLocationName"`
			DeploymentLabel  *string    `json:"deploymentLabel"`
			Hauptaufgabe     string     `json:"hauptaufgabe"`
			PersonnelCount   int        `json:"personnelCount"`
		}
		if err := json.Unmarshal([]byte(deploymentHistory), &periods); err != nil {
			return nil, err
		}

		for _, period := range periods {
			periodID, err := uuid.Parse(period.SchadenplatzID)
			if err != nil {
				return nil, err
			}

			rm.DeploymentHistory = append(rm.DeploymentHistory, outbound.DeploymentPeriodRM{
				StartedAt: period.StartedAt, EndedAt: period.EndedAt, SchadenplatzID: periodID,
				Formation: period.Formation, Name: period.Name, HomeLocationName: period.HomeLocationName,
				DeploymentLabel: period.DeploymentLabel,
				Hauptaufgabe:    period.Hauptaufgabe, PersonnelCount: period.PersonnelCount,
			})
		}
	}

	return &rm, nil
}
