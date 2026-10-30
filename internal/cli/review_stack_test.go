package cli

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqlitex "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// TestSQLiteStack_KeepsReviewSummariesAndBackfillsOnStartup runs the real stack on a SQLite file:
// the migration, the projection and the queries together, and the backfill the server starts with.
func TestSQLiteStack_KeepsReviewSummariesAndBackfillsOnStartup(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "sitrep.db")
	actor := identity.Actor{Sub: "test-sub", Email: "test@example.com", Name: "Tester"}
	// The server itself has no user: what it does in the background must not need one. Requests
	// are made with one.
	serverCtx := t.Context()
	ctx := identity.WithActor(serverCtx, actor)

	// Bring the database up to date, as `migrate up` does.
	db, err := openGooseDB(ctx, dsn)
	require.NoError(t, err)

	provider, err := gooseProvider(db, dsn)
	require.NoError(t, err)

	_, err = provider.Up(ctx)
	require.NoError(t, err)
	require.NoError(t, db.Close())

	summaries := func(st *stack) int {
		list, err := st.Queries.ListReviewSummaries(ctx)
		require.NoError(t, err)

		return len(list)
	}

	t.Run("closing an incident keeps the headline of its review", func(t *testing.T) {
		st, err := buildStack(serverCtx, withDSN(dsn))
		require.NoError(t, err)

		defer st.Teardown()

		created, err := st.IncidentSvc.CreateIncident(ctx, "Hochwasser", nil, nil, nil, actor)
		require.NoError(t, err)

		id := created.IncidentID

		// The access to the new incident is projected a moment after it is created.
		var msgID shared.MessageID

		require.Eventually(t, func() bool {
			msg, err := st.MessageSvc.RecordMessage(ctx, id,
				"Pegel steigt", "Beobachter", "", "Führung", "", shared.MediumRadio, nil, actor)
			msgID = msg.ID

			return err == nil
		}, 10*time.Second, 50*time.Millisecond)

		_, err = st.MessageSvc.TriageMessage(ctx, msgID, shared.TriageDone, shared.PriorityNormal, nil, nil, actor)
		require.NoError(t, err)

		require.Eventually(t, func() bool {
			_, err := st.IncidentSvc.CloseIncident(ctx, id, actor)
			return err == nil
		}, 10*time.Second, 50*time.Millisecond)

		require.Eventually(t, func() bool { return summaries(st) == 1 }, 10*time.Second, 50*time.Millisecond,
			"the headline is projected into the read model")
	})

	t.Run("a server that starts keeps the headline of incidents that have none", func(t *testing.T) {
		// An incident closed before the headline was kept: the read model has none for it.
		read, write, err := sqlitex.Open(ctx, dsn)
		require.NoError(t, err)

		_, err = write.ExecContext(ctx, `UPDATE readmodel_incident SET review_summary = NULL`)
		require.NoError(t, err)
		require.NoError(t, read.Close())
		require.NoError(t, write.Close())

		st, err := buildStack(serverCtx, withDSN(dsn))
		require.NoError(t, err)

		defer st.Teardown()

		// Nobody ran a command: the server did it once its read models were up to date.
		assert.Eventually(t, func() bool { return summaries(st) == 1 }, 20*time.Second, 100*time.Millisecond,
			"the headline is kept again, by the server itself")

		list, err := st.Queries.ListReviewSummaries(ctx)
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, 1, list[0].Summary.Messages)
		assert.Equal(t, 1, list[0].Summary.TriageCompleted)
	})
}
