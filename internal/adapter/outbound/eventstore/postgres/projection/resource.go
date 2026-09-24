package projection

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*ResourceHandler)(nil)

// ResourceHandler maintains the readmodel.resource Postgres table.
type ResourceHandler struct{ pool *pgxpool.Pool }

func NewResourceHandler(pool *pgxpool.Pool) *ResourceHandler {
	return &ResourceHandler{pool: pool}
}

func (h *ResourceHandler) Name() string { return "readmodel.resource" }
func (h *ResourceHandler) Version() int { return 5 }
func (h *ResourceHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(ctx, `TRUNCATE readmodel.resource`)
	return err
}

func (h *ResourceHandler) Handles(st, t string) bool {
	if st != "Resource" {
		return false
	}

	switch t {
	case "Alerted", "MarkedReady", "Deployed", "StoodDown", "Relieved",
		"SuccessionLinked", "ReassignedToSchadenplatz", "DeploymentLocationUpdated",
		"HauptaufgabeChanged", "ContactUpdated", "PersonnelCountUpdated":
		return true
	}

	return false
}

func (h *ResourceHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	db, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.resource: no tx in context")
	}

	id := e.StreamID
	now := e.OccurredAt

	switch e.EventType {
	case "Alerted":
		var d struct {
			IncidentID     string `json:"incidentId"`
			SchadenplatzID string `json:"schadenplatzId"`
			Formation      string `json:"formation"`
			Name           string `json:"name"`
			Size           string `json:"size"`
			PersonnelCount int    `json:"personnelCount"`
			Hauptaufgabe   string `json:"hauptaufgabe"`
			Contact        *struct {
				Medium string `json:"medium"`
				Detail string `json:"detail"`
			} `json:"contact"`
			HomeLocation *struct {
				Name        string      `json:"name"`
				Coordinates *[2]float64 `json:"coordinates"`
			} `json:"homeLocation"`
			SourceMessageID *string `json:"sourceMessageId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		var contactMedium, contactDetail *string
		if d.Contact != nil {
			contactMedium = &d.Contact.Medium
			contactDetail = &d.Contact.Detail
		}

		var (
			homeName         *string
			homeLat, homeLng *float64
		)

		if d.HomeLocation != nil {
			homeName = &d.HomeLocation.Name
			if d.HomeLocation.Coordinates != nil {
				lat := d.HomeLocation.Coordinates[0]
				lng := d.HomeLocation.Coordinates[1]
				homeLat = &lat
				homeLng = &lng
			}
		}

		return exec(db, ctx, `
			INSERT INTO readmodel.resource
			  (id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
			   contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
			   status, status_at, alerted_at, source_message_id, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'AUFGEBOTEN',$14,$14,$15,$14,$14)
			ON CONFLICT (id) DO UPDATE
			  SET incident_id=$2, schadenplatz_id=$3, formation=$4, name=$5, size=$6,
			      personnel_count=$7, hauptaufgabe=$8, contact_medium=$9, contact_detail=$10,
			      home_location_name=$11, home_location_lat=$12, home_location_lng=$13,
			      alerted_at=$14, updated_at=$14`,
			id, d.IncidentID, d.SchadenplatzID, d.Formation, d.Name, d.Size, d.PersonnelCount, d.Hauptaufgabe,
			contactMedium, contactDetail, homeName, homeLat, homeLng,
			now, d.SourceMessageID)

	case "MarkedReady":
		return exec(
			db,
			ctx,
			`UPDATE readmodel.resource SET status='EINSATZBEREIT', status_at=$1, ready_at=$1, einsatz_beginn=COALESCE(einsatz_beginn,$1), updated_at=$1 WHERE id=$2`,
			now,
			id,
		)

	case "Deployed":
		var d struct {
			DeploymentLocation *struct {
				Label string  `json:"label"`
				Lat   float64 `json:"lat"`
				Lng   float64 `json:"lng"`
			} `json:"deploymentLocation"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		var (
			deploymentLabel              *string
			deploymentLat, deploymentLng *float64
		)
		if d.DeploymentLocation != nil {
			deploymentLabel = &d.DeploymentLocation.Label
			deploymentLat = &d.DeploymentLocation.Lat
			deploymentLng = &d.DeploymentLocation.Lng
		}

		// Remove any existing entry for this deployment start before appending —
		// makes the Deployed case idempotent when the projector replays a batch.
		return exec(db, ctx, `
			UPDATE readmodel.resource SET status='EINGESETZT', status_at=$1,
				deployed_at = COALESCE(deployed_at, $1),
				deployment_history = (
					SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
					FROM jsonb_array_elements(deployment_history) elem
					WHERE (elem->>'startedAt')::timestamptz != $1::timestamptz
				) || jsonb_build_array(jsonb_build_object(
					'startedAt', $1, 'endedAt', NULL, 'schadenplatzId', schadenplatz_id,
					'formation', formation, 'name', name, 'homeLocationName', home_location_name,
					'deploymentLabel', $2::text, 'deploymentLat', $3::float8, 'deploymentLng', $4::float8,
					'hauptaufgabe', hauptaufgabe, 'personnelCount', personnel_count)),
				updated_at=$1 WHERE id=$5`, now, deploymentLabel, deploymentLat, deploymentLng, id)

	case "StoodDown":
		return exec(db, ctx, `
			UPDATE readmodel.resource SET status='EINSATZBEREIT', status_at=$1, stood_down_at=$1, hauptaufgabe='',
				deployment_history = CASE WHEN jsonb_array_length(deployment_history) > 0
					THEN jsonb_set(deployment_history, ARRAY[(jsonb_array_length(deployment_history)-1)::text, 'endedAt'], to_jsonb($1::timestamptz))
					ELSE deployment_history END,
				updated_at=$1 WHERE id=$2`, now, id)

	case "Relieved":
		var d struct {
			SuccessorID *string `json:"successorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(db, ctx, `
			UPDATE readmodel.resource SET status='ABGELOEST', status_at=$1, relieved_at=$1, successor_id=$2::uuid,
				einsatz_ende=$1,
				deployment_history = CASE WHEN jsonb_array_length(deployment_history) > 0
					THEN jsonb_set(deployment_history, ARRAY[(jsonb_array_length(deployment_history)-1)::text, 'endedAt'], to_jsonb($1::timestamptz))
					ELSE deployment_history END,
				updated_at=$1 WHERE id=$3`,
			now, d.SuccessorID, id)

	case "SuccessionLinked":
		var d struct {
			PredecessorID string `json:"predecessorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			db,
			ctx,
			`UPDATE readmodel.resource SET predecessor_id=$1, updated_at=$2 WHERE id=$3`,
			d.PredecessorID,
			now,
			id,
		)

	case "ReassignedToSchadenplatz":
		var d struct {
			SchadenplatzID string `json:"schadenplatzId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(db, ctx,
			`UPDATE readmodel.resource SET schadenplatz_id=$1, updated_at=$2 WHERE id=$3`,
			d.SchadenplatzID, now, id)

	case "DeploymentLocationUpdated":
		var d struct {
			Location *struct {
				Lat   float64 `json:"lat"`
				Lng   float64 `json:"lng"`
				Label string  `json:"label"`
			} `json:"location"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		var (
			lat, lng *float64
			label    *string
		)

		if d.Location != nil {
			lat = &d.Location.Lat
			lng = &d.Location.Lng
			label = &d.Location.Label
		}

		return exec(db, ctx, `
			UPDATE readmodel.resource SET deployment_lat=$1, deployment_lng=$2, deployment_label=$3, updated_at=$4 WHERE id=$5`,
			lat, lng, label, now, id)

	case "HauptaufgabeChanged":
		var d struct {
			Hauptaufgabe string `json:"hauptaufgabe"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			db,
			ctx,
			`UPDATE readmodel.resource SET hauptaufgabe=$1, updated_at=$2 WHERE id=$3`,
			d.Hauptaufgabe,
			now,
			id,
		)

	case "ContactUpdated":
		var d struct {
			Contact struct {
				Medium string `json:"medium"`
				Detail string `json:"detail"`
			} `json:"contact"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			db,
			ctx,
			`UPDATE readmodel.resource SET contact_medium=$1, contact_detail=$2, updated_at=$3 WHERE id=$4`,
			d.Contact.Medium,
			d.Contact.Detail,
			now,
			id,
		)

	case "PersonnelCountUpdated":
		var d struct {
			Count int `json:"count"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			db,
			ctx,
			`UPDATE readmodel.resource SET personnel_count=$1, updated_at=$2 WHERE id=$3`,
			d.Count,
			now,
			id,
		)
	}

	return nil
}
