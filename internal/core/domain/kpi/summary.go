package kpi

import (
	"math"
	"slices"
	"time"
)

// SummaryVersion is bumped when what a Summary means changes, so old ones can be told apart and
// worked out again.
const SummaryVersion = 1

// Summary is the headline of an incident's review, small enough to keep for every closed incident
// and to compare. Durations are whole milliseconds, which both JSON packages in use store alike
// (a time.Duration has no representation of its own in encoding/json/v2).
type Summary struct {
	Version  int `json:"version"`
	Messages int `json:"messages"`

	TriageTotal     int   `json:"triageTotal"`
	TriageCompleted int   `json:"triageCompleted"`
	TriageSamples   int   `json:"triageSamples"`
	TriageMedianMs  int64 `json:"triageMedianMs"`
	TriageP90Ms     int64 `json:"triageP90Ms"`

	DrawTotal     int   `json:"drawTotal"`
	DrawCompleted int   `json:"drawCompleted"`
	DrawSamples   int   `json:"drawSamples"`
	DrawMedianMs  int64 `json:"drawMedianMs"`
	DrawP90Ms     int64 `json:"drawP90Ms"`
}

// Summarize is the headline of a review.
func Summarize(r Report) Summary {
	return Summary{
		Version:  SummaryVersion,
		Messages: r.Messages,

		TriageTotal:     r.Triage.Total,
		TriageCompleted: r.Triage.Completed,
		TriageSamples:   r.Triage.Duration.Count,
		TriageMedianMs:  r.Triage.Duration.Median.Milliseconds(),
		TriageP90Ms:     r.Triage.Duration.P90.Milliseconds(),

		DrawTotal:     r.Draw.Total,
		DrawCompleted: r.Draw.Completed,
		DrawSamples:   r.Draw.Duration.Count,
		DrawMedianMs:  r.Draw.Duration.Median.Milliseconds(),
		DrawP90Ms:     r.Draw.Duration.P90.Milliseconds(),
	}
}

// MinPeers is how many other incidents it takes for a comparison to say anything: against two or
// three, "faster than 66 %" is an accident.
const MinPeers = 5

// Benchmark is where one value of an incident lies among the same value of the other incidents.
type Benchmark struct {
	// Value is this incident's value, nil when it has none (no message got that far).
	Value *float64
	// Peers is how many other incidents have a value.
	Peers int
	// Sufficient is whether there are enough of them to compare with (MinPeers).
	Sufficient bool
	// Lowest, Q1, Median, Q3 and Highest describe the other incidents' values.
	Lowest, Q1, Median, Q3, Highest float64
	// BetterThan is the share of the other incidents this one beats, from 0 to 1: the faster one
	// for a time, the higher one for a share of messages. Nil without a value or enough peers.
	BetterThan *float64
}

// Comparison is how an incident's headline compares with the other incidents. Times are in
// seconds, shares of messages from 0 to 1.
type Comparison struct {
	TriageMedian Benchmark
	TriageRatio  Benchmark
	DrawMedian   Benchmark
	DrawRatio    Benchmark
}

// Compare sets an incident's headline against that of the other incidents.
func Compare(current Summary, peers []Summary) Comparison {
	return Comparison{
		TriageMedian: benchmark(
			value(current.TriageSamples > 0, seconds(current.TriageMedianMs)),
			values(peers, func(s Summary) (float64, bool) { return seconds(s.TriageMedianMs), s.TriageSamples > 0 }),
			true,
		),
		TriageRatio: benchmark(
			value(current.TriageTotal > 0, share(current.TriageCompleted, current.TriageTotal)),
			values(peers, func(s Summary) (float64, bool) {
				return share(s.TriageCompleted, s.TriageTotal), s.TriageTotal > 0
			}),
			false,
		),
		DrawMedian: benchmark(
			value(current.DrawSamples > 0, seconds(current.DrawMedianMs)),
			values(peers, func(s Summary) (float64, bool) { return seconds(s.DrawMedianMs), s.DrawSamples > 0 }),
			true,
		),
		DrawRatio: benchmark(
			value(current.DrawTotal > 0, share(current.DrawCompleted, current.DrawTotal)),
			values(
				peers,
				func(s Summary) (float64, bool) { return share(s.DrawCompleted, s.DrawTotal), s.DrawTotal > 0 },
			),
			false,
		),
	}
}

func seconds(ms int64) float64 { return time.Duration(ms * int64(time.Millisecond)).Seconds() }

func share(part, total int) float64 {
	if total == 0 {
		return 0
	}

	return float64(part) / float64(total)
}

func value(has bool, v float64) *float64 {
	if !has {
		return nil
	}

	return &v
}

func values(peers []Summary, pick func(Summary) (float64, bool)) []float64 {
	var out []float64

	for _, p := range peers {
		if v, ok := pick(p); ok {
			out = append(out, v)
		}
	}

	return out
}

func benchmark(current *float64, peers []float64, lowerIsBetter bool) Benchmark {
	b := Benchmark{Value: current, Peers: len(peers), Sufficient: len(peers) >= MinPeers}
	if len(peers) == 0 {
		return b
	}

	sorted := slices.Clone(peers)
	slices.Sort(sorted)

	b.Lowest, b.Highest = sorted[0], sorted[len(sorted)-1]
	b.Q1, b.Median, b.Q3 = quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)

	if current != nil && b.Sufficient {
		beaten := 0

		for _, p := range sorted {
			// A tie is half a win, so an incident exactly like the others is in the middle.
			switch {
			case lowerIsBetter && *current < p, !lowerIsBetter && *current > p:
				beaten += 2
			case *current == p:
				beaten++
			}
		}

		better := float64(beaten) / float64(2*len(sorted))
		b.BetterThan = &better
	}

	return b
}

// quantile of an ascending list, between the two nearest values.
func quantile(sorted []float64, q float64) float64 {
	pos := q * float64(len(sorted)-1)
	lo := int(math.Floor(pos))
	hi := int(math.Ceil(pos))

	return sorted[lo] + (sorted[hi]-sorted[lo])*(pos-float64(lo))
}
