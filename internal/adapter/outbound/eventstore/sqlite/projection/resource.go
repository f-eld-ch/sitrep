package projection

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Compile-time assertion.
var _ Handler = (*ResourceHandler)(nil)

// ResourceHandler maintains the readmodel_resource SQLite table.
type ResourceHandler struct{ db *sql.DB }

func NewResourceHandler(db *sql.DB) *ResourceHandler {
	return &ResourceHandler{db: db}
}

func (h *ResourceHandler) Name() string { return "readmodel.resource" }
func (h *ResourceHandler) Version() int { return 1 }
func (h *ResourceHandler) Reset(ctx context.Context) error {
	_, err := h.db.ExecContext(ctx, `DELETE FROM readmodel_resource`)
	return err
}

func (h *ResourceHandler) Handles(st, t string) bool {
	if st != "Resource" {
		return false
	}

	switch t {
	case "Alerted", "MarkedReady", "Deployed", "StoodDown", "Relieved",
		"SuccessionLinked", "ReassignedToSchadenplatz", "DeploymentLocationUpdated",
		"HauptaufgabeChanged", "ContactUpdated", "PersonnelCountUpdated",
		"EinsatzDauerRecorded":
		return true
	}

	return false
}

func (h *ResourceHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("readmodel.resource: no tx in context")
	}

	id := e.StreamID.String()
	now := sqlite.FormatTime(e.OccurredAt)

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

		var contactMedium, contactDetail any
		if d.Contact != nil {
			contactMedium = d.Contact.Medium
			contactDetail = d.Contact.Detail
		}

		var (
			homeName         any
			homeLat, homeLng any
		)

		if d.HomeLocation != nil {
			homeName = d.HomeLocation.Name
			if d.HomeLocation.Coordinates != nil {
				homeLat = d.HomeLocation.Coordinates[0]
				homeLng = d.HomeLocation.Coordinates[1]
			}
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_resource
			  (id, incident_id, schadenplatz_id, formation, name, size, personnel_count, hauptaufgabe,
			   contact_medium, contact_detail, home_location_name, home_location_lat, home_location_lng,
			   status, status_at, alerted_at, source_message_id, created_at, updated_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'AUFGEBOTEN',?,?,?,?,?)
			ON CONFLICT (id) DO UPDATE
			  SET incident_id=excluded.incident_id, schadenplatz_id=excluded.schadenplatz_id,
			      formation=excluded.formation, name=excluded.name, size=excluded.size,
			      personnel_count=excluded.personnel_count, hauptaufgabe=excluded.hauptaufgabe,
			      contact_medium=excluded.contact_medium, contact_detail=excluded.contact_detail,
			      home_location_name=excluded.home_location_name, home_location_lat=excluded.home_location_lat,
			      home_location_lng=excluded.home_location_lng, alerted_at=excluded.alerted_at,
			      updated_at=excluded.updated_at`,
			id, d.IncidentID, d.SchadenplatzID, d.Formation, d.Name, d.Size, d.PersonnelCount, d.Hauptaufgabe,
			contactMedium, contactDetail, homeName, homeLat, homeLng,
			now, now, d.SourceMessageID, now, now)

	case "MarkedReady":
		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET status='EINSATZBEREIT', status_at=?, ready_at=?, updated_at=? WHERE id=?`,
			now,
			now,
			now,
			id,
		)

	case "Deployed":
		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET status='EINGESETZT', status_at=?, deployed_at=?, updated_at=? WHERE id=?`,
			now,
			now,
			now,
			id,
		)

	case "StoodDown":
		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET status='EINSATZBEREIT', status_at=?, stood_down_at=?, updated_at=? WHERE id=?`,
			now,
			now,
			now,
			id,
		)

	case "Relieved":
		var d struct {
			SuccessorID *string `json:"successorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_resource SET status='ABGELOEST', status_at=?, relieved_at=?, successor_id=?, updated_at=? WHERE id=?`,
			now, now, d.SuccessorID, now, id)

	case "SuccessionLinked":
		var d struct {
			PredecessorID string `json:"predecessorId"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET predecessor_id=?, updated_at=? WHERE id=?`,
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

		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET schadenplatz_id=?, updated_at=? WHERE id=?`,
			d.SchadenplatzID,
			now,
			id,
		)

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
			lat, lng any
			label    any
		)

		if d.Location != nil {
			lat = d.Location.Lat
			lng = d.Location.Lng
			label = d.Location.Label
		}

		return exec(tx, ctx, `
			UPDATE readmodel_resource SET deployment_lat=?, deployment_lng=?, deployment_label=?, updated_at=? WHERE id=?`,
			lat, lng, label, now, id)

	case "HauptaufgabeChanged":
		var d struct {
			Hauptaufgabe string `json:"hauptaufgabe"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(
			tx,
			ctx,
			`UPDATE readmodel_resource SET hauptaufgabe=?, updated_at=? WHERE id=?`,
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
			tx,
			ctx,
			`UPDATE readmodel_resource SET contact_medium=?, contact_detail=?, updated_at=? WHERE id=?`,
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
			tx,
			ctx,
			`UPDATE readmodel_resource SET personnel_count=?, updated_at=? WHERE id=?`,
			d.Count,
			now,
			id,
		)

	case "EinsatzDauerRecorded":
		var d struct {
			Beginn string  `json:"beginn"`
			Ende   *string `json:"ende"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_resource SET einsatz_beginn=?, einsatz_ende=?, updated_at=? WHERE id=?`,
			d.Beginn, d.Ende, now, id)
	}

	return nil
}
