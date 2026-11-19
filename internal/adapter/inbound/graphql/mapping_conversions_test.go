package graphql

import (
	"encoding/json/jsontext"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/scalar"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

func TestAccessEnums_RoundTripThroughTheDomain(t *testing.T) {
	roles := []struct {
		model  model.IncidentRole
		domain access.Role
	}{
		{model.IncidentRoleOwner, access.Owner},
		{model.IncidentRoleManager, access.Manager},
		{model.IncidentRoleEditor, access.Editor},
		{model.IncidentRoleViewer, access.Viewer},
	}
	for _, tc := range roles {
		t.Run(string(tc.model), func(t *testing.T) {
			assert.Equal(t, tc.domain, incidentRoleToDomain(tc.model))
			assert.Equal(t, tc.model, incidentRoleFromDomain(tc.domain))
		})
	}

	kinds := []struct {
		model  model.AccessPrincipalKind
		domain access.PrincipalKind
	}{
		{model.AccessPrincipalKindUser, access.UserPrincipal},
		{model.AccessPrincipalKindGroup, access.GroupPrincipal},
		{model.AccessPrincipalKindAll, access.AllPrincipal},
	}
	for _, tc := range kinds {
		t.Run(string(tc.model), func(t *testing.T) {
			assert.Equal(t, tc.domain, principalKindToDomain(tc.model))
			assert.Equal(t, tc.model, principalKindFromDomain(tc.domain))
		})
	}

	globals := []struct {
		model  model.GlobalRole
		domain access.GlobalRole
	}{
		{model.GlobalRoleSystemAdmin, access.SystemAdmin},
		{model.GlobalRoleGroupAdmin, access.GroupAdmin},
	}
	for _, tc := range globals {
		t.Run(string(tc.model), func(t *testing.T) {
			assert.Equal(t, tc.domain, globalRoleToDomain(tc.model))
			assert.Equal(t, tc.model, globalRoleFromDomain(tc.domain))
		})
	}

	modes := []struct {
		model  model.IncidentAccessMode
		domain access.IncidentMode
	}{
		{model.IncidentAccessModeOpenOperational, access.OpenOperational},
		{model.IncidentAccessModeRestricted, access.Restricted},
	}
	for _, tc := range modes {
		t.Run(string(tc.model), func(t *testing.T) {
			assert.Equal(t, tc.domain, accessModeToDomain(tc.model))
			assert.Equal(t, tc.model, incidentModeFromDomain(tc.domain))
		})
	}
}

func TestAccessEnums_UnknownValuesFallBackToTheLeastPrivilege(t *testing.T) {
	assert.Equal(t, access.Viewer, incidentRoleToDomain(model.IncidentRole("NOPE")))
	assert.Equal(t, model.IncidentRoleViewer, incidentRoleFromDomain(access.Role("nope")))
	assert.Equal(t, access.UserPrincipal, principalKindToDomain(model.AccessPrincipalKind("NOPE")))
	assert.Equal(t, model.AccessPrincipalKindUser, principalKindFromDomain(access.PrincipalKind("nope")))
}

func TestResourceEnums_RoundTripAndFallBack(t *testing.T) {
	formations := map[model.ResourceFormation]resource.Formation{
		model.ResourceFormationFw:     resource.FormationFW,
		model.ResourceFormationPol:    resource.FormationPOL,
		model.ResourceFormationArmee:  resource.FormationARMEE,
		model.ResourceFormationZs:     resource.FormationZS,
		model.ResourceFormationTechnb: resource.FormationTECHNB,
		model.ResourceFormationSan:    resource.FormationSAN,
		model.ResourceFormationOther:  resource.FormationOTHER,
	}
	for m, d := range formations {
		assert.Equal(t, d, modelFormationToDomain(m), string(m))
		assert.Equal(t, m, mapResourceFormation(string(d)), string(m))
	}

	assert.Equal(t, resource.FormationOTHER, modelFormationToDomain(model.ResourceFormation("NOPE")))
	assert.Equal(t, model.ResourceFormationOther, mapResourceFormation("NOPE"))

	sizes := map[model.ResourceUnitSize]resource.UnitSize{
		model.ResourceUnitSizeTrupp:     resource.UnitSizeTrupp,
		model.ResourceUnitSizeGruppe:    resource.UnitSizeGruppe,
		model.ResourceUnitSizeZug:       resource.UnitSizeZug,
		model.ResourceUnitSizeKompanie:  resource.UnitSizeKompanie,
		model.ResourceUnitSizeBataillon: resource.UnitSizeBataillon,
	}
	for m, d := range sizes {
		assert.Equal(t, d, modelUnitSizeToDomain(m), string(m))
		assert.Equal(t, m, mapResourceUnitSize(string(d)), string(m))
	}

	assert.Equal(t, resource.UnitSizeTrupp, modelUnitSizeToDomain(model.ResourceUnitSize("NOPE")))
	assert.Equal(t, model.ResourceUnitSizeTrupp, mapResourceUnitSize("NOPE"))

	statuses := map[model.ResourceStatus]resource.ResourceStatus{
		model.ResourceStatusAufgeboten:    resource.StatusAufgeboten,
		model.ResourceStatusEinsatzbereit: resource.StatusEinsatzbereit,
		model.ResourceStatusEingesetzt:    resource.StatusEingesetzt,
		model.ResourceStatusAbgeloest:     resource.StatusAbgeloest,
	}
	for m, d := range statuses {
		assert.Equal(t, m, mapResourceStatus(string(d)), string(m))
	}

	assert.Equal(t, model.ResourceStatusAufgeboten, mapResourceStatus("NOPE"))

	media := map[model.ContactMedium]resource.ContactMedium{
		model.ContactMediumRadio: resource.ContactMediumRadio,
		model.ContactMediumPhone: resource.ContactMediumPhone,
		model.ContactMediumOther: resource.ContactMediumOther,
	}
	for m, d := range media {
		assert.Equal(t, d, modelContactMediumToDomain(m), string(m))
		assert.Equal(t, m, mapContactMedium(string(d)), string(m))
	}

	assert.Equal(t, resource.ContactMediumOther, modelContactMediumToDomain(model.ContactMedium("NOPE")))
	assert.Equal(t, model.ContactMediumOther, mapContactMedium("NOPE"))
}

func TestLocationRMToModel(t *testing.T) {
	named := locationRMToModel(&outbound.LocationRM{Name: "Altdorf"})
	assert.Equal(t, &model.Location{Name: "Altdorf"}, named)

	located := locationRMToModel(&outbound.LocationRM{Name: "Altdorf", Coordinates: &[2]float64{8.64, 46.88}})
	require.NotNil(t, located)
	assert.Equal(t, "Altdorf", located.Name)
	assert.Equal(t, scalar.JSONMap{"coordinates": []any{8.64, 46.88}}, located.Coordinates)
}

func TestIncidentRMToModel_MapsLocationParentAndActiveDivisions(t *testing.T) {
	parent, active, removed := uuid.New(), uuid.New(), uuid.New()
	gone := time.Now()

	got := incidentRMToModel(&outbound.IncidentRM{
		ID:       uuid.New(),
		Name:     "Brand",
		ParentID: &parent,
		Location: &outbound.LocationRM{Name: "Flüelen", Coordinates: &[2]float64{8.6, 46.9}},
		Divisions: []*outbound.DivisionRM{
			{ID: active, Name: "Aktiv"},
			{ID: removed, Name: "Entfernt", RemovedAt: &gone},
		},
	})

	require.NotNil(t, got.ParentID)
	assert.Equal(t, parent.String(), *got.ParentID)
	require.NotNil(t, got.Location)
	assert.NotNil(t, got.Location.Coordinates)
	require.Len(t, got.Divisions, 1, "removed divisions are left out")
	assert.Equal(t, active.String(), got.Divisions[0].ID)
}

func TestIncidentStateAndResultToModel_MapParentLocationAndDivisions(t *testing.T) {
	parent := shared.IncidentID(uuid.New())
	division := incident.DivisionData{ID: shared.DivisionID(uuid.New()), Name: "D", Description: "desc"}
	closedAt := time.Now()

	state := incidentStateToModel(inbound.IncidentState{
		ID:        shared.IncidentID(uuid.New()),
		Name:      "State",
		ParentID:  &parent,
		Location:  &incident.LocationData{Name: "Ort"},
		Divisions: []incident.DivisionData{division},
		IsClosed:  true,
		ClosedAt:  &closedAt,
	})
	require.NotNil(t, state.ParentID)
	assert.Equal(t, parent.String(), *state.ParentID)
	assert.Equal(t, &model.Location{Name: "Ort"}, state.Location)
	require.Len(t, state.Divisions, 1)
	assert.Equal(t, "desc", state.Divisions[0].Description)
	assert.True(t, state.IsClosed)
	assert.Equal(t, &closedAt, state.ClosedAt)

	result := incidentResultToModel(inbound.CreateIncidentResult{
		IncidentID: shared.IncidentID(uuid.New()),
		ParentID:   &parent,
		Name:       "Result",
		Location:   &incident.LocationData{Name: "Ort"},
		Divisions:  []incident.DivisionData{division},
	})
	require.NotNil(t, result.ParentID)
	assert.Equal(t, parent.String(), *result.ParentID)
	assert.Equal(t, &model.Location{Name: "Ort"}, result.Location)
	require.Len(t, result.Divisions, 1)
	assert.Equal(t, division.ID.String(), result.Divisions[0].ID)
}

func TestMessageRMToModel_MapsAuthorAcknowledgementsAndLinks(t *testing.T) {
	divID, otherDiv, resID := uuid.New(), uuid.New(), uuid.New()
	at := time.Now()
	divs := map[uuid.UUID]*outbound.DivisionRM{divID: {ID: divID, Name: "D"}}

	got := messageRMToModel(&outbound.MessageRM{
		ID:        uuid.New(),
		AuthorSub: "alice",
		Medium:    "RADIO",
		// One division is unknown to the incident and must be skipped, not crash.
		DivisionIDs: []uuid.UUID{divID, otherDiv},
		Acknowledgements: []outbound.AcknowledgementRM{
			{DivisionID: divID, At: at, By: "bob"},
			{DivisionID: otherDiv, At: at, By: "carol"},
		},
		LinkedResourceIDs: []uuid.UUID{resID},
	}, divs)

	require.NotNil(t, got.Author)
	assert.Equal(t, "alice", *got.Author)
	require.Len(t, got.Divisions, 1)
	require.Len(t, got.Acknowledgements, 1)
	assert.Equal(t, "bob", got.Acknowledgements[0].AcknowledgedBy)
	assert.Equal(t, at, got.Acknowledgements[0].AcknowledgedAt)
	assert.Equal(t, []string{resID.String()}, got.LinkedResourceIds)

	anonymous := messageRMToModel(&outbound.MessageRM{ID: uuid.New()}, divs)
	assert.Nil(t, anonymous.Author)
	assert.Empty(t, anonymous.Divisions)
	assert.NotNil(t, anonymous.Divisions)
}

func TestMessageStateToModel_MapsLinksAndAuthor(t *testing.T) {
	resID := shared.ResourceID(uuid.New())

	got := messageStateToModel(inbound.MessageState{
		ID:                shared.MessageID(uuid.New()),
		AuthorSub:         "alice",
		LinkedResourceIDs: []shared.ResourceID{resID},
	})

	require.NotNil(t, got.Author)
	assert.Equal(t, "alice", *got.Author)
	assert.Equal(t, []string{uuid.UUID(resID).String()}, got.LinkedResourceIds)
	assert.Nil(t, messageStateToModel(inbound.MessageState{}).Author)
}

func TestAttachmentRMToModel(t *testing.T) {
	id := uuid.New()

	got := attachmentRMToModel(&outbound.AttachmentRM{
		ID: id, Filename: "plan.pdf", ContentType: "application/pdf", Size: 42, UploaderSub: "alice",
	})

	assert.Equal(t, id.String(), got.ID)
	assert.Equal(t, "plan.pdf", got.Filename)
	assert.Equal(t, 42, got.Size)
	assert.Equal(t, "alice", got.UploadedBy)
	assert.Equal(t, "/api/v2/attachments/"+id.String(), got.URL)
}

func TestResourceRMToModel_MapsEveryOptionalField(t *testing.T) {
	medium, detail, home := "PHONE", "079 000 00 00", "Posten"
	lat, lng := 46.88, 8.64
	pred, succ, src, sp := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	at := time.Now()
	label := "Brücke"

	got := resourceRMToModel(&outbound.ResourceRM{
		ID:               uuid.New(),
		Formation:        "POL",
		Size:             "ZUG",
		Status:           "EINGESETZT",
		ContactMedium:    &medium,
		ContactDetail:    &detail,
		HomeLocationName: &home,
		HomeLocationLat:  &lat,
		HomeLocationLng:  &lng,
		DeploymentLocation: &outbound.DeploymentLocationRM{
			Lat: &lat, Lng: &lng, Label: "Einsatzort",
		},
		PredecessorID:   &pred,
		SuccessorID:     &succ,
		SourceMessageID: &src,
		DeploymentHistory: []outbound.DeploymentPeriodRM{{
			StartedAt: at, EndedAt: &at, SchadenplatzID: sp, Formation: "SAN", Name: "San 1",
			HomeLocationName: &home, DeploymentLabel: &label, Hauptaufgabe: "Erste Hilfe", PersonnelCount: 3,
		}},
	})

	assert.Equal(t, &model.ResourceContact{Medium: model.ContactMediumPhone, Detail: detail}, got.Contact)
	assert.Equal(t, &model.ResourceHomeLocation{Name: home, Lat: &lat, Lng: &lng}, got.HomeLocation)
	assert.Equal(t, &model.DeploymentLocation{Lat: &lat, Lng: &lng, Label: "Einsatzort"}, got.DeploymentLocation)
	assert.Equal(t, pred.String(), *got.PredecessorID)
	assert.Equal(t, succ.String(), *got.SuccessorID)
	assert.Equal(t, src.String(), *got.SourceMessageID)
	require.Len(t, got.DeploymentHistory, 1)
	assert.Equal(t, model.ResourceFormationSan, got.DeploymentHistory[0].Formation)
	assert.Equal(t, sp.String(), got.DeploymentHistory[0].SchadenplatzID)

	// A contact medium without a detail maps to an empty detail.
	bare := resourceRMToModel(&outbound.ResourceRM{ContactMedium: &medium})
	assert.Equal(t, &model.ResourceContact{Medium: model.ContactMediumPhone}, bare.Contact)
	assert.Nil(t, bare.HomeLocation)
	assert.Nil(t, bare.DeploymentLocation)
}

func TestSchadenplatzMapping_MapsGeometryAndMerge(t *testing.T) {
	merged := uuid.New()

	rm := schadenplatzRMToModel(&outbound.SchadenplatzRM{
		ID: uuid.New(), GeoJSON: jsontext.Value(`{"type":"Point"}`), IsMerged: true, MergedInto: &merged,
	})
	require.NotNil(t, rm.GeoJSON)
	assert.JSONEq(t, `{"type":"Point"}`, *rm.GeoJSON)
	require.NotNil(t, rm.MergedInto)
	assert.Equal(t, merged.String(), *rm.MergedInto)

	plain := schadenplatzRMToModel(&outbound.SchadenplatzRM{ID: uuid.New()})
	assert.Nil(t, plain.GeoJSON)
	assert.Nil(t, plain.MergedInto)
}

func TestFeaturesFromGeoJSON_RejectsMalformedGeometryAndProperties(t *testing.T) {
	_, err := featuresFromGeoJSON(jsontext.Value(`{"features":[{"id":"a","geometry":"nope"}]}`))
	require.Error(t, err)

	_, err = featuresFromGeoJSON(jsontext.Value(`{"features":[{"id":"a","properties":"nope"}]}`))
	require.Error(t, err)
}

func TestJSONObject(t *testing.T) {
	assert.Nil(t, jsonObject(nil))
	assert.Nil(t, jsonObject(jsontext.Value(`null`)))
	assert.Nil(t, jsonObject(jsontext.Value(`[1,2]`)), "a value that is not an object yields nil")
	assert.Equal(t, scalar.JSONMap{"a": "b"}, jsonObject(jsontext.Value(`{"a":"b"}`)))
}

func TestWithPlacements_SkipsFeaturesWithoutAPlacementOrAUUID(t *testing.T) {
	placed, unplaced := uuid.New(), uuid.New()
	at := time.Now()
	layers := []*model.Layer{{Features: []*model.Feature{
		{ID: placed.String()},
		{ID: unplaced.String()},
		{ID: "not-a-uuid"},
	}}}

	withPlacements(layers, map[uuid.UUID]time.Time{placed: at})

	assert.Equal(t, &at, layers[0].Features[0].PlacedAt)
	assert.Nil(t, layers[0].Features[1].PlacedAt)
	assert.Nil(t, layers[0].Features[2].PlacedAt)
}

func TestFeatureChangeFromInput(t *testing.T) {
	got, err := featureChangeFromInput(nil)
	require.NoError(t, err)
	assert.Equal(t, inbound.FeatureChange{}, got)

	msg := uuid.New()
	at := time.Now()

	got, err = featureChangeFromInput(&model.FeatureChangeInput{MessageID: new(msg.String()), EffectiveAt: &at})
	require.NoError(t, err)
	require.NotNil(t, got.MessageID)
	assert.Equal(t, shared.MessageID(msg), *got.MessageID)
	assert.Equal(t, &at, got.EffectiveAt)

	_, err = featureChangeFromInput(&model.FeatureChangeInput{MessageID: new("nope")})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}

// A client that selects divisions must get a list, never null, even for an incident without any.
func TestIncidentMappers_NeverReturnNullDivisions(t *testing.T) {
	id := uuid.New()

	assert.NotNil(t, incidentRMToModel(&outbound.IncidentRM{ID: id}).Divisions)
	assert.NotNil(t, incidentStateToModel(inbound.IncidentState{ID: shared.IncidentID(id)}).Divisions)
	assert.NotNil(t, incidentResultToModel(inbound.CreateIncidentResult{IncidentID: shared.IncidentID(id)}).Divisions)
}

func TestSchadenplatzStateToModel_MapsGeometryAndMerge(t *testing.T) {
	merged := shared.SchadenplatzID(uuid.New())

	got := schadenplatzStateToModel(inbound.SchadenplatzState{
		ID: shared.SchadenplatzID(uuid.New()), GeoJSON: []byte(`{"type":"Point"}`), IsMerged: true, MergedInto: &merged,
	})
	require.NotNil(t, got.GeoJSON)
	assert.JSONEq(t, `{"type":"Point"}`, *got.GeoJSON)
	require.NotNil(t, got.MergedInto)
	assert.Equal(t, uuid.UUID(merged).String(), *got.MergedInto)
	assert.True(t, got.IsMerged)
}

func TestReviewToModel_NilReportMapsToNil(t *testing.T) {
	assert.Nil(t, reviewToModel(shared.IncidentID(uuid.New()), nil))
}
