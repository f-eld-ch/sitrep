package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestIncidentService_CreateIncident(t *testing.T) {
	t.Run("creates incident and returns IDs", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, err := svc.CreateIncident(ctx(), "Hochwasser", nil, nil, nil, testActor)
		require.NoError(t, err)
		assert.NotEqual(t, shared.IncidentID{}, result.IncidentID)
		// default layer created when no layerNames supplied
		assert.Len(t, result.LayerIDs, 1)
	})

	t.Run("creates requested layers", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, err := svc.CreateIncident(ctx(), "Brand", nil, nil, []string{"Lage", "Rettung"}, testActor)
		require.NoError(t, err)
		assert.Len(t, result.LayerIDs, 2)
	})

	t.Run("incident is loadable after creation", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, err := svc.CreateIncident(ctx(), "Sturm", nil, nil, nil, testActor)
		require.NoError(t, err)

		inc, err := svc.LoadIncident(ctx(), result.IncidentID)
		require.NoError(t, err)
		assert.True(t, inc.IsOpen())
		assert.Equal(t, "Sturm", inc.Name())
	})

	t.Run("creates divisions on incident", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		divs := []incident.DivisionData{
			{Name: "Feuerwehr Alpha", Description: "Löschzug 1"},
			{Name: "Polizei Beta", Description: "Streife"},
		}
		result, err := svc.CreateIncident(ctx(), "Massenanfall", nil, divs, nil, testActor)
		require.NoError(t, err)

		inc, err := svc.LoadIncident(ctx(), result.IncidentID)
		require.NoError(t, err)
		assert.Len(t, inc.Divisions(), 2)
	})

	t.Run("creates child incident with parent atomically", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "KFS", nil, nil, nil, testActor)
		require.NoError(t, err)

		result, err := svc.CreateIncidentWithParent(
			ctx(),
			"GFS Altdorf",
			nil,
			nil,
			nil,
			&parent.IncidentID,
			testActor,
		)
		require.NoError(t, err)
		require.NotNil(t, result.ParentID)
		assert.Equal(t, parent.IncidentID, *result.ParentID)

		child, err := svc.LoadIncident(ctx(), result.IncidentID)
		require.NoError(t, err)
		require.NotNil(t, child.ParentID())
		assert.Equal(t, parent.IncidentID, *child.ParentID())
	})
}

func TestIncidentService_CloseAndReopen(t *testing.T) {
	t.Run("close then reopen", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, err := svc.CreateIncident(ctx(), "Unfall", nil, nil, nil, testActor)
		require.NoError(t, err)

		id := result.IncidentID

		_, err = svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err := svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.False(t, inc.IsOpen())

		_, err = svc.ReopenIncident(ctx(), id, testActor)
		require.NoError(t, err)

		inc, err = svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.True(t, inc.IsOpen())
	})

	t.Run("closing an already-closed incident fails", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, _ := svc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		_, err := svc.CloseIncident(ctx(), result.IncidentID, testActor)
		require.NoError(t, err)

		_, err = svc.CloseIncident(ctx(), result.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrAlreadyClosed)
	})

	t.Run("reopening an open incident fails", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, _ := svc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)

		_, err := svc.ReopenIncident(ctx(), result.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrAlreadyOpen)
	})
}

func TestIncidentService_Delete(t *testing.T) {
	t.Run("delete requires closed incident", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, _ := svc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)

		err := svc.DeleteIncident(ctx(), result.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentNotClosed)
	})

	t.Run("delete succeeds after close", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		result, _ := svc.CreateIncident(ctx(), "Test", nil, nil, nil, testActor)
		id := result.IncidentID
		_, err := svc.CloseIncident(ctx(), id, testActor)
		require.NoError(t, err)
		require.NoError(t, svc.DeleteIncident(ctx(), id, testActor))

		inc, err := svc.LoadIncident(ctx(), id)
		require.NoError(t, err)
		assert.True(t, inc.IsDeleted())
	})
}

func TestIncidentService_LinkIncidentParent(t *testing.T) {
	t.Run("links and unlinks child parent", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)

		linked, err := svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
		require.NoError(t, err)
		require.NotNil(t, linked.ParentID)
		assert.Equal(t, parent.IncidentID, *linked.ParentID)

		loaded, err := svc.LoadIncident(ctx(), child.IncidentID)
		require.NoError(t, err)
		require.NotNil(t, loaded.ParentID())
		assert.Equal(t, parent.IncidentID, *loaded.ParentID())

		unlinked, err := svc.UnlinkIncidentParent(ctx(), child.IncidentID, testActor)
		require.NoError(t, err)
		assert.Nil(t, unlinked.ParentID)
	})

	t.Run("missing parent is rejected", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), child.IncidentID, shared.IncidentID(newID()), testActor)
		assert.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("closed parent is allowed", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)
		_, err = svc.CloseIncident(ctx(), parent.IncidentID, testActor)
		require.NoError(t, err)

		linked, err := svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
		require.NoError(t, err)
		require.NotNil(t, linked.ParentID)
		assert.Equal(t, parent.IncidentID, *linked.ParentID)
	})

	t.Run("deleted parent is rejected", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)
		_, err = svc.CloseIncident(ctx(), parent.IncidentID, testActor)
		require.NoError(t, err)
		require.NoError(t, svc.DeleteIncident(ctx(), parent.IncidentID, testActor))

		_, err = svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentDeleted)
	})

	t.Run("parent that already has a parent is rejected", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		root, err := svc.CreateIncident(ctx(), "KFS", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "GFS Altdorf", nil, nil, nil, testActor)
		require.NoError(t, err)
		grandchild, err := svc.CreateIncident(ctx(), "GFS Ahausen", nil, nil, nil, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), child.IncidentID, root.IncidentID, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), grandchild.IncidentID, child.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrInvalidParent)
	})

	t.Run("closed child is rejected", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)
		_, err = svc.CloseIncident(ctx(), child.IncidentID, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrIncidentNotOpen)
	})

	t.Run("using an existing child as a parent is rejected", func(t *testing.T) {
		factory, store := testStack(t)
		incidents, _, layers, _ := repos(store)
		svc := factory.IncidentService(incidents, layers)

		parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
		require.NoError(t, err)
		child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
		require.NoError(t, err)

		_, err = svc.LinkIncidentParent(ctx(), parent.IncidentID, child.IncidentID, testActor)
		assert.ErrorIs(t, err, shared.ErrInvalidParent)
	})
}

func TestIncidentService_LoadUnknown(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, _ := repos(store)
	svc := factory.IncidentService(incidents, layers)

	_, err := svc.LoadIncident(ctx(), shared.IncidentID(newID()))
	assert.ErrorIs(t, err, shared.ErrNotFound)
}

func TestIncidentService_UpdateDivisions(t *testing.T) {
	factory, store := testStack(t)
	incidents, _, layers, _ := repos(store)
	svc := factory.IncidentService(incidents, layers)

	result, err := svc.CreateIncident(ctx(), "Übung", nil, nil, nil, testActor)
	require.NoError(t, err)

	id := result.IncidentID

	newName := "Führungsstab"
	divs := []incident.DivisionData{{Name: newName, Description: "HQ"}}
	_, err = svc.UpdateIncident(ctx(), id, nil, nil, divs, testActor)
	require.NoError(t, err)

	inc, err := svc.LoadIncident(ctx(), id)
	require.NoError(t, err)

	if assert.Len(t, inc.Divisions(), 1) {
		assert.Equal(t, newName, inc.Divisions()[0].Name)
	}
}
