package projection_test

import (
	"maps"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem/projection"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func alertedEvent(res, inc, sp uuid.UUID, extra obj) eventsourcing.Event {
	data := obj{
		"incidentId": inc.String(), "schadenplatzId": sp.String(), "formation": "FW Bern", "name": "Zug 1",
		"size": "ZUG", "personnelCount": 12, "hauptaufgabe": "Loeschen",
	}
	maps.Copy(data, extra)

	return evt("Resource", res, "Alerted", data, tm(0))
}

func TestResourceHandler_Metadata(t *testing.T) {
	h := projection.NewResourceHandler()

	assert.Equal(t, "readmodel.resource", h.Name())
	assert.Positive(t, h.Version())

	for _, typ := range []string{
		"Alerted", "MarkedReady", "Deployed", "StoodDown", "Relieved", "Reactivated",
		"SuccessionLinked", "ReassignedToSchadenplatz", "DeploymentLocationUpdated",
		"HauptaufgabeChanged", "ContactUpdated", "PersonnelCountUpdated", "Renamed",
	} {
		assert.True(t, h.Handles("Resource", typ), typ)
		assert.False(t, h.Handles("Message", typ), "other stream: %s", typ)
	}

	assert.False(t, h.Handles("Resource", "Unknown"))
}

func TestResourceHandler_AlertedOptionalParts(t *testing.T) {
	h := projection.NewResourceHandler()
	res, inc, sp, msg := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, alertedEvent(res, inc, sp, obj{
		"contact":         obj{"medium": "PHONE", "detail": "079"},
		"homeLocation":    obj{"name": "Depot", "coordinates": []float64{46.9, 7.4}},
		"sourceMessageId": msg.String(),
	}))

	row := h.Get(res)
	require.NotNil(t, row)
	assert.Equal(t, "AUFGEBOTEN", row.Status)
	assert.Equal(t, 12, row.PersonnelCount)
	assert.Equal(t, "ZUG", row.Size)
	require.NotNil(t, row.ContactMedium)
	assert.Equal(t, "PHONE", *row.ContactMedium)
	assert.Equal(t, "079", *row.ContactDetail)
	require.NotNil(t, row.HomeLocationName)
	assert.Equal(t, "Depot", *row.HomeLocationName)
	require.NotNil(t, row.HomeLocationLat)
	assert.InDelta(t, 46.9, *row.HomeLocationLat, 1e-9)
	assert.InDelta(t, 7.4, *row.HomeLocationLng, 1e-9)
	require.NotNil(t, row.SourceMessageID)
	assert.Equal(t, msg, *row.SourceMessageID)

	t.Run("a home location without coordinates keeps only the name", func(t *testing.T) {
		h := projection.NewResourceHandler()
		applyAll(t, h, alertedEvent(res, inc, sp, obj{"homeLocation": obj{"name": "Depot"}}))

		row := h.Get(res)
		require.NotNil(t, row.HomeLocationName)
		assert.Nil(t, row.HomeLocationLat)
		assert.Nil(t, row.HomeLocationLng)
		assert.Nil(t, row.ContactMedium)
		assert.Nil(t, row.SourceMessageID)
	})
}

