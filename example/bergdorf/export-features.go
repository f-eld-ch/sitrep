//go:build ignore

// Export what was drawn on the Nachrichtenkarte of the example incident into features.json, which
// seed.go replays. Run it after drawing by hand in the running instance (see README.md):
//
//	go run export-features.go                      # reads bergdorf.sqlite3, writes features.json
//
// Per feature it keeps one step per message that touched it (the first step places the feature,
// later steps change it), with the final geometry and properties of that message. The many
// intermediate edits made while drawing are dropped. Times are not stored: the seed uses the
// time of the message, like the app does.
package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	_ "modernc.org/sqlite"
)

type step struct {
	Message    int             `json:"message"`
	Geometry   json.RawMessage `json:"geometry,omitempty"`
	Properties json.RawMessage `json:"properties,omitempty"`
}

type feature struct {
	Key   string `json:"key"`
	Steps []step `json:"steps"`
}

type export struct {
	Features []feature `json:"features"`
	// Acknowledged lists the messages marked as drawn ("Abschliessen").
	Acknowledged []int `json:"acknowledged"`
}

type eventData struct {
	Geometry   json.RawMessage `json:"geometry"`
	Properties json.RawMessage `json:"properties"`
	MessageID  string          `json:"messageId"`
}

func main() {
	dbPath := flag.String("db", "bergdorf.sqlite3", "SQLite database")
	out := flag.String("out", "features.json", "output file")
	flag.Parse()

	if err := run(*dbPath, *out); err != nil {
		fmt.Fprintln(os.Stderr, "export:", err)
		os.Exit(1)
	}
}

func run(dbPath, outPath string) error {
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()

	numbers := map[string]int{} // message id -> number

	rows, err := db.Query(`select id, number from readmodel_message`)
	if err != nil {
		return err
	}

	for rows.Next() {
		var id string

		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return err
		}

		numbers[id] = n
	}

	if err := rows.Close(); err != nil {
		return err
	}

	// Feature events in the order they happened.
	rows, err = db.Query(`select stream_id, event_type, data from eventsourcing_events
		where stream_type = 'Feature' order by seq`)
	if err != nil {
		return err
	}

	type state struct {
		first    int // order of first appearance
		steps    []step
		lastGeo  json.RawMessage
		lastProp json.RawMessage
	}

	features := map[string]*state{}
	order := 0

	for rows.Next() {
		var id, typ, data string
		if err := rows.Scan(&id, &typ, &data); err != nil {
			return err
		}

		var e eventData
		if err := json.Unmarshal([]byte(data), &e); err != nil {
			return fmt.Errorf("event data: %w", err)
		}

		n, ok := numbers[e.MessageID]
		if !ok {
			return fmt.Errorf("feature %s: %s event without a known message", id, typ)
		}

		st, seen := features[id]
		if !seen {
			order++
			st = &state{first: order}
			features[id] = st
		}

		// A new step starts when another message touches the feature.
		if len(st.steps) == 0 || st.steps[len(st.steps)-1].Message != n {
			st.steps = append(st.steps, step{Message: n})
		}

		cur := &st.steps[len(st.steps)-1]

		switch typ {
		case "Placed":
			cur.Geometry, cur.Properties = e.Geometry, e.Properties
		case "Moved":
			cur.Geometry = e.Geometry
		case "Restyled":
			cur.Properties = e.Properties
		default:
			return fmt.Errorf("feature %s: event %s is not handled (removed features are not supported yet)", id, typ)
		}
	}

	if err := rows.Close(); err != nil {
		return err
	}

	ordered := make([]*state, 0, len(features))
	for _, st := range features {
		ordered = append(ordered, st)
	}

	sort.Slice(ordered, func(i, j int) bool { return ordered[i].first < ordered[j].first })

	result := export{Acknowledged: []int{}}

	for i, st := range ordered {
		result.Features = append(result.Features, feature{
			Key:   fmt.Sprintf("bergdorf-%02d", i+1),
			Steps: st.steps,
		})
	}

	rows, err = db.Query(`select stream_id from eventsourcing_events
		where stream_type = 'Message' and event_type = 'DivisionAcknowledged'`)
	if err != nil {
		return err
	}

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}

		result.Acknowledged = append(result.Acknowledged, numbers[id])
	}

	if err := rows.Close(); err != nil {
		return err
	}

	sort.Ints(result.Acknowledged)

	b, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(outPath, append(b, '\n'), 0o644); err != nil {
		return err
	}

	fmt.Printf("%d features, %d messages acknowledged -> %s\n", len(result.Features), len(result.Acknowledged), outPath)

	return nil
}
