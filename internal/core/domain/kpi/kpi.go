// Package kpi works out the key figures of an incident from the history of its messages, for the
// review after the operation: how long it took to triage and draw a message, how the messages were
// spread over the divisions and how fast those acknowledged them, how much had to be done again,
// and when the load was highest.
//
// Everything here is a pure function of the message aggregates, so it gives the same answer
// whenever it is asked for a closed incident, and a current one for an open incident.
package kpi

import (
	"slices"
	"time"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// Stats summarises how long a step took. The mean is left out on purpose: a few messages that
// waited very long would hide behind it.
type Stats struct {
	// Count is the number of messages that have a duration.
	Count  int
	Median time.Duration
	P90    time.Duration
	Max    time.Duration
}

// DurationBucket is how many messages took a time within a range, for the histogram of a step.
type DurationBucket struct {
	// From is included, To excluded; To is zero for the last bucket, which has no upper end.
	From  time.Duration
	To    time.Duration
	Count int
}

// distributionEdges are where the ranges of a histogram begin, tuned to what happens in an
// operation: from half a minute up to hours. Under the first edge is a range of its own, and over
// the last one.
var distributionEdges = []time.Duration{
	30 * time.Second, time.Minute, 2 * time.Minute, 5 * time.Minute, 10 * time.Minute,
	30 * time.Minute, time.Hour, 2 * time.Hour,
}

// distribution counts how many of the durations fall in each range. Nil when there are none.
func distribution(durations []time.Duration) []DurationBucket {
	if len(durations) == 0 {
		return nil
	}

	buckets := make([]DurationBucket, len(distributionEdges)+1)
	for i := range buckets {
		if i > 0 {
			buckets[i].From = distributionEdges[i-1]
		}

		if i < len(distributionEdges) {
			buckets[i].To = distributionEdges[i]
		}
	}

	for _, d := range durations {
		// The first range that ends after the duration; the last one has no end.
		i := slices.IndexFunc(buckets[:len(buckets)-1], func(b DurationBucket) bool { return d < b.To })
		if i < 0 {
			i = len(buckets) - 1
		}

		buckets[i].Count++
	}

	return buckets
}

// Metric is one KPI: how many messages it applies to, how many of those got through, how long it
// took the ones that did, and how those times are spread.
type Metric struct {
	Total        int
	Completed    int
	Duration     Stats
	Distribution []DurationBucket
}

// Ratio is the share of messages that got through, nil when none applied: there is no 100% or
// 0% of nothing.
func (m Metric) Ratio() *float64 {
	if m.Total == 0 {
		return nil
	}

	ratio := float64(m.Completed) / float64(m.Total)

	return &ratio
}

// Division is a division of the incident, as the review needs to know it.
type Division struct {
	ID shared.DivisionID
	// Name is the short name, Description the full one.
	Name        string
	Description string
	Kind        shared.DivisionKind
}

// DivisionStat is how many messages a division was given, how many it acknowledged and how long
// that took from being given the message. For the Nachrichtenkarte, acknowledging is drawing.
type DivisionStat struct {
	Division     Division
	Assigned     int
	Acknowledged int
	Duration     Stats
}

// Group is the triage time of the messages of one priority.
type Group struct {
	Count    int
	Duration Stats
}

// Rework is how many messages had to be handled again.
type Rework struct {
	// Total is the number of messages the other figures are shares of.
	Total int
	// MoreInfo were sent back for more information, Reset had their triage reset, and
	// CorrectedAfterTriage were corrected once triaged. A message can be in several.
	MoreInfo             int
	Reset                int
	CorrectedAfterTriage int
	// Reworked is the number of messages with any of them.
	Reworked int
}

// Bucket is one stretch of time on the load chart.
type Bucket struct {
	Start time.Time
	// Entered is how many messages were entered in the bucket.
	Entered int
	// Backlog is how many entered messages were still waiting for their first triage at its end.
	Backlog int
}

// Load is how many messages came in over time, and how many were waiting.
type Load struct {
	BucketSize    time.Duration
	Buckets       []Bucket
	PeakEntered   int
	PeakEnteredAt time.Time
	PeakBacklog   int
	PeakBacklogAt time.Time
}

// Report is the review of an incident's messages.
type Report struct {
	OpenedAt time.Time
	// ClosedAt is nil while the incident is open: the figures are then an interim status.
	ClosedAt *time.Time
	// Messages is the number of messages the figures are based on.
	Messages int

	// Triage runs from a message being entered to it being triaged and applies to every message.
	Triage Metric
	// Draw runs from a message being triaged to the Nachrichtenkarte to it being drawn, and applies
	// to the messages triaged to the Nachrichtenkarte.
	Draw Metric

	// TriageByPriority is the triage time of the triaged messages, by their priority.
	TriageHigh   Group
	TriageNormal Group

	// Divisions is how the triaged messages were spread over the divisions of the incident.
	Divisions []DivisionStat
	// Unassigned is the number of triaged messages that no division was given.
	Unassigned int

	Rework Rework
	// ReportingLag is how long after an event it was entered: the entry time minus the time the
	// message gives for what it reports.
	ReportingLag Stats
	Load         Load
}

// Input is what a review is worked out from.
type Input struct {
	OpenedAt  time.Time
	ClosedAt  *time.Time
	Divisions []Division
	Messages  []*message.Message
}

// Compute works out the review of an incident from the aggregates of its messages.
//
// Deleted messages are left out, and so are imported ones: the legacy import carries no record
// of when a message was entered, triaged or drawn, so any duration would be made up.
//
// A message counts as triaged while its triage status is final, and as acknowledged by a division
// while that division's acknowledgement stands. A triage that was reset, or an acknowledgement
// that was revoked, therefore counts as not done, whatever happened before. The triage time runs
// from the first time the message was triaged, an acknowledgement time from the division being
// given the message.
func Compute(in Input) Report {
	report := Report{OpenedAt: in.OpenedAt, ClosedAt: in.ClosedAt}

	var (
		triage, draw        collector
		high, normal        collector
		lag                 collector
		perDivision         = make(map[shared.DivisionID]*divisionCollector, len(in.Divisions))
		kept                []*message.Message
		mapDivision, hasMap = mapDivisionOf(in.Divisions)
	)

	for _, d := range in.Divisions {
		perDivision[d.ID] = &divisionCollector{division: d}
	}

	for _, m := range in.Messages {
		if m == nil || m.IsDeleted() || m.IsImported() {
			continue
		}

		kept = append(kept, m)
		report.Messages++
		report.Rework.add(m)
		lag.add(m.CreatedAt().Sub(m.Time()))

		triage.total++

		if m.TriageStatus() != shared.TriageDone {
			continue
		}

		triage.completed++

		var triageTime *time.Duration

		if at := m.TriagedAt(); at != nil {
			d := max(at.Sub(m.CreatedAt()), 0)
			triageTime = &d

			triage.add(d)
		}

		group := &normal
		if m.PriorityStatus() == shared.PriorityHigh {
			group = &high
		}

		group.total++

		if triageTime != nil {
			group.add(*triageTime)
		}

		if len(m.DivisionIDs()) == 0 {
			report.Unassigned++
		}

		for _, id := range m.DivisionIDs() {
			dc, ok := perDivision[id]
			if !ok {
				continue
			}

			dc.assigned++

			assigned, hasAssigned := m.DivisionAssignedAt(id)
			ackAt, acked := m.AcknowledgedAt(id)

			if acked {
				dc.acknowledged++

				if hasAssigned {
					dc.add(ackAt.Sub(assigned))
				}
			}

			if hasMap && id == mapDivision {
				draw.total++

				if acked {
					draw.completed++

					if hasAssigned {
						draw.add(ackAt.Sub(assigned))
					}
				}
			}
		}
	}

	report.Triage = triage.metric()
	report.Draw = draw.metric()
	report.TriageHigh = Group{Count: high.total, Duration: stats(high.durations)}
	report.TriageNormal = Group{Count: normal.total, Duration: stats(normal.durations)}
	report.ReportingLag = stats(lag.durations)

	for _, d := range in.Divisions {
		dc := perDivision[d.ID]
		report.Divisions = append(report.Divisions, DivisionStat{
			Division:     d,
			Assigned:     dc.assigned,
			Acknowledged: dc.acknowledged,
			Duration:     stats(dc.durations),
		})
	}

	report.Load = load(kept)

	return report
}

func mapDivisionOf(divisions []Division) (shared.DivisionID, bool) {
	for _, d := range divisions {
		if d.Kind == shared.DivisionKindMessageMap {
			return d.ID, true
		}
	}

	return shared.DivisionID{}, false
}

func (r *Rework) add(m *message.Message) {
	r.Total++

	if m.EverMoreInfo() {
		r.MoreInfo++
	}

	if m.EverReset() {
		r.Reset++
	}

	if m.CorrectedAfterTriage() {
		r.CorrectedAfterTriage++
	}

	if m.EverMoreInfo() || m.EverReset() || m.CorrectedAfterTriage() {
		r.Reworked++
	}
}

// bucketSizes are the widths the load chart can have, finest first.
var bucketSizes = []time.Duration{
	5 * time.Minute, 15 * time.Minute, 30 * time.Minute,
	time.Hour, 2 * time.Hour, 3 * time.Hour, 6 * time.Hour, 12 * time.Hour, 24 * time.Hour,
}

// maxBuckets is how many bars the load chart is allowed to have.
const maxBuckets = 48

// load counts the messages entered per stretch of time and the ones still waiting at its end.
//
// It covers the time the messages were handled, from the first one being entered to the last
// entry or triage, and not the time the incident was open: an incident that was only closed days
// after the operation ended would otherwise be mostly empty bars, and the messages that were never
// triaged would pile up in the backlog for all of it.
func load(messages []*message.Message) Load {
	if len(messages) == 0 {
		return Load{}
	}

	start, end := messages[0].CreatedAt(), messages[0].CreatedAt()

	for _, m := range messages {
		start = earliest(start, m.CreatedAt())
		end = latest(end, m.CreatedAt())

		if at := m.TriagedAt(); at != nil {
			end = latest(end, *at)
		}
	}

	size := bucketSizes[len(bucketSizes)-1]

	for _, candidate := range bucketSizes {
		if end.Sub(start)/candidate < maxBuckets {
			size = candidate

			break
		}
	}

	first := start.Truncate(size)
	count := int(end.Sub(first)/size) + 1
	result := Load{BucketSize: size, Buckets: make([]Bucket, count)}

	for i := range result.Buckets {
		result.Buckets[i].Start = first.Add(time.Duration(i) * size)
	}

	index := func(t time.Time) int { return min(max(int(t.Sub(first)/size), 0), count-1) }

	for _, m := range messages {
		result.Buckets[index(m.CreatedAt())].Entered++
	}

	for i := range result.Buckets {
		bucketEnd := result.Buckets[i].Start.Add(size)
		backlog := 0

		for _, m := range messages {
			waiting := m.CreatedAt().Before(bucketEnd) &&
				(m.TriagedAt() == nil || !m.TriagedAt().Before(bucketEnd))
			if waiting {
				backlog++
			}
		}

		result.Buckets[i].Backlog = backlog

		if result.Buckets[i].Entered > result.PeakEntered {
			result.PeakEntered, result.PeakEnteredAt = result.Buckets[i].Entered, result.Buckets[i].Start
		}

		if backlog > result.PeakBacklog {
			result.PeakBacklog, result.PeakBacklogAt = backlog, result.Buckets[i].Start
		}
	}

	return result
}

func earliest(a, b time.Time) time.Time {
	if b.Before(a) {
		return b
	}

	return a
}

func latest(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}

	return a
}