func TestResourceHandler_FieldUpdates(t *testing.T) {
	h := projection.NewResourceHandler()
	res, inc, sp, other, pred := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, alertedEvent(res, inc, sp, nil))

	t.Run("succession link", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "SuccessionLinked", obj{"predecessorId": pred.String()}, tm(1)))

		row := h.Get(res)
		require.NotNil(t, row.PredecessorID)
		assert.Equal(t, pred, *row.PredecessorID)
		assert.Equal(t, tm(1), row.UpdatedAt)
	})

	t.Run("deployment location set then cleared", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "DeploymentLocationUpdated",
			obj{"location": obj{"lat": 1.5, "lng": 2.5, "label": "Bridge"}}, tm(2)))

		row := h.Get(res)
		require.NotNil(t, row.DeploymentLat)
		assert.InDelta(t, 1.5, *row.DeploymentLat, 1e-9)
		assert.InDelta(t, 2.5, *row.DeploymentLng, 1e-9)
		assert.Equal(t, "Bridge", *row.DeploymentLabel)

		applyAll(t, h, evt("Resource", res, "DeploymentLocationUpdated", obj{"location": nil}, tm(3)))

		row = h.Get(res)
		assert.Nil(t, row.DeploymentLat)
		assert.Nil(t, row.DeploymentLng)
		assert.Nil(t, row.DeploymentLabel)
		assert.Equal(t, tm(3), row.UpdatedAt)
	})

	t.Run("main task", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "HauptaufgabeChanged", obj{"hauptaufgabe": "Retten"}, tm(4)))
		assert.Equal(t, "Retten", h.Get(res).Hauptaufgabe)
	})

	t.Run("contact", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "ContactUpdated",
			obj{"contact": obj{"medium": "RADIO", "detail": "ch 4"}}, tm(5)))

		row := h.Get(res)
		assert.Equal(t, "RADIO", *row.ContactMedium)
		assert.Equal(t, "ch 4", *row.ContactDetail)
	})

	t.Run("personnel count keeps the size unless a new one is given", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "PersonnelCountUpdated", obj{"count": 20}, tm(6)))
		assert.Equal(t, 20, h.Get(res).PersonnelCount)
		assert.Equal(t, "ZUG", h.Get(res).Size)

		applyAll(t, h, evt("Resource", res, "PersonnelCountUpdated", obj{"count": 40, "size": "KOMPANIE"}, tm(7)))
		assert.Equal(t, 40, h.Get(res).PersonnelCount)
		assert.Equal(t, "KOMPANIE", h.Get(res).Size)
	})

	t.Run("rename", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "Renamed", obj{"name": "Zug 2"}, tm(8)))
		assert.Equal(t, "Zug 2", h.Get(res).Name)
		assert.Equal(t, tm(8), h.Get(res).UpdatedAt)
	})

	t.Run("reassign", func(t *testing.T) {
		applyAll(t, h, evt("Resource", res, "ReassignedToSchadenplatz", obj{"schadenplatzId": other.String()}, tm(9)))
		assert.Equal(t, other, h.Get(res).SchadenplatzID)
	})
}

func TestResourceHandler_DeploymentHistoryRecordsTheContextAtDeployTime(t *testing.T) {
	h := projection.NewResourceHandler()
	res, inc, sp := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h,
		alertedEvent(res, inc, sp, obj{"homeLocation": obj{"name": "Depot"}}),
		evt("Resource", res, "Deployed", obj{"deploymentLocation": obj{"label": "Site A"}}, tm(1)),
		evt("Resource", res, "StoodDown", obj{}, tm(2)),
		evt("Resource", res, "Deployed", obj{}, tm(3)),
	)

	row := h.Get(res)
	require.Len(t, row.DeploymentHistory, 2)

	first := row.DeploymentHistory[0]
	assert.Equal(t, tm(1), first.StartedAt)
	require.NotNil(t, first.EndedAt)
	assert.Equal(t, tm(2), *first.EndedAt)
	assert.Equal(t, sp, first.SchadenplatzID)
	assert.Equal(t, "FW Bern", first.Formation)
	assert.Equal(t, "Zug 1", first.Name)
	assert.Equal(t, "Loeschen", first.Hauptaufgabe)
	assert.Equal(t, 12, first.PersonnelCount)
	require.NotNil(t, first.DeploymentLabel)
	assert.Equal(t, "Site A", *first.DeploymentLabel)
	require.NotNil(t, first.HomeLocationName)
	assert.Equal(t, "Depot", *first.HomeLocationName)

	second := row.DeploymentHistory[1]
	assert.Nil(t, second.EndedAt)
	assert.Nil(t, second.DeploymentLabel, "no deployment location given")
	assert.Empty(t, second.Hauptaufgabe, "stand-down cleared the main task before the second deployment")
	assert.Equal(t, "EINGESETZT", row.Status)

	require.NotNil(t, row.StoodDownAt)
	assert.Equal(t, tm(2), *row.StoodDownAt)
	require.NotNil(t, row.DeployedAt)
	assert.Equal(t, tm(1), *row.DeployedAt, "first deployment time is kept")
}

