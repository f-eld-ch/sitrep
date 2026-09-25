package resource_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/resource"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	at             = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	actor          = "test-actor"
	incidentID     = shared.IncidentID(uuid.New())
	schadenplatzID = shared.SchadenplatzID(uuid.New())
)

// replay rebuilds an aggregate from a slice of persisted events.
func replay(t *testing.T, id shared.ResourceID, events []eventsourcing.Event) *resource.Resource {
	t.Helper()

	r := resource.New(id)
	for _, e := range events {
		require.NoError(t, eventsourcing.Apply(r, e))
	}

	return r
}

// alerted returns an Alerted event for a resource with sane defaults.
func alerted(id shared.ResourceID) eventsourcing.Event {
	r := resource.New(id)

	err := r.Alert(incidentID, schadenplatzID,
		resource.FormationFW, "Gruppe Alpha", resource.UnitSizeGruppe, 9,
		"Brandbekämpfung", nil, nil, nil, actor, at)
	if err != nil {
		panic(err)
	}

	return r.Root().PendingEvents()[0]
}

// ──────────────────────────────────────────────────────────────────────────────
// Alert
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_Alert(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	t.Run("valid alert emits Alerted event", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "Gruppe Alpha", resource.UnitSizeGruppe, 9,
			"Brandbekämpfung", nil, nil, nil, actor, at)
		require.NoError(t, err)
		assert.Len(t, r.Root().PendingEvents(), 1)
		assert.Equal(t, resource.StatusAufgeboten, r.Status())
	})

	t.Run("empty name is rejected", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "", resource.UnitSizeGruppe, 9,
			"", nil, nil, nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
		assert.Empty(t, r.Root().PendingEvents())
	})

	t.Run("whitespace name is rejected", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "   ", resource.UnitSizeGruppe, 9,
			"", nil, nil, nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("invalid formation is rejected", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			"UNKNOWN", "Name", resource.UnitSizeGruppe, 9,
			"", nil, nil, nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("invalid unit size is rejected", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "Name", "UNKNOWN", 9,
			"", nil, nil, nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("zero personnel count is rejected", func(t *testing.T) {
		r := resource.New(id)
		err := r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "Name", resource.UnitSizeGruppe, 0,
			"", nil, nil, nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("sets incident and schadenplatz IDs", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		assert.Equal(t, incidentID, r.IncidentID())
		assert.Equal(t, schadenplatzID, r.SchadenplatzID())
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// State machine
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_StateMachine(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	t.Run("MarkReady from AUFGEBOTEN succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		assert.Equal(t, resource.StatusEinsatzbereit, r.Status())
	})

	t.Run("MarkReady from EINSATZBEREIT is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		err := r.MarkReady(actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("Deploy from EINSATZBEREIT succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.Deploy(actor, at))
		assert.Equal(t, resource.StatusEingesetzt, r.Status())
	})

	t.Run("Deploy from AUFGEBOTEN is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		err := r.Deploy(actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("StandDown from EINGESETZT returns to EINSATZBEREIT", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.Deploy(actor, at))
		require.NoError(t, r.StandDown(actor, at))
		assert.Equal(t, resource.StatusEinsatzbereit, r.Status())
	})

	t.Run("StandDown from AUFGEBOTEN is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		err := r.StandDown(actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("StandDown from EINSATZBEREIT is idempotent", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.StandDown(actor, at))
		assert.Equal(t, resource.StatusEinsatzbereit, r.Status())
		assert.Equal(t, 1, r.Root().Version())
	})

	t.Run("Relieve from AUFGEBOTEN succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.Relieve(nil, actor, at))
		assert.Equal(t, resource.StatusAbgeloest, r.Status())
		assert.True(t, r.IsRelieved())
	})

	t.Run("Relieve from EINGESETZT succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.Deploy(actor, at))
		require.NoError(t, r.Relieve(nil, actor, at))
		assert.Equal(t, resource.StatusAbgeloest, r.Status())
	})

	t.Run("Relieve from EINSATZBEREIT succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.Relieve(nil, actor, at))
		assert.Equal(t, resource.StatusAbgeloest, r.Status())
	})

	t.Run("Relieve twice is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.Relieve(nil, actor, at))
		err := r.Relieve(nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("Relieve with successor ID records it", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		successorID := shared.ResourceID(uuid.New())
		require.NoError(t, r.Relieve(&successorID, actor, at))
		assert.Equal(t, &successorID, r.SuccessorID())
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Reassign
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_Reassign(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	t.Run("reassign to different Schadenplatz succeeds", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		newSP := shared.SchadenplatzID(uuid.New())
		require.NoError(t, r.Reassign(newSP, actor, at))
		assert.Equal(t, newSP, r.SchadenplatzID())
	})

	t.Run("reassign to same Schadenplatz is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		err := r.Reassign(schadenplatzID, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("reassign a relieved resource is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.Relieve(nil, actor, at))

		newSP := shared.SchadenplatzID(uuid.New())
		err := r.Reassign(newSP, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Succession
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_LinkSuccession(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	t.Run("link succession sets predecessorID", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		predID := shared.ResourceID(uuid.New())
		require.NoError(t, r.LinkSuccession(predID, actor, at))
		assert.Equal(t, &predID, r.PredecessorID())
	})

	t.Run("linking twice is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		predID := shared.ResourceID(uuid.New())
		require.NoError(t, r.LinkSuccession(predID, actor, at))
		err := r.LinkSuccession(predID, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Update commands on relieved resource
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_UpdatesRejectedWhenRelieved(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	relievedEvents := func() []eventsourcing.Event {
		r := resource.New(id)
		_ = r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "Alpha", resource.UnitSizeGruppe, 9,
			"", nil, nil, nil, actor, at)
		_ = r.Relieve(nil, actor, at)

		return r.Root().PendingEvents()
	}()

	t.Run("UpdateDeploymentLocation rejected", func(t *testing.T) {
		r := replay(t, id, relievedEvents)
		err := r.UpdateDeploymentLocation(nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("ChangeHauptaufgabe rejected", func(t *testing.T) {
		r := replay(t, id, relievedEvents)
		err := r.ChangeHauptaufgabe("new task", actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("UpdateContact rejected", func(t *testing.T) {
		r := replay(t, id, relievedEvents)
		err := r.UpdateContact(resource.Contact{Medium: resource.ContactMediumRadio, Detail: "ch1"}, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("UpdatePersonnelCount rejected", func(t *testing.T) {
		r := replay(t, id, relievedEvents)
		err := r.UpdatePersonnelCount(5, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// PersonnelCount validation
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_UpdatePersonnelCount(t *testing.T) {
	id := shared.ResourceID(uuid.New())

	t.Run("zero count is rejected", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		err := r.UpdatePersonnelCount(0, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("positive count is accepted", func(t *testing.T) {
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.UpdatePersonnelCount(5, actor, at))
		assert.Equal(t, 5, r.PersonnelCount())
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// UnitSize helpers
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_UnitSizeForCount(t *testing.T) {
	tests := []struct {
		count    int
		wantSize resource.UnitSize
	}{
		{1, resource.UnitSizeTrupp},
		{2, resource.UnitSizeTrupp},
		{3, resource.UnitSizeGruppe},
		{12, resource.UnitSizeGruppe},
		{13, resource.UnitSizeZug},
		{60, resource.UnitSizeZug},
		{61, resource.UnitSizeKompanie},
		{300, resource.UnitSizeKompanie},
		{301, resource.UnitSizeBataillon},
		{1000, resource.UnitSizeBataillon},
	}

	for _, tt := range tests {
		got := resource.UnitSizeForCount(tt.count)
		assert.Equal(t, tt.wantSize, got, "count=%d", tt.count)
	}
}

func TestResource_SizeMismatch(t *testing.T) {
	assert.False(t, resource.SizeMismatch(resource.UnitSizeGruppe, 9))
	assert.True(t, resource.SizeMismatch(resource.UnitSizeGruppe, 1))
	assert.True(t, resource.SizeMismatch(resource.UnitSizeGruppe, 100))
	assert.False(t, resource.SizeMismatch(resource.UnitSizeBataillon, 500))
}

// ──────────────────────────────────────────────────────────────────────────────
// Identity and type
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_AggregateType(t *testing.T) {
	id := shared.ResourceID(uuid.New())
	r := resource.New(id)
	assert.Equal(t, "Resource", r.AggregateType())
}

func TestResource_IDMatchesConstructorArg(t *testing.T) {
	id := shared.ResourceID(uuid.New())
	r := resource.New(id)
	assert.Equal(t, id, r.ID())
}

func TestResource_OwnerIncidentID(t *testing.T) {
	id := shared.ResourceID(uuid.New())
	r := replay(t, id, []eventsourcing.Event{alerted(id)})
	assert.Equal(t, incidentID, shared.IncidentID(r.OwnerIncidentID()))
}

// ──────────────────────────────────────────────────────────────────────────────
// TakeOver
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_TakeOver(t *testing.T) {
	predID := shared.ResourceID(uuid.New())

	lat, lng := 46.8, 8.2
	loc := &resource.DeploymentLocation{Lat: &lat, Lng: &lng, Label: "Nordzugang"}

	t.Run("AUFGEBOTEN successor advances to EINGESETZT via EINSATZBEREIT", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.Equal(t, resource.StatusAufgeboten, r.Status())

		err := r.TakeOver(predID, "Brandbekämpfung", nil, actor, at)
		require.NoError(t, err)

		assert.Equal(t, resource.StatusEingesetzt, r.Status())
		require.NotNil(t, r.PredecessorID())
		assert.Equal(t, predID, *r.PredecessorID())
	})

	t.Run("EINSATZBEREIT successor advances to EINGESETZT without extra MarkedReady", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.Equal(t, resource.StatusEinsatzbereit, r.Status())

		pendingBefore := len(r.Root().PendingEvents())

		err := r.TakeOver(predID, "Brandbekämpfung", nil, actor, at)
		require.NoError(t, err)

		assert.Equal(t, resource.StatusEingesetzt, r.Status())

		// TakeOver on EINSATZBEREIT must emit: SuccessionLinked, HauptaufgabeChanged, Deployed (3 events)
		// Not MarkedReady — it was already ready.
		pendingAdded := len(r.Root().PendingEvents()) - pendingBefore
		assert.Equal(t, 3, pendingAdded, "EINSATZBEREIT successor must not re-emit MarkedReady")
	})

	t.Run("hauptaufgabe is inherited when non-empty", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})

		require.NoError(t, r.TakeOver(predID, "Evakuierung", nil, actor, at))

		assert.Equal(t, "Evakuierung", r.Hauptaufgabe())
	})

	t.Run("empty hauptaufgabe is not overwritten", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})

		require.NoError(t, r.TakeOver(predID, "", nil, actor, at))

		// The resource keeps its own alerted hauptaufgabe ("Brandbekämpfung" from alerted fixture).
		// An empty predecessor hauptaufgabe must not emit HauptaufgabeChanged.
		assert.Equal(t, "Brandbekämpfung", r.Hauptaufgabe())
	})

	t.Run("deployment location is inherited when non-nil", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})

		require.NoError(t, r.TakeOver(predID, "Brandbekämpfung", loc, actor, at))

		require.NotNil(t, r.DeploymentLocation())
		assert.Equal(t, loc.Label, r.DeploymentLocation().Label)
	})

	t.Run("nil deployment location is not set", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})

		require.NoError(t, r.TakeOver(predID, "Brandbekämpfung", nil, actor, at))

		assert.Nil(t, r.DeploymentLocation())
	})

	t.Run("ABGELOEST successor is rejected", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.Relieve(nil, actor, at))

		err := r.TakeOver(predID, "", nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("EINGESETZT successor is rejected", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		require.NoError(t, r.MarkReady(actor, at))
		require.NoError(t, r.Deploy(actor, at))

		err := r.TakeOver(predID, "", nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("successor already linked to a predecessor is rejected", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := replay(t, id, []eventsourcing.Event{alerted(id)})
		existingPred := shared.ResourceID(uuid.New())
		require.NoError(t, r.LinkSuccession(existingPred, actor, at))

		err := r.TakeOver(predID, "", nil, actor, at)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("state survives full event round-trip", func(t *testing.T) {
		id := shared.ResourceID(uuid.New())
		r := resource.New(id)
		require.NoError(t, r.Alert(incidentID, schadenplatzID,
			resource.FormationFW, "Gruppe Alpha", resource.UnitSizeGruppe, 9,
			"Brandbekämpfung", nil, nil, nil, actor, at))
		require.NoError(t, r.TakeOver(predID, "Evakuierung", loc, actor, at))

		events := r.Root().PendingEvents()
		r2 := replay(t, id, events)

		assert.Equal(t, resource.StatusEingesetzt, r2.Status())
		require.NotNil(t, r2.PredecessorID())
		assert.Equal(t, predID, *r2.PredecessorID())
		assert.Equal(t, "Evakuierung", r2.Hauptaufgabe())
		require.NotNil(t, r2.DeploymentLocation())
		assert.Equal(t, loc.Label, r2.DeploymentLocation().Label)
		assert.NotNil(t, r2.EinsatzBeginn(), "EinsatzBeginn must be recorded on first deploy")
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Full replay round-trip
// ──────────────────────────────────────────────────────────────────────────────

func TestResource_FullReplay(t *testing.T) {
	id := shared.ResourceID(uuid.New())
	predID := shared.ResourceID(uuid.New())
	newSP := shared.SchadenplatzID(uuid.New())
	lat, lng := 46.8, 8.2
	loc := &resource.DeploymentLocation{Lat: &lat, Lng: &lng, Label: "Nordzugang"}
	contact := resource.Contact{Medium: resource.ContactMediumRadio, Detail: "CH-1"}

	r := resource.New(id)
	require.NoError(t, r.Alert(incidentID, schadenplatzID,
		resource.FormationSAN, "Med-1", resource.UnitSizeTrupp, 2,
		"Erstversorgung", &contact, nil, nil, actor, at))
	require.NoError(t, r.LinkSuccession(predID, actor, at))
	require.NoError(t, r.MarkReady(actor, at))
	require.NoError(t, r.Deploy(actor, at))
	require.NoError(t, r.UpdateDeploymentLocation(loc, actor, at))
	require.NoError(t, r.StandDown(actor, at))
	require.NoError(t, r.Reassign(newSP, actor, at))
	require.NoError(t, r.ChangeHauptaufgabe("Folgeversorgung", actor, at))
	require.NoError(t, r.UpdatePersonnelCount(1, actor, at))

	events := r.Root().PendingEvents()

	r2 := replay(t, id, events)

	assert.Equal(t, resource.StatusEinsatzbereit, r2.Status())
	assert.Equal(t, newSP, r2.SchadenplatzID())
	assert.Equal(t, "Folgeversorgung", r2.Hauptaufgabe())
	assert.Equal(t, 1, r2.PersonnelCount())
	assert.Nil(t, r2.DeploymentLocation())
	assert.NotNil(t, r2.EinsatzBeginn())
	assert.Equal(t, &predID, r2.PredecessorID())
}
