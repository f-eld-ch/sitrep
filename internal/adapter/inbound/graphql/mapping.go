package graphql

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/scalar"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// ──────────────────────────────────────────────────────────────────────────────
// Incident mapping
// ──────────────────────────────────────────────────────────────────────────────

func incidentRMToModel(r *outbound.IncidentRM) *model.Incident {
	inc := &model.Incident{
		ID:        r.ID.String(),
		Name:      r.Name,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
		ClosedAt:  r.ClosedAt,
		IsClosed:  r.IsClosed,
	}
	if r.Location != nil {
		inc.Location = locationRMToModel(r.Location)
	}
	for _, d := range r.Divisions {
		if d.RemovedAt == nil {
			inc.Divisions = append(inc.Divisions, divisionRMToModel(d))
		}
	}
	if inc.Divisions == nil {
		inc.Divisions = []*model.Division{}
	}
	return inc
}

func locationRMToModel(r *outbound.LocationRM) *model.Location {
	loc := &model.Location{Name: r.Name}
	if r.Coordinates != nil {
		loc.Coordinates = scalar.JSONMap{"coordinates": []any{r.Coordinates[0], r.Coordinates[1]}}
	}
	return loc
}

func divisionRMToModel(r *outbound.DivisionRM) *model.Division {
	return &model.Division{
		ID:          r.ID.String(),
		Name:        r.Name,
		Description: r.Description,
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Message mapping
// ──────────────────────────────────────────────────────────────────────────────

func messageRMToModel(r *outbound.MessageRM, divsByID map[uuid.UUID]*outbound.DivisionRM) *model.Message {
	msg := &model.Message{
		ID:             r.ID.String(),
		Number:         r.Number,
		Content:        r.Content,
		Sender:         r.Sender,
		SenderDetail:   r.SenderDetail,
		Receiver:       r.Receiver,
		ReceiverDetail: r.ReceiverDetail,
		Medium:         mapMedium(r.Medium),
		Time:           r.Time,
		CreatedAt:      r.CreatedAt,
		UpdatedAt:      r.UpdatedAt,
		Triage:         mapTriageStatus(r.Triage),
		Priority:       mapPriorityStatus(r.Priority),
	}
	for _, divID := range r.DivisionIDs {
		if d, ok := divsByID[divID]; ok {
			msg.Divisions = append(msg.Divisions, divisionRMToModel(d))
		}
	}
	if msg.Divisions == nil {
		msg.Divisions = []*model.Division{}
	}
	return msg
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer + Feature mapping
// ──────────────────────────────────────────────────────────────────────────────

func layerRMToModel(r *outbound.LayerRM) (*model.Layer, error) {
	layer := &model.Layer{
		ID:       r.ID.String(),
		Name:     r.Name,
		Revision: r.Revision,
	}
	features, err := featuresFromGeoJSON(r.GeoJSON)
	if err != nil {
		return nil, fmt.Errorf("layer %s: %w", r.ID, err)
	}
	layer.Features = features
	return layer, nil
}

// featuresFromGeoJSON extracts Feature objects from a GeoJSON FeatureCollection blob.
func featuresFromGeoJSON(raw json.RawMessage) ([]*model.Feature, error) {
	if len(raw) == 0 {
		return []*model.Feature{}, nil
	}
	var fc struct {
		Features []struct {
			ID         string          `json:"id"`
			Geometry   json.RawMessage `json:"geometry"`
			Properties json.RawMessage `json:"properties"`
		} `json:"features"`
	}
	if err := json.Unmarshal(raw, &fc); err != nil {
		return nil, err
	}
	out := make([]*model.Feature, 0, len(fc.Features))
	for _, f := range fc.Features {
		feat := &model.Feature{ID: f.ID}
		if len(f.Geometry) > 0 && string(f.Geometry) != "null" {
			var g scalar.JSONMap
			if err := json.Unmarshal(f.Geometry, &g); err != nil {
				return nil, err
			}
			feat.Geometry = g
		}
		if len(f.Properties) > 0 && string(f.Properties) != "null" {
			var p scalar.JSONMap
			if err := json.Unmarshal(f.Properties, &p); err != nil {
				return nil, err
			}
			feat.Properties = p
		}
		out = append(out, feat)
	}
	return out, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Enum mapping — total; unknown values return the zero/default
// ──────────────────────────────────────────────────────────────────────────────

func mapMedium(s string) model.Medium {
	switch shared.Medium(s) {
	case shared.MediumRadio:
		return model.MediumRadio
	case shared.MediumPhone:
		return model.MediumPhone
	case shared.MediumEmail:
		return model.MediumEmail
	default:
		return model.MediumOther
	}
}

func mapTriageStatus(s string) model.TriageStatus {
	switch shared.TriageStatus(s) {
	case shared.TriageDone:
		return model.TriageStatusDone
	case shared.TriageMoreInfo:
		return model.TriageStatusMoreinfo
	case shared.TriageReset:
		return model.TriageStatusReset
	default:
		return model.TriageStatusPending
	}
}

func mapPriorityStatus(s string) model.PriorityStatus {
	switch shared.PriorityStatus(s) {
	case shared.PriorityHigh:
		return model.PriorityStatusHigh
	default:
		return model.PriorityStatusNormal
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Input conversion
// ──────────────────────────────────────────────────────────────────────────────

func modelMediumToDomain(m model.Medium) (shared.Medium, error) {
	switch m {
	case model.MediumRadio:
		return shared.MediumRadio, nil
	case model.MediumPhone:
		return shared.MediumPhone, nil
	case model.MediumEmail:
		return shared.MediumEmail, nil
	case model.MediumOther:
		return shared.MediumOther, nil
	}
	return "", fmt.Errorf("unknown medium %q", m)
}

func modelTriageToDomain(t model.TriageStatus) (shared.TriageStatus, error) {
	switch t {
	case model.TriageStatusPending:
		return shared.TriagePending, nil
	case model.TriageStatusDone:
		return shared.TriageDone, nil
	case model.TriageStatusMoreinfo:
		return shared.TriageMoreInfo, nil
	case model.TriageStatusReset:
		return shared.TriageReset, nil
	}
	return "", fmt.Errorf("unknown triage status %q", t)
}

func modelPriorityToDomain(p model.PriorityStatus) (shared.PriorityStatus, error) {
	switch p {
	case model.PriorityStatusNormal:
		return shared.PriorityNormal, nil
	case model.PriorityStatusHigh:
		return shared.PriorityHigh, nil
	}
	return "", fmt.Errorf("unknown priority %q", p)
}

func parseUUID(id string) (uuid.UUID, error) {
	u, err := uuid.Parse(id)
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("%w: invalid id %q", shared.ErrInvalidInput, id)
	}
	return u, nil
}

// divisionsByID builds a lookup map for a division list.
func divisionsByID(divs []*outbound.DivisionRM) map[uuid.UUID]*outbound.DivisionRM {
	m := make(map[uuid.UUID]*outbound.DivisionRM, len(divs))
	for _, d := range divs {
		m[d.ID] = d
	}
	return m
}

// ptrString is a convenience for optional string pointer fields.
func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// nowIfNil returns t if non-nil, or the current UTC time otherwise.
func nowIfNil(t *time.Time) time.Time {
	if t != nil {
		return *t
	}
	return time.Now().UTC()
}
