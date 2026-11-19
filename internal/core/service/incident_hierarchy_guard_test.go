package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// Without an IncidentHierarchyGuard the two-level rule cannot be checked across streams, so a
// parent link is refused with an error. It must not panic, and it must not write the link.
func TestIncidentService_ParentLinksNeedAHierarchyGuard(t *testing.T) {
	store := inmem.NewEventStore()
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
	)
	incidents, _, layers, _ := repos(store)
	svc := factory.IncidentService(incidents, layers)

	parent, err := svc.CreateIncident(ctx(), "Regional", nil, nil, nil, testActor)
	require.NoError(t, err)
	child, err := svc.CreateIncident(ctx(), "Municipal", nil, nil, nil, testActor)
	require.NoError(t, err)

	t.Run("creating a child", func(t *testing.T) {
		require.NotPanics(t, func() {
			_, err := svc.CreateIncidentWithParent(ctx(), "Child", nil, nil, nil, &parent.IncidentID, testActor)
			require.ErrorContains(t, err, "hierarchy guard")
		})
	})

	t.Run("linking an existing incident", func(t *testing.T) {
		require.NotPanics(t, func() {
			_, err := svc.LinkIncidentParent(ctx(), child.IncidentID, parent.IncidentID, testActor)
			require.ErrorContains(t, err, "hierarchy guard")
		})

		loaded, err := svc.LoadIncident(ctx(), child.IncidentID)
		require.NoError(t, err)
		assert.Nil(t, loaded.ParentID(), "nothing was linked")
	})
}
