package kpi_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var (
	t0         = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	incidentID = shared.IncidentID(uuid.New())
	mapDiv     = shared.DivisionID(uuid.New())
	fireDiv    = shared.DivisionID(uuid.New())
	medicDiv   = shared.DivisionID(uuid.New())

	divisions = []kpi.Division{
		{ID: mapDiv, Name: "Karte", Kind: shared.DivisionKindMessageMap},
		{ID: fireDiv, Name: "Feuerwehr"},
		{ID: medicDiv, Name: "Sanität"},
	}
)

func minutes(n int) time.Time { return t0.Add(time.Duration(n) * time.Minute) }

func compute(messages ...*message.Message) kpi.Report {
	return kpi.Compute(kpi.Input{
		OpenedAt:  t0,
		Divisions: divisions,
		Messages:  messages,
	})
}

// entered records a message at minute `at`, about something that happened at t0.
func entered(t *testing.T, at int) *message.Message {
	t.Helper()

	m := message.New(shared.MessageID(uuid.New()))
	require.NoError(t, m.Record(incidentID, 1, "content", "sender", "", "receiver", "",
		shared.MediumRadio, t0, "actor", minutes(at), "actor"))

	return m
}

func triageWith(
	t *testing.T,
	m *message.Message,
	status shared.TriageStatus,
	priority shared.PriorityStatus,
	at int,
	divs ...shared.DivisionID,
) {
	t.Helper()

	require.NoError(t, m.Triage(status, priority, divs, nil, "actor", minutes(at), "actor"))
}

func triage(t *testing.T, m *message.Message, status shared.TriageStatus, at int, divs ...shared.DivisionID) {
	t.Helper()

	triageWith(t, m, status, shared.PriorityNormal, at, divs...)
}

func acknowledged(t *testing.T, m *message.Message, div shared.DivisionID, at int) {
	t.Helper()

	require.NoError(t, m.AcknowledgeForDivision(div, "actor", minutes(at)))
}

func TestCompute_TriageTimeAndRatio(t *testing.T) {
	fast := entered(t, 0)
	triage(t, fast, shared.TriageDone, 2) // 2 min

	slow := entered(t, 0)
	triage(t, slow, shared.TriageDone, 10) // 10 min

	untouched := entered(t, 0)

	moreInfo := entered(t, 0)
	triage(t, moreInfo, shared.TriageMoreInfo, 3)

	report := compute(fast, slow, untouched, moreInfo)

	assert.Equal(t, 4, report.Messages)
	assert.Equal(t, 4, report.Triage.Total)
	assert.Equal(t, 2, report.Triage.Completed)
	require.NotNil(t, report.Triage.Ratio())
	assert.InDelta(t, 0.5, *report.Triage.Ratio(), 1e-9)
	assert.Equal(t, 2, report.Triage.Duration.Count)
	assert.Equal(t, 6*time.Minute, report.Triage.Duration.Median)
	assert.Equal(t, 10*time.Minute, report.Triage.Duration.P90)
	assert.Equal(t, 10*time.Minute, report.Triage.Duration.Max)
}

func TestCompute_TriageTimeRunsFromTheFirstTime(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 4)
	triage(t, m, shared.TriageReset, 20)
	triage(t, m, shared.TriageDone, 30)

	report := compute(m)

	assert.Equal(t, 1, report.Triage.Completed)
	assert.Equal(t, 4*time.Minute, report.Triage.Duration.Max)
}

func TestCompute_AResetTriageCountsAsNotTriaged(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 4)
	triage(t, m, shared.TriageReset, 20)

	report := compute(m)

	assert.Equal(t, 1, report.Triage.Total)
	assert.Equal(t, 0, report.Triage.Completed)
	assert.Zero(t, report.Triage.Duration.Count)
}

func TestCompute_DrawTimeAndRatio(t *testing.T) {
	drawnFast := entered(t, 0)
	triage(t, drawnFast, shared.TriageDone, 1, mapDiv)
	acknowledged(t, drawnFast, mapDiv, 4) // 3 min after the Nachrichtenkarte got it

	drawnSlow := entered(t, 0)
	triage(t, drawnSlow, shared.TriageDone, 2, mapDiv, fireDiv)
	acknowledged(t, drawnSlow, mapDiv, 12) // 10 min

	notDrawn := entered(t, 0)
	triage(t, notDrawn, shared.TriageDone, 3, mapDiv)

	notOnTheMap := entered(t, 0)
	triage(t, notOnTheMap, shared.TriageDone, 3, fireDiv)

	report := compute(drawnFast, drawnSlow, notDrawn, notOnTheMap)

	assert.Equal(t, 3, report.Draw.Total, "only what was triaged to the Nachrichtenkarte")
	assert.Equal(t, 2, report.Draw.Completed)
	require.NotNil(t, report.Draw.Ratio())
	assert.InDelta(t, 2.0/3.0, *report.Draw.Ratio(), 1e-9)
	assert.Equal(t, time.Duration(6.5*float64(time.Minute)), report.Draw.Duration.Median)
	assert.Equal(t, 10*time.Minute, report.Draw.Duration.Max)
}

