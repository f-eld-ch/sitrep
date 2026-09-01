package graphql

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// ─────────────────────────────────────────────────────────────────────────────
// featuresFromGeoJSON
// ─────────────────────────────────────────────────────────────────────────────

func TestFeaturesFromGeoJSON_Empty(t *testing.T) {
	features, err := featuresFromGeoJSON(nil)
	require.NoError(t, err)
	assert.Empty(t, features)
}

func TestFeaturesFromGeoJSON_ValidCollection(t *testing.T) {
	raw := json.RawMessage(`{
		"type": "FeatureCollection",
		"features": [
			{
				"type": "Feature",
				"id": "abc123",
				"geometry": {"type":"Point","coordinates":[8.5,47.3]},
				"properties": {"label":"HQ"}
			}
		]
	}`)

	features, err := featuresFromGeoJSON(raw)
	require.NoError(t, err)
	require.Len(t, features, 1)
	assert.Equal(t, "abc123", features[0].ID)
	assert.Equal(t, "Point", features[0].Geometry["type"])
	assert.Equal(t, "HQ", features[0].Properties["label"])
}

func TestFeaturesFromGeoJSON_MultipleFeatures(t *testing.T) {
	raw := json.RawMessage(`{
		"type": "FeatureCollection",
		"features": [
			{"type":"Feature","id":"f1","geometry":{"type":"Point","coordinates":[0,0]},"properties":{}},
			{"type":"Feature","id":"f2","geometry":{"type":"Point","coordinates":[1,1]},"properties":{}}
		]
	}`)

	features, err := featuresFromGeoJSON(raw)
	require.NoError(t, err)
	assert.Len(t, features, 2)
}

func TestFeaturesFromGeoJSON_NullGeometry(t *testing.T) {
	raw := json.RawMessage(`{
		"type": "FeatureCollection",
		"features": [{"type":"Feature","id":"f1","geometry":null,"properties":null}]
	}`)

	features, err := featuresFromGeoJSON(raw)
	require.NoError(t, err)
	require.Len(t, features, 1)
	assert.Equal(t, "f1", features[0].ID)
	assert.Nil(t, features[0].Geometry)
	assert.Nil(t, features[0].Properties)
}

func TestFeaturesFromGeoJSON_InvalidJSON_ReturnsError(t *testing.T) {
	_, err := featuresFromGeoJSON(json.RawMessage(`{not valid json`))
	require.Error(t, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// layerRMToModel
// ─────────────────────────────────────────────────────────────────────────────

func TestLayerRMToModel_WithFeatures(t *testing.T) {
	rm := &outbound.LayerRM{
		ID:   uuid.New(),
		Name: "Ops Map",
		GeoJSON: json.RawMessage(`{
			"type": "FeatureCollection",
			"features": [
				{"type":"Feature","id":"feat-1","geometry":{"type":"Point","coordinates":[0,0]},"properties":{"x":1}}
			]
		}`),
		Revision: 3,
	}

	layer, err := layerRMToModel(rm)
	require.NoError(t, err)
	assert.Equal(t, rm.ID.String(), layer.ID)
	assert.Equal(t, "Ops Map", layer.Name)
	assert.Equal(t, 3, layer.Revision)
	require.Len(t, layer.Features, 1)
	assert.Equal(t, "feat-1", layer.Features[0].ID)
}

func TestLayerRMToModel_EmptyGeoJSON(t *testing.T) {
	rm := &outbound.LayerRM{
		ID:      uuid.New(),
		Name:    "Empty",
		GeoJSON: json.RawMessage(`{"type":"FeatureCollection","features":[]}`),
	}

	layer, err := layerRMToModel(rm)
	require.NoError(t, err)
	assert.Empty(t, layer.Features)
}

func TestLayerRMToModel_InvalidGeoJSON_ReturnsError(t *testing.T) {
	rm := &outbound.LayerRM{
		ID:      uuid.New(),
		Name:    "Bad",
		GeoJSON: json.RawMessage(`{bad`),
	}

	_, err := layerRMToModel(rm)
	require.Error(t, err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum mappers — outbound (domain → model)
// ─────────────────────────────────────────────────────────────────────────────

func TestMapMedium(t *testing.T) {
	cases := []struct {
		in   string
		want model.Medium
	}{
		{"RADIO", model.MediumRadio},
		{"PHONE", model.MediumPhone},
		{"EMAIL", model.MediumEmail},
		{"OTHER", model.MediumOther},
		{"unknown", model.MediumOther},
		{"", model.MediumOther},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, mapMedium(c.in), "input %q", c.in)
	}
}

func TestMapTriageStatus(t *testing.T) {
	cases := []struct {
		in   string
		want model.TriageStatus
	}{
		{"DONE", model.TriageStatusDone},
		{"MOREINFO", model.TriageStatusMoreinfo},
		{"RESET", model.TriageStatusReset},
		{"PENDING", model.TriageStatusPending},
		{"unknown", model.TriageStatusPending},
		{"", model.TriageStatusPending},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, mapTriageStatus(c.in), "input %q", c.in)
	}
}

func TestMapPriorityStatus(t *testing.T) {
	cases := []struct {
		in   string
		want model.PriorityStatus
	}{
		{"HIGH", model.PriorityStatusHigh},
		{"NORMAL", model.PriorityStatusNormal},
		{"unknown", model.PriorityStatusNormal},
		{"", model.PriorityStatusNormal},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, mapPriorityStatus(c.in), "input %q", c.in)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum mappers — inbound (model → domain)
// ─────────────────────────────────────────────────────────────────────────────

func TestModelMediumToDomain_AllValues(t *testing.T) {
	for _, m := range model.AllMedium {
		_, err := modelMediumToDomain(m)
		assert.NoError(t, err, "medium %q must convert without error", m)
	}
}

func TestModelMediumToDomain_UnknownReturnsError(t *testing.T) {
	_, err := modelMediumToDomain(model.Medium("FAX"))
	require.Error(t, err)
}

func TestModelTriageToDomain_AllValues(t *testing.T) {
	for _, s := range model.AllTriageStatus {
		_, err := modelTriageToDomain(s)
		assert.NoError(t, err, "triage %q must convert without error", s)
	}
}

func TestModelTriageToDomain_UnknownReturnsError(t *testing.T) {
	_, err := modelTriageToDomain(model.TriageStatus("MAYBE"))
	require.Error(t, err)
}

func TestModelPriorityToDomain_AllValues(t *testing.T) {
	for _, p := range model.AllPriorityStatus {
		_, err := modelPriorityToDomain(p)
		assert.NoError(t, err, "priority %q must convert without error", p)
	}
}

func TestModelPriorityToDomain_UnknownReturnsError(t *testing.T) {
	_, err := modelPriorityToDomain(model.PriorityStatus("CRITICAL"))
	require.Error(t, err)
}
