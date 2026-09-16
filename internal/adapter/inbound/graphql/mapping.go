package graphql

import (
	"encoding/json/jsontext"
	"encoding/json/v2"
	"fmt"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/scalar"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// ──────────────────────────────────────────────────────────────────────────────
// Incident mapping
// ──────────────────────────────────────────────────────────────────────────────

// incidentResultToModel builds an Incident response directly from a CreateIncidentResult,
// avoiding a read-your-writes race with the projector.
func incidentResultToModel(r inbound.CreateIncidentResult) *model.Incident {
	inc := &model.Incident{
		ID:        r.IncidentID.String(),
		Name:      r.Name,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.CreatedAt,
		IsClosed:  false,
	}
	if r.ParentID != nil {
		parentID := r.ParentID.String()
		inc.ParentID = &parentID
	}

	if r.Location != nil {
		inc.Location = &model.Location{Name: r.Location.Name}
	}

	for _, d := range r.Divisions {
		inc.Divisions = append(inc.Divisions, &model.Division{
			ID:          d.ID.String(),
			Name:        d.Name,
			Description: d.Description,
		})
	}

	if inc.Divisions == nil {
		inc.Divisions = []*model.Division{}
	}

	return inc
}

// incidentStateToModel builds an Incident response from an IncidentState DTO
// returned by a service command — no projection read required.
func incidentStateToModel(s inbound.IncidentState) *model.Incident {
	inc := &model.Incident{
		ID:        s.ID.String(),
		Name:      s.Name,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
		IsClosed:  s.IsClosed,
		ClosedAt:  s.ClosedAt,
	}
	if s.ParentID != nil {
		parentID := s.ParentID.String()
		inc.ParentID = &parentID
	}

	if s.Location != nil {
		inc.Location = &model.Location{Name: s.Location.Name}
	}

	for _, d := range s.Divisions {
		inc.Divisions = append(inc.Divisions, &model.Division{
			ID:          d.ID.String(),
			Name:        d.Name,
			Description: d.Description,
		})
	}

	if inc.Divisions == nil {
		inc.Divisions = []*model.Division{}
	}

	return inc
}

// messageStateToModel builds a Message response from a MessageState DTO
// returned by a service command — no projection read required.
func messageStateToModel(s inbound.MessageState) *model.Message {
	linkedIDs := make([]string, len(s.LinkedResourceIDs))
	for i, id := range s.LinkedResourceIDs {
		linkedIDs[i] = id.String()
	}

	msg := &model.Message{
		ID:                s.ID.String(),
		Number:            s.Number,
		Content:           s.Content,
		Sender:            s.Sender,
		SenderDetail:      s.SenderDetail,
		Receiver:          s.Receiver,
		ReceiverDetail:    s.ReceiverDetail,
		Medium:            mapMedium(string(s.Medium)),
		Time:              s.Time,
		CreatedAt:         s.CreatedAt,
		UpdatedAt:         s.UpdatedAt,
		Triage:            mapTriageStatus(string(s.Triage)),
		Priority:          mapPriorityStatus(string(s.Priority)),
		Divisions:         []*model.Division{},
		Attachments:       []*model.Attachment{},
		LinkedResourceIds: linkedIDs,
	}

	return msg
}

func attachmentRMToModel(r *outbound.AttachmentRM) *model.Attachment {
	return &model.Attachment{
		ID:          r.ID.String(),
		Filename:    r.Filename,
		ContentType: r.ContentType,
		Size:        int(r.Size),
		CreatedAt:   r.CreatedAt,
		UploadedBy:  r.UploaderSub,
		URL:         "/api/v2/attachments/" + r.ID.String(),
	}
}

func incidentRMToModel(r *outbound.IncidentRM) *model.Incident {
	inc := &model.Incident{
		ID:        r.ID.String(),
		Name:      r.Name,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
		ClosedAt:  r.ClosedAt,
		IsClosed:  r.IsClosed,
	}
	if r.ParentID != nil {
		parentID := r.ParentID.String()
		inc.ParentID = &parentID
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

	linkedIDs := make([]string, len(r.LinkedResourceIDs))
	for i, id := range r.LinkedResourceIDs {
		linkedIDs[i] = id.String()
	}

	msg.LinkedResourceIds = linkedIDs
	msg.Attachments = []*model.Attachment{}

	return msg
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer + Feature mapping
// ──────────────────────────────────────────────────────────────────────────────

func layerRMToModel(r *outbound.LayerRM) (*model.Layer, error) {
	layer := &model.Layer{
		ID:                 r.ID.String(),
		SourceIncidentID:   r.SourceIncidentID.String(),
		SourceIncidentName: r.SourceIncidentName,
		Name:               r.Name,
		Revision:           r.Revision,
	}

	features, err := featuresFromGeoJSON(r.GeoJSON)
	if err != nil {
		return nil, fmt.Errorf("layer %s: %w", r.ID, err)
	}

	layer.Features = features

	return layer, nil
}

// featuresFromGeoJSON extracts Feature objects from a GeoJSON FeatureCollection blob.
func featuresFromGeoJSON(raw jsontext.Value) ([]*model.Feature, error) {
	if len(raw) == 0 {
		return []*model.Feature{}, nil
	}

	var fc struct {
		Features []struct {
			ID         string         `json:"id"`
			Geometry   jsontext.Value `json:"geometry"`
			Properties jsontext.Value `json:"properties"`
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
	case shared.MediumOther:
		return model.MediumOther
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
	case shared.TriagePending:
		return model.TriageStatusPending
	default:
		return model.TriageStatusPending
	}
}

func mapPriorityStatus(s string) model.PriorityStatus {
	switch shared.PriorityStatus(s) {
	case shared.PriorityHigh:
		return model.PriorityStatusHigh
	case shared.PriorityNormal:
		return model.PriorityStatusNormal
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

// ──────────────────────────────────────────────────────────────────────────────
// Schadenplatz mapping
// ──────────────────────────────────────────────────────────────────────────────

func schadenplatzRMToModel(r *outbound.SchadenplatzRM) *model.Schadenplatz {
	sp := &model.Schadenplatz{
		ID:         r.ID.String(),
		IncidentID: r.IncidentID.String(),
		Name:       r.Name,
		IsDefault:  r.IsDefault,
		Casualties: &model.Casualties{
			Vermisste:       r.Casualties.Vermisste,
			Tote:            r.Casualties.Tote,
			Verletzte:       r.Casualties.Verletzte,
			Obdachlose:      r.Casualties.Obdachlose,
			Eingeschlossene: r.Casualties.Eingeschlossene,
		},
		IsMerged: r.IsMerged,
	}

	if len(r.GeoJSON) > 0 {
		gj := string(r.GeoJSON)
		sp.GeoJSON = &gj
	}

	if r.MergedInto != nil {
		mid := r.MergedInto.String()
		sp.MergedInto = &mid
	}

	return sp
}

func schadenplatzStateToModel(s inbound.SchadenplatzState) *model.Schadenplatz {
	sp := &model.Schadenplatz{
		ID:         s.ID.String(),
		IncidentID: s.IncidentID.String(),
		Name:       s.Name,
		IsDefault:  s.IsDefault,
		Casualties: &model.Casualties{
			Vermisste:       s.Casualties.Vermisste,
			Tote:            s.Casualties.Tote,
			Verletzte:       s.Casualties.Verletzte,
			Obdachlose:      s.Casualties.Obdachlose,
			Eingeschlossene: s.Casualties.Eingeschlossene,
		},
		IsMerged: s.IsMerged,
	}

	if len(s.GeoJSON) > 0 {
		gj := string(s.GeoJSON)
		sp.GeoJSON = &gj
	}

	if s.MergedInto != nil {
		mid := s.MergedInto.String()
		sp.MergedInto = &mid
	}

	return sp
}

// ──────────────────────────────────────────────────────────────────────────────
// Resource mapping
// ──────────────────────────────────────────────────────────────────────────────

func resourceRMToModel(r *outbound.ResourceRM) *model.Resource {
	res := &model.Resource{
		ID:             r.ID.String(),
		IncidentID:     r.IncidentID.String(),
		SchadenplatzID: r.SchadenplatzID.String(),
		Formation:      mapResourceFormation(r.Formation),
		Name:           r.Name,
		Size:           mapResourceUnitSize(r.Size),
		PersonnelCount: r.PersonnelCount,
		Hauptaufgabe:   r.Hauptaufgabe,
		Status:         mapResourceStatus(r.Status),
		StatusAt:       r.StatusAt,
		AlertedAt:      r.AlertedAt,
		ReadyAt:        r.ReadyAt,
		DeployedAt:     r.DeployedAt,
		StoodDownAt:    r.StoodDownAt,
		RelievedAt:     r.RelievedAt,
		EinsatzBeginn:  r.EinsatzBeginn,
		EinsatzEnde:    r.EinsatzEnde,
	}

	if r.ContactMedium != nil {
		res.Contact = &model.ResourceContact{
			Medium: mapContactMedium(*r.ContactMedium),
			Detail: func() string {
				if r.ContactDetail != nil {
					return *r.ContactDetail
				}

				return ""
			}(),
		}
	}

	if r.HomeLocationName != nil {
		res.HomeLocation = &model.ResourceHomeLocation{
			Name: *r.HomeLocationName,
			Lat:  r.HomeLocationLat,
			Lng:  r.HomeLocationLng,
		}
	}

	if r.DeploymentLocation != nil {
		res.DeploymentLocation = &model.DeploymentLocation{
			Lat:   r.DeploymentLocation.Lat,
			Lng:   r.DeploymentLocation.Lng,
			Label: r.DeploymentLocation.Label,
		}
	}

	if r.PredecessorID != nil {
		s := r.PredecessorID.String()
		res.PredecessorID = &s
	}

	if r.SuccessorID != nil {
		s := r.SuccessorID.String()
		res.SuccessorID = &s
	}

	if r.SourceMessageID != nil {
		s := r.SourceMessageID.String()
		res.SourceMessageID = &s
	}

	return res
}

func resourceStateToModel(s inbound.ResourceState) *model.Resource {
	res := &model.Resource{
		ID:             s.ID.String(),
		IncidentID:     s.IncidentID.String(),
		SchadenplatzID: s.SchadenplatzID.String(),
		Formation:      mapResourceFormation(string(s.Formation)),
		Name:           s.Name,
		Size:           mapResourceUnitSize(string(s.Size)),
		PersonnelCount: s.PersonnelCount,
		Hauptaufgabe:   s.Hauptaufgabe,
		Status:         mapResourceStatus(string(s.Status)),
		StatusAt:       s.StatusAt,
		AlertedAt:      s.AlertedAt,
		ReadyAt:        s.ReadyAt,
		DeployedAt:     s.DeployedAt,
		StoodDownAt:    s.StoodDownAt,
		RelievedAt:     s.RelievedAt,
		EinsatzBeginn:  s.EinsatzBeginn,
		EinsatzEnde:    s.EinsatzEnde,
	}

	if s.Contact != nil {
		res.Contact = &model.ResourceContact{
			Medium: mapContactMedium(string(s.Contact.Medium)),
			Detail: s.Contact.Detail,
		}
	}

	if s.HomeLocation != nil {
		hl := &model.ResourceHomeLocation{Name: s.HomeLocation.Name}
		if s.HomeLocation.Coordinates != nil {
			lat := s.HomeLocation.Coordinates[0]
			lng := s.HomeLocation.Coordinates[1]
			hl.Lat = &lat
			hl.Lng = &lng
		}

		res.HomeLocation = hl
	}

	if s.DeploymentLocation != nil {
		res.DeploymentLocation = &model.DeploymentLocation{
			Lat:   s.DeploymentLocation.Lat,
			Lng:   s.DeploymentLocation.Lng,
			Label: s.DeploymentLocation.Label,
		}
	}

	if s.PredecessorID != nil {
		str := s.PredecessorID.String()
		res.PredecessorID = &str
	}

	if s.SuccessorID != nil {
		str := s.SuccessorID.String()
		res.SuccessorID = &str
	}

	if s.SourceMessageID != nil {
		str := s.SourceMessageID.String()
		res.SourceMessageID = &str
	}

	return res
}

func mapResourceFormation(s string) model.ResourceFormation {
	switch resource.Formation(s) {
	case resource.FormationFW:
		return model.ResourceFormationFw
	case resource.FormationPOL:
		return model.ResourceFormationPol
	case resource.FormationARMEE:
		return model.ResourceFormationArmee
	case resource.FormationZS:
		return model.ResourceFormationZs
	case resource.FormationTECHNB:
		return model.ResourceFormationTechnb
	case resource.FormationSAN:
		return model.ResourceFormationSan
	case resource.FormationOTHER:
		return model.ResourceFormationOther
	default:
		return model.ResourceFormationOther
	}
}

func mapResourceUnitSize(s string) model.ResourceUnitSize {
	switch resource.UnitSize(s) {
	case resource.UnitSizeTrupp:
		return model.ResourceUnitSizeTrupp
	case resource.UnitSizeGruppe:
		return model.ResourceUnitSizeGruppe
	case resource.UnitSizeZug:
		return model.ResourceUnitSizeZug
	case resource.UnitSizeKompanie:
		return model.ResourceUnitSizeKompanie
	case resource.UnitSizeBataillon:
		return model.ResourceUnitSizeBataillon
	default:
		return model.ResourceUnitSizeTrupp
	}
}

func mapResourceStatus(s string) model.ResourceStatus {
	switch resource.ResourceStatus(s) {
	case resource.StatusAufgeboten:
		return model.ResourceStatusAufgeboten
	case resource.StatusEinsatzbereit:
		return model.ResourceStatusEinsatzbereit
	case resource.StatusEingesetzt:
		return model.ResourceStatusEingesetzt
	case resource.StatusAbgeloest:
		return model.ResourceStatusAbgeloest
	default:
		return model.ResourceStatusAufgeboten
	}
}

func mapContactMedium(s string) model.ContactMedium {
	switch resource.ContactMedium(s) {
	case resource.ContactMediumRadio:
		return model.ContactMediumRadio
	case resource.ContactMediumPhone:
		return model.ContactMediumPhone
	case resource.ContactMediumOther:
		return model.ContactMediumOther
	default:
		return model.ContactMediumOther
	}
}

func modelFormationToDomain(f model.ResourceFormation) resource.Formation {
	switch f {
	case model.ResourceFormationFw:
		return resource.FormationFW
	case model.ResourceFormationPol:
		return resource.FormationPOL
	case model.ResourceFormationArmee:
		return resource.FormationARMEE
	case model.ResourceFormationZs:
		return resource.FormationZS
	case model.ResourceFormationTechnb:
		return resource.FormationTECHNB
	case model.ResourceFormationSan:
		return resource.FormationSAN
	case model.ResourceFormationOther:
		return resource.FormationOTHER
	default:
		return resource.FormationOTHER
	}
}

func modelUnitSizeToDomain(s model.ResourceUnitSize) resource.UnitSize {
	switch s {
	case model.ResourceUnitSizeTrupp:
		return resource.UnitSizeTrupp
	case model.ResourceUnitSizeGruppe:
		return resource.UnitSizeGruppe
	case model.ResourceUnitSizeZug:
		return resource.UnitSizeZug
	case model.ResourceUnitSizeKompanie:
		return resource.UnitSizeKompanie
	case model.ResourceUnitSizeBataillon:
		return resource.UnitSizeBataillon
	default:
		return resource.UnitSizeTrupp
	}
}

func modelContactMediumToDomain(m model.ContactMedium) resource.ContactMedium {
	switch m {
	case model.ContactMediumRadio:
		return resource.ContactMediumRadio
	case model.ContactMediumPhone:
		return resource.ContactMediumPhone
	case model.ContactMediumOther:
		return resource.ContactMediumOther
	default:
		return resource.ContactMediumOther
	}
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
