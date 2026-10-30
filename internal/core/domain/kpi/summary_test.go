package kpi_test

import (
	"encoding/json/v2"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/kpi"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// summary builds a headline with the given triage median (seconds) and share of triaged messages.
func summary(triageMedianSec int64, triaged, total int) kpi.Summary {
	return kpi.Summary{
		Version: kpi.SummaryVersion, Messages: total,
		TriageTotal: total, TriageCompleted: triaged, TriageSamples: triaged,
		TriageMedianMs: triageMedianSec * 1000,
	}
}

func TestSummarize(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 4, mapDiv)
	acknowledged(t, m, mapDiv, 7)

	got := kpi.Summarize(compute(m))

	assert.Equal(t, kpi.SummaryVersion, got.Version)
	assert.Equal(t, 1, got.Messages)
	assert.Equal(t, 1, got.TriageTotal)
	assert.Equal(t, 1, got.TriageCompleted)
	assert.Equal(t, int64(4*60*1000), got.TriageMedianMs)
	assert.Equal(t, 1, got.DrawCompleted)
	assert.Equal(t, int64(3*60*1000), got.DrawMedianMs)
}

func TestSummary_SurvivesBeingStored(t *testing.T) {
	m := entered(t, 0)
	triage(t, m, shared.TriageDone, 4, mapDiv)

	want := kpi.Summarize(compute(m))

	data, err := json.Marshal(want)
	require.NoError(t, err)

	var got kpi.Summary

	require.NoError(t, json.Unmarshal(data, &got))
	assert.Equal(t, want, got)
}

func TestSummarize_OfAnEmptyIncidentHasNoSamples(t *testing.T) {
	got := kpi.Summarize(compute())

	assert.Zero(t, got.TriageTotal)
	assert.Zero(t, got.TriageSamples)

	cmp := kpi.Compare(got, []kpi.Summary{summary(60, 1, 1)})
	assert.Nil(t, cmp.TriageMedian.Value, "nothing to compare, so no value")
	assert.Nil(t, cmp.TriageRatio.Value)
}

func TestCompare_PlacesAnIncidentAmongTheOthers(t *testing.T) {
	// Triage medians of five others: 1, 2, 3, 4 and 5 minutes.
	var peers []kpi.Summary
	for _, minutes := range []int64{1, 2, 3, 4, 5} {
		peers = append(peers, summary(minutes*60, 9, 10))
	}

	cmp := kpi.Compare(summary(150, 10, 10), peers) // 2.5 min, everything triaged

	b := cmp.TriageMedian
	require.NotNil(t, b.Value)
	assert.InDelta(t, 150.0, *b.Value, 1e-9)
	assert.Equal(t, 5, b.Peers)
	assert.True(t, b.Sufficient)
	assert.InDelta(t, 60.0, b.Lowest, 1e-9)
	assert.InDelta(t, 300.0, b.Highest, 1e-9)
	assert.InDelta(t, 180.0, b.Median, 1e-9)
	assert.InDelta(t, 120.0, b.Q1, 1e-9)
	assert.InDelta(t, 240.0, b.Q3, 1e-9)
	require.NotNil(t, b.BetterThan)
	assert.InDelta(t, 0.6, *b.BetterThan, 1e-9, "faster than three of the five")

	r := cmp.TriageRatio
	require.NotNil(t, r.BetterThan)
	assert.InDelta(t, 1.0, *r.BetterThan, 1e-9, "a higher share than all of them")
}

func TestCompare_ForAShareHigherIsBetter_ForATimeLowerIs(t *testing.T) {
	var peers []kpi.Summary
	for range 5 {
		peers = append(peers, summary(120, 5, 10))
	}

	slow := kpi.Compare(summary(600, 3, 10), peers)
	require.NotNil(t, slow.TriageMedian.BetterThan)
	assert.InDelta(t, 0.0, *slow.TriageMedian.BetterThan, 1e-9)
	assert.InDelta(t, 0.0, *slow.TriageRatio.BetterThan, 1e-9)

	good := kpi.Compare(summary(30, 9, 10), peers)
	assert.InDelta(t, 1.0, *good.TriageMedian.BetterThan, 1e-9)
	assert.InDelta(t, 1.0, *good.TriageRatio.BetterThan, 1e-9)
}

func TestCompare_ATieIsInTheMiddle(t *testing.T) {
	var peers []kpi.Summary
	for range 5 {
		peers = append(peers, summary(120, 5, 10))
	}

	cmp := kpi.Compare(summary(120, 5, 10), peers)

	require.NotNil(t, cmp.TriageMedian.BetterThan)
	assert.InDelta(t, 0.5, *cmp.TriageMedian.BetterThan, 1e-9)
}

func TestCompare_SaysNothingAgainstTooFewIncidents(t *testing.T) {
	peers := []kpi.Summary{summary(60, 9, 10), summary(120, 9, 10), summary(180, 9, 10)}

	cmp := kpi.Compare(summary(90, 9, 10), peers)

	assert.Equal(t, 3, cmp.TriageMedian.Peers)
	assert.False(t, cmp.TriageMedian.Sufficient)
	assert.Nil(t, cmp.TriageMedian.BetterThan, "no ranking against three")
	assert.InDelta(t, 120.0, cmp.TriageMedian.Median, 1e-9, "the spread is still there to show")
}

func TestCompare_LeavesOutIncidentsWithoutAValue(t *testing.T) {
	peers := []kpi.Summary{{}, {}, summary(60, 9, 10)}

	cmp := kpi.Compare(summary(90, 9, 10), peers)

	assert.Equal(t, 1, cmp.TriageMedian.Peers, "an empty incident has no triage time to compare")
}

func TestCompare_WithNoOtherIncidents(t *testing.T) {
	cmp := kpi.Compare(summary(90, 9, 10), nil)

	assert.Zero(t, cmp.TriageMedian.Peers)
	assert.False(t, cmp.TriageMedian.Sufficient)
	assert.Nil(t, cmp.TriageMedian.BetterThan)
}
