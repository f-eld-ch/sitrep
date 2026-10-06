package projection_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	sqstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/sqlite/projection"
)

func TestResourceHandler_ReactivatedKeepsHistoryAndResetsCycle(t *testing.T) {
	_, write := openTestDB(t)
	store := sqstore.NewEventStore(write, write, sqstore.WallClock{})
	handlers := []projection.Handler{projection.NewResourceHandler(write)}
	proj := projection.NewProjector(write, write, store, sqstore.NewNotifier(), handlers)
	require.NoError(t, proj.CatchUp(t.Context()))

	const (
		handler = "readmodel.resource"
		resID   = "00000000-0000-0000-0000-0000000000a1"
		incID   = "00000000-0000-0000-0000-0000000000a2"
		spID    = "00000000-0000-0000-0000-0000000000a3"
		newSpID = "00000000-0000-0000-0000-0000000000a4"
	)

	day1 := time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC)
	day2 := day1.Add(24 * time.Hour)
	version := 0

	apply := func(eventType string, at time.Time, data map[string]any) {
		t.Helper()

		version++
		e := newEvent("Resource", resID, version, eventType, data)
		e.OccurredAt = at
		applyEvent(t, proj, handler, e)
	}

	apply("Alerted", day1, map[string]any{
		"incidentId": incID, "schadenplatzId": spID, "formation": "FW", "name": "Gruppe Alpha",
		"size": "GRUPPE", "personnelCount": 9, "hauptaufgabe": "Löschangriff",
	})
	apply("MarkedReady", day1.Add(time.Hour), map[string]any{"at": day1.Add(time.Hour)})
	apply("Deployed", day1.Add(2*time.Hour), map[string]any{"at": day1.Add(2 * time.Hour)})
	apply("StoodDown", day1.Add(3*time.Hour), map[string]any{"at": day1.Add(3 * time.Hour)})
	apply("Relieved", day1.Add(4*time.Hour), map[string]any{"at": day1.Add(4 * time.Hour)})

	type period struct {
		StartedAt string  `json:"startedAt"`
		EndedAt   *string `json:"endedAt"`
	}

	history := func() []period {
		t.Helper()

		var raw string
		require.NoError(t, write.QueryRowContext(t.Context(),
			`SELECT deployment_history FROM readmodel_resource WHERE id = ?`, resID).Scan(&raw))

		var periods []period
		require.NoError(t, json.Unmarshal([]byte(raw), &periods))

		return periods
	}

	// Relieving after a stand down must not move the already closed period's end.
	before := history()
	require.Len(t, before, 1)
	require.NotNil(t, before[0].EndedAt)
	assert.Contains(t, *before[0].EndedAt, "11:00:00", "endedAt stays at the stand-down time")

	apply("Reactivated", day2, map[string]any{"at": day2, "schadenplatzId": newSpID})

	var (
		status, schadenplatz         string
		ready, relieved, einsatzBeg  *string
		einsatzEnd, successor, hmain *string
	)
	require.NoError(t, write.QueryRowContext(t.Context(), `
		SELECT status, schadenplatz_id, ready_at, relieved_at, einsatz_beginn, einsatz_ende,
		       successor_id, hauptaufgabe
		FROM readmodel_resource WHERE id = ?`, resID).Scan(
		&status, &schadenplatz, &ready, &relieved, &einsatzBeg, &einsatzEnd, &successor, &hmain))
	assert.Equal(t, "AUFGEBOTEN", status)
	assert.Equal(t, newSpID, schadenplatz)
	assert.Nil(t, ready)
	assert.Nil(t, relieved)
	assert.Nil(t, einsatzBeg)
	assert.Nil(t, einsatzEnd)
	assert.Nil(t, successor)
	require.NotNil(t, hmain)
	assert.Empty(t, *hmain)
	assert.Equal(t, before, history(), "history from day 1 must survive reactivation")

	// Day 2: ready and deploy again — a second history period is appended.
	apply("MarkedReady", day2.Add(time.Hour), map[string]any{"at": day2.Add(time.Hour)})
	apply("Deployed", day2.Add(2*time.Hour), map[string]any{"at": day2.Add(2 * time.Hour)})

	periods := history()
	require.Len(t, periods, 2)
	assert.NotNil(t, periods[0].EndedAt)
	assert.Nil(t, periods[1].EndedAt)

	require.NoError(t, write.QueryRowContext(t.Context(),
		`SELECT einsatz_beginn FROM readmodel_resource WHERE id = ?`, resID).Scan(&einsatzBeg))
	require.NotNil(t, einsatzBeg)
	assert.Contains(t, *einsatzBeg, "2026-01-16", "einsatz_beginn restarts on day 2")
}