type collector struct {
	total, completed int
	durations        []time.Duration
}

// add records a duration. A clock that stepped back, or an event stored out of order, must not
// produce a negative time.
func (c *collector) add(d time.Duration) {
	c.durations = append(c.durations, max(d, 0))
}

func (c *collector) metric() Metric {
	return Metric{
		Total:        c.total,
		Completed:    c.completed,
		Duration:     stats(c.durations),
		Distribution: distribution(c.durations),
	}
}

type divisionCollector struct {
	division     Division
	assigned     int
	acknowledged int
	durations    []time.Duration
}

func (c *divisionCollector) add(d time.Duration) { c.durations = append(c.durations, max(d, 0)) }

func stats(durations []time.Duration) Stats {
	if len(durations) == 0 {
		return Stats{}
	}

	sorted := slices.Clone(durations)
	slices.Sort(sorted)

	return Stats{
		Count:  len(sorted),
		Median: median(sorted),
		P90:    nearestRank(sorted, 0.9),
		Max:    sorted[len(sorted)-1],
	}
}

// median of an ascending list: the middle one, or the mean of the two middle ones.
func median(sorted []time.Duration) time.Duration {
	n := len(sorted)
	if n%2 == 1 {
		return sorted[n/2]
	}

	return (sorted[n/2-1] + sorted[n/2]) / 2
}

// nearestRank is the smallest value that at least p of the list is at or below.
func nearestRank(sorted []time.Duration, p float64) time.Duration {
	rank := int(float64(len(sorted))*p + 0.999999999)
	rank = min(max(rank, 1), len(sorted))

	return sorted[rank-1]
}
