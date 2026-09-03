package access

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func TestIncidentAccessClaimOwnerlessIncident(t *testing.T) {
	id := shared.IncidentID(uuid.New())
	a := NewIncidentAccess(id)
	at := time.Unix(1, 0)

	require.NoError(t, a.Initialize(nil, OpenOperational, "system:backfill", at))
	require.NoError(t, a.ChangeAccessMode(Restricted, "user-1", at))

	assert.Equal(t, Restricted, a.Mode())
	assert.True(t, a.IsOwner("user-1"))
	assert.Len(t, a.Root().PendingEvents(), 3)
}

func TestIncidentAccessCannotRevokeLastOwner(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	at := time.Unix(1, 0)
	owner := "user-1"

	require.NoError(t, a.Initialize(&owner, Restricted, owner, at))
	err := a.RevokeRole(Principal{Kind: UserPrincipal, ID: owner}, Owner, owner, at)

	require.ErrorIs(t, err, shared.ErrForbidden)
}

func TestIncidentAccessReplay(t *testing.T) {
	a := NewIncidentAccess(shared.IncidentID(uuid.New()))
	at := time.Unix(1, 0)
	owner := "user-1"

	require.NoError(t, a.Initialize(&owner, OpenOperational, owner, at))
	require.NoError(t, a.GrantRole(Principal{Kind: GroupPrincipal, ID: "group-1"}, Viewer, owner, at))
	require.NoError(t, a.GrantRole(Principal{Kind: GroupPrincipal, ID: "group-1"}, Editor, owner, at))

	replayed := NewIncidentAccess(shared.IncidentID(a.Root().ID()))
	for _, event := range a.Root().PendingEvents() {
		event.Data = mustJSON(t, event.Data)
		require.NoError(t, eventsourcing.Apply(replayed, event))
	}

	assert.Equal(t, a.Mode(), replayed.Mode())
	assert.True(t, replayed.IsOwner(owner))
	assert.True(t, replayed.HasRole(Principal{Kind: GroupPrincipal, ID: "group-1"}, Viewer))
	assert.True(t, replayed.HasRole(Principal{Kind: GroupPrincipal, ID: "group-1"}, Editor))
}

func TestGlobalAccessSupportsMultipleRolesAndProtectsLastAdmin(t *testing.T) {
	a := NewGlobalAccess()
	at := time.Unix(1, 0)

	require.NoError(t, a.Initialize("system:bootstrap", at))
	require.NoError(t, a.GrantRole("user-1", SystemAdmin, "system:bootstrap", at))
	require.NoError(t, a.GrantRole("user-1", GroupAdmin, "system:bootstrap", at))

	assert.True(t, a.HasRole("user-1", SystemAdmin))
	assert.True(t, a.HasRole("user-1", GroupAdmin))
	require.ErrorIs(t, a.RevokeRole("user-1", SystemAdmin, "user-1", at), shared.ErrForbidden)
}

func TestAccessGroupReplayAndArchive(t *testing.T) {
	a := NewAccessGroup(uuid.New())
	at := time.Unix(1, 0)

	require.NoError(t, a.Create("Operations", "Operational staff", "admin", at))
	require.NoError(t, a.AddMember("user-1", "admin", at))
	require.NoError(t, a.Archive("admin", at))

	replayed := NewAccessGroup(a.Root().ID())
	for _, event := range a.Root().PendingEvents() {
		event.Data = mustJSON(t, event.Data)
		require.NoError(t, eventsourcing.Apply(replayed, event))
	}

	assert.Equal(t, "Operations", replayed.Name())
	assert.True(t, replayed.HasMember("user-1"))
	assert.True(t, replayed.IsArchived())
	assert.Error(t, replayed.AddMember("user-2", "admin", at))
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	data, err := json.Marshal(value)
	require.NoError(t, err)

	return json.RawMessage(data)
}