func TestCompute_DrawTimeStartsWhenTheMapIsGivenTheMessage(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 1, fireDiv)
	// A later triage adds the Nachrichtenkarte: that is where the clock starts.
	triage(t, m, shared.TriageDone, 8, fireDiv, mapDiv)
	acknowledged(t, m, mapDiv, 11)

	assert.Equal(t, 3*time.Minute, compute(m).Draw.Duration.Max)
}

func TestCompute_DrawTimeKeepsRunningThroughALaterTriage(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 1, mapDiv)
	// Adjusting the triage without taking the Nachrichtenkarte out does not restart the clock.
	triage(t, m, shared.TriageDone, 5, mapDiv, fireDiv)
	acknowledged(t, m, mapDiv, 7)

	assert.Equal(t, 6*time.Minute, compute(m).Draw.Duration.Max)
}

func TestCompute_ARevokedDrawingCountsAsNotDrawn(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 1, mapDiv)
	acknowledged(t, m, mapDiv, 4)
	require.NoError(t, m.RevokeDivisionAcknowledgement(mapDiv, "actor", minutes(6)))

	report := compute(m)

	assert.Equal(t, 1, report.Draw.Total)
	assert.Equal(t, 0, report.Draw.Completed)
}

func TestCompute_SpreadsMessagesOverTheDivisions(t *testing.T) {
	both := entered(t, 0)
	triage(t, both, shared.TriageDone, 1, fireDiv, medicDiv)
	acknowledged(t, both, fireDiv, 4)  // 3 min
	acknowledged(t, both, medicDiv, 2) // 1 min

	fireOnly := entered(t, 0)
	triage(t, fireOnly, shared.TriageDone, 2, fireDiv)
	acknowledged(t, fireOnly, fireDiv, 10) // 8 min

	waiting := entered(t, 0)
	triage(t, waiting, shared.TriageDone, 3, fireDiv)

	nobody := entered(t, 0)
	triage(t, nobody, shared.TriageDone, 3)

	notTriaged := entered(t, 0)

	report := compute(both, fireOnly, waiting, nobody, notTriaged)

	byName := map[string]kpi.DivisionStat{}
	for _, d := range report.Divisions {
		byName[d.Division.Name] = d
	}

	require.Len(t, report.Divisions, 3, "every division, also one that got nothing")

	fire := byName["Feuerwehr"]
	assert.Equal(t, 3, fire.Assigned)
	assert.Equal(t, 2, fire.Acknowledged)
	assert.Equal(t, 2, fire.Duration.Count)
	assert.Equal(t, 8*time.Minute, fire.Duration.Max)

	medic := byName["Sanität"]
	assert.Equal(t, 1, medic.Assigned)
	assert.Equal(t, 1, medic.Acknowledged)
	assert.Equal(t, time.Minute, medic.Duration.Max)

	assert.Zero(t, byName["Karte"].Assigned)
	assert.Equal(t, 1, report.Unassigned, "triaged, but no division was given the message")
}

func TestCompute_SplitsTriageTimeByPriority(t *testing.T) {
	urgent := entered(t, 0)
	triageWith(t, urgent, shared.TriageDone, shared.PriorityHigh, 1)

	routine1 := entered(t, 0)
	triageWith(t, routine1, shared.TriageDone, shared.PriorityNormal, 6)

	routine2 := entered(t, 0)
	triageWith(t, routine2, shared.TriageDone, shared.PriorityNormal, 10)

	untriaged := entered(t, 0)

	report := compute(urgent, routine1, routine2, untriaged)

	assert.Equal(t, 1, report.TriageHigh.Count)
	assert.Equal(t, time.Minute, report.TriageHigh.Duration.Median)
	assert.Equal(t, 2, report.TriageNormal.Count, "only what was triaged")
	assert.Equal(t, 8*time.Minute, report.TriageNormal.Duration.Median)
}