func TestResourceHandler_EventsForUnknownResourceAreIgnored(t *testing.T) {
	h := projection.NewResourceHandler()
	res := uuid.New()

	applyAll(t, h,
		evt("Resource", res, "MarkedReady", obj{}, tm(0)),
		evt("Resource", res, "Deployed", obj{}, tm(0)),
		evt("Resource", res, "StoodDown", obj{}, tm(0)),
		evt("Resource", res, "Relieved", obj{}, tm(0)),
		evt("Resource", res, "Reactivated", obj{"schadenplatzId": uuid.NewString()}, tm(0)),
		evt("Resource", res, "SuccessionLinked", obj{"predecessorId": uuid.NewString()}, tm(0)),
		evt("Resource", res, "ReassignedToSchadenplatz", obj{"schadenplatzId": uuid.NewString()}, tm(0)),
		evt("Resource", res, "DeploymentLocationUpdated", obj{}, tm(0)),
		evt("Resource", res, "HauptaufgabeChanged", obj{}, tm(0)),
		evt("Resource", res, "ContactUpdated", obj{}, tm(0)),
		evt("Resource", res, "PersonnelCountUpdated", obj{}, tm(0)),
		evt("Resource", res, "Renamed", obj{}, tm(0)),
	)

	assert.Nil(t, h.Get(res))
}

func TestResourceHandler_MalformedPayloads(t *testing.T) {
	res, inc, sp := uuid.New(), uuid.New(), uuid.New()

	tests := []struct {
		name  string
		event eventsourcing.Event
	}{
		{"alerted undecodable", evt("Resource", res, "Alerted", "x", tm(0))},
		{"alerted bad incident id", alertedEvent(res, uuid.Nil, sp, obj{"incidentId": "nope"})},
		{"alerted bad schadenplatz id", alertedEvent(res, inc, uuid.Nil, obj{"schadenplatzId": "nope"})},
		{"alerted bad source message id", alertedEvent(res, inc, sp, obj{"sourceMessageId": "nope"})},
		{"deployed undecodable", evt("Resource", res, "Deployed", "x", tm(0))},
		{"relieved undecodable", evt("Resource", res, "Relieved", "x", tm(0))},
		{"reactivated undecodable", evt("Resource", res, "Reactivated", "x", tm(0))},
		{"reactivated bad id", evt("Resource", res, "Reactivated", obj{"schadenplatzId": "nope"}, tm(0))},
		{"succession undecodable", evt("Resource", res, "SuccessionLinked", "x", tm(0))},
		{"succession bad id", evt("Resource", res, "SuccessionLinked", obj{"predecessorId": "nope"}, tm(0))},
		{"reassigned undecodable", evt("Resource", res, "ReassignedToSchadenplatz", "x", tm(0))},
		{"reassigned bad id", evt("Resource", res, "ReassignedToSchadenplatz", obj{"schadenplatzId": "nope"}, tm(0))},
		{"location undecodable", evt("Resource", res, "DeploymentLocationUpdated", "x", tm(0))},
		{"main task undecodable", evt("Resource", res, "HauptaufgabeChanged", "x", tm(0))},
		{"contact undecodable", evt("Resource", res, "ContactUpdated", "x", tm(0))},
		{"count undecodable", evt("Resource", res, "PersonnelCountUpdated", "x", tm(0))},
		{"rename undecodable", evt("Resource", res, "Renamed", "x", tm(0))},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := projection.NewResourceHandler()
			require.Error(t, h.Apply(t.Context(), tc.event))
			assert.Nil(t, h.Get(res), "a failed Alerted must not leave a row behind")
		})
	}

	t.Run("a bad successor id leaves the successor unset", func(t *testing.T) {
		h := projection.NewResourceHandler()
		applyAll(t, h, alertedEvent(res, inc, sp, nil))
		require.Error(t, h.Apply(t.Context(), evt("Resource", res, "Relieved", obj{"successorId": "nope"}, tm(1))))
		assert.Nil(t, h.Get(res).SuccessorID)
	})
}

func TestResourceHandler_ResetClearsRows(t *testing.T) {
	h := projection.NewResourceHandler()
	res, inc, sp := uuid.New(), uuid.New(), uuid.New()

	applyAll(t, h, alertedEvent(res, inc, sp, nil))
	require.NoError(t, h.Reset(t.Context()))

	assert.Nil(t, h.Get(res))
	assert.Empty(t, h.ForIncident(inc))
	assert.Empty(t, h.ForSchadenplatz(sp))
}