func TestCompute_CountsWhatHadToBeDoneAgain(t *testing.T) {
	clean := entered(t, 0)
	triage(t, clean, shared.TriageDone, 1)

	sentBack := entered(t, 0)
	triage(t, sentBack, shared.TriageMoreInfo, 1)
	triage(t, sentBack, shared.TriageDone, 5)

	reset := entered(t, 0)
	triage(t, reset, shared.TriageDone, 1)
	triage(t, reset, shared.TriageReset, 2)

	corrected := entered(t, 0)
	triage(t, corrected, shared.TriageDone, 1)

	content := "better"
	require.NoError(t, corrected.Correct(&content, nil, nil, nil, nil, nil, nil, "editor", minutes(4), "editor"))

	correctedEarly := entered(t, 0)
	require.NoError(t, correctedEarly.Correct(&content, nil, nil, nil, nil, nil, nil, "editor", minutes(1), "editor"))
	triage(t, correctedEarly, shared.TriageDone, 2)

	// Saved again after the triage, but with the same text: nothing was corrected.
	resaved := entered(t, 0)
	triage(t, resaved, shared.TriageDone, 1)

	same := "content"
	require.NoError(t, resaved.Correct(&same, nil, nil, nil, nil, nil, nil, "editor", minutes(4), "editor"))

	report := compute(clean, sentBack, reset, corrected, correctedEarly, resaved)

	assert.Equal(t, kpi.Rework{Total: 6, MoreInfo: 1, Reset: 1, CorrectedAfterTriage: 1, Reworked: 3}, report.Rework)
}

func TestCompute_ReportingLag(t *testing.T) {
	// Both report something that happened at t0.
	quick := entered(t, 2)
	late := entered(t, 30)

	report := compute(quick, late)

	assert.Equal(t, 2, report.ReportingLag.Count)
	assert.Equal(t, 16*time.Minute, report.ReportingLag.Median)
	assert.Equal(t, 30*time.Minute, report.ReportingLag.Max)
}

func TestCompute_LoadAndBacklog(t *testing.T) {
	// A 10 hour operation: 15 minute buckets are the finest that stay under 48.
	var messages []*message.Message

	for range 3 { // three messages in the first bucket, two of them triaged within it
		messages = append(messages, entered(t, 1))
	}

	triage(t, messages[0], shared.TriageDone, 5)
	triage(t, messages[1], shared.TriageDone, 7)
	// messages[2] waits until minute 20, i.e. through the end of the first bucket (minute 15)
	triage(t, messages[2], shared.TriageDone, 20)

	late := entered(t, 600) // a lone message at the end, never triaged
	messages = append(messages, late)

	report := compute(messages...)

	assert.Equal(t, 15*time.Minute, report.Load.BucketSize)
	require.Len(t, report.Load.Buckets, 41, "from the first message up to and including the last")

	first := report.Load.Buckets[0]
	assert.Equal(t, t0, first.Start)
	assert.Equal(t, 3, first.Entered)
	assert.Equal(t, 1, first.Backlog, "one of the three was still waiting at 10:15")

	assert.Equal(t, 0, report.Load.Buckets[1].Backlog, "everything was triaged by 10:30")
	assert.Equal(t, 1, report.Load.Buckets[len(report.Load.Buckets)-1].Backlog, "the late one never was")

	assert.Equal(t, 3, report.Load.PeakEntered)
	assert.Equal(t, t0, report.Load.PeakEnteredAt)
	assert.Equal(t, 1, report.Load.PeakBacklog)
}

func TestCompute_LoadCoversWhenMessagesWereHandled_NotWhenTheIncidentWasOpen(t *testing.T) {
	// Opened at t0, but the first message only came in at 14:00, the last one was triaged at
	// 15:00, and the incident was not closed before five days later.
	closed := t0.Add(5 * 24 * time.Hour)
	first := entered(t, 4*60)
	triage(t, first, shared.TriageDone, 4*60+5)
	last := entered(t, 5*60-10)
	triage(t, last, shared.TriageDone, 5*60)
	never := entered(t, 5*60-5) // never triaged, which must not stretch the chart either

	report := kpi.Compute(kpi.Input{
		OpenedAt: t0, ClosedAt: &closed, Divisions: divisions,
		Messages: []*message.Message{first, last, never},
	})

	require.NotEmpty(t, report.Load.Buckets)
	assert.Equal(t, minutes(4*60), report.Load.Buckets[0].Start, "starts with the first message, not the opening")

	lastBucket := report.Load.Buckets[len(report.Load.Buckets)-1]
	assert.False(t, lastBucket.Start.After(minutes(5*60)), "ends with the last triage, not the closing")
	assert.LessOrEqual(t, len(report.Load.Buckets), 13, "an hour of work, not five days")
	assert.Equal(t, 1, lastBucket.Backlog, "the message that was never triaged still waits")
}

func TestCompute_LoadOfASingleMessageIsOneBucket(t *testing.T) {
	report := compute(entered(t, 5))

	require.Len(t, report.Load.Buckets, 1)
	assert.Equal(t, 1, report.Load.Buckets[0].Entered)
	assert.Equal(t, 1, report.Load.Buckets[0].Backlog)
}

func TestCompute_LeavesOutDeletedAndImportedMessages(t *testing.T) {
	deleted := entered(t, 0)
	triage(t, deleted, shared.TriageDone, 2)
	require.NoError(t, deleted.Delete(shared.DeleteReason(""), "actor", minutes(3)))

	imported := message.New(shared.MessageID(uuid.New()))
	require.NoError(t, eventsourcing.Apply(imported, eventsourcing.Event{
		Version:   1,
		EventType: "Imported",
		Data: message.Imported{
			IncidentID: incidentID, Triage: shared.TriageDone,
			DivisionIDs: []shared.DivisionID{mapDiv}, RecordedAt: t0,
		},
		OccurredAt: t0,
	}))

	kept := entered(t, 0)
	triage(t, kept, shared.TriageDone, 5)

	report := compute(deleted, imported, kept, nil)

	assert.Equal(t, 1, report.Messages)
	assert.Equal(t, 1, report.Triage.Total)
	assert.Equal(t, 1, report.Triage.Completed)
	assert.Zero(t, report.Draw.Total)
}

func TestCompute_NoMessagesHaveNoRatio(t *testing.T) {
	report := compute()

	assert.Zero(t, report.Messages)
	assert.Nil(t, report.Triage.Ratio())
	assert.Nil(t, report.Draw.Ratio())
	assert.Zero(t, report.Triage.Duration)
	assert.Empty(t, report.Load.Buckets)
	assert.Len(t, report.Divisions, 3)
}

func TestCompute_ABackwardsClockNeverGivesANegativeTime(t *testing.T) {
	m := entered(t, 10)
	triage(t, m, shared.TriageDone, 5)

	assert.Equal(t, time.Duration(0), compute(m).Triage.Duration.Max)
}

func TestCompute_Percentiles(t *testing.T) {
	var messages []*message.Message

	for i := 1; i <= 10; i++ {
		m := entered(t, 0)
		triage(t, m, shared.TriageDone, i) // 1..10 minutes
		messages = append(messages, m)
	}

	d := compute(messages...).Triage.Duration

	assert.Equal(t, 10, d.Count)
	assert.Equal(t, time.Duration(5.5*float64(time.Minute)), d.Median)
	assert.Equal(t, 9*time.Minute, d.P90, "nearest rank: 9 of the 10 are at or below it")
	assert.Equal(t, 10*time.Minute, d.Max)
}

func TestCompute_SpreadsTheTimesOverRanges(t *testing.T) {
	var messages []*message.Message

	// Triage times in seconds: two under 30 s, one at exactly 30 s, one at 1 min, three at 4 min,
	// one at 45 min and one at 3 h.
	for _, sec := range []int{10, 20, 30, 60, 240, 240, 240, 45 * 60, 3 * 3600} {
		m := message.New(shared.MessageID(uuid.New()))
		require.NoError(t, m.Record(incidentID, 1, "content", "sender", "", "receiver", "",
			shared.MediumRadio, t0, "actor", t0, "actor"))
		require.NoError(t, m.Triage(shared.TriageDone, shared.PriorityNormal, nil, nil, "actor",
			t0.Add(time.Duration(sec)*time.Second), "actor"))

		messages = append(messages, m)
	}

	buckets := compute(messages...).Triage.Distribution

	require.Len(t, buckets, 9)

	counts := make([]int, len(buckets))
	for i, b := range buckets {
		counts[i] = b.Count
	}

	// <30 s, 30 s–1 min, 1–2, 2–5, 5–10, 10–30, 30–60 min, 1–2 h, over 2 h
	assert.Equal(t, []int{2, 1, 1, 3, 0, 0, 1, 0, 1}, counts, "a range includes its lower end")

	assert.Zero(t, buckets[0].From)
	assert.Equal(t, 30*time.Second, buckets[0].To)
	assert.Equal(t, 2*time.Hour, buckets[8].From)
	assert.Zero(t, buckets[8].To, "the last range has no upper end")

	total := 0
	for _, c := range counts {
		total += c
	}

	assert.Equal(t, len(messages), total, "every message is in exactly one range")
}

func TestCompute_NoTimesNoDistribution(t *testing.T) {
	report := compute(entered(t, 0)) // never triaged

	assert.Empty(t, report.Triage.Distribution)
	assert.Empty(t, report.Draw.Distribution)
}
