// Package messagemap holds the dialect-independent planning logic of the
// message map backfill: given the event history of an incident's divisions and
// layers it decides whether to mark an existing entity as the Nachrichtenkarte
// or to add a new one. The Postgres and SQLite migrations only do the I/O.
//
// Historical incidents stored the Nachrichtenkarte as an ordinary division and
// layer carrying the translated default labels, so matching has to accept the
// labels of every UI locale (ui/src/i18n/locales/*/translations.json,
// divisionsNames.Karte).
package messagemap

import (
	"encoding/json/v2"
	"strings"
)

// Locale values of divisionsNames.Karte (de, en, fr, it).
var (
	divisionDescriptions = []string{"Nachrichtenkarte", "Situation Map", "Carte de situation", "Carta informativa"}
	divisionNames        = []string{"Karte", "Map", "Carte", "Carta"}
	layerNames           = divisionDescriptions
)

const (
	// Kind is the persisted kind value of the message map division and layer.
	Kind = "MESSAGE_MAP"
	// FallbackDivisionName and FallbackDivisionDescription label a division added by the backfill.
	FallbackDivisionName        = "Karte"
	FallbackDivisionDescription = "Nachrichtenkarte"
	// FallbackLayerName labels a layer added by the backfill.
	FallbackLayerName = "Nachrichtenkarte"
)

// Event is the minimal view of a stored event the planner needs.
type Event struct {
	Type string
	Data []byte
}

type division struct {
	id          string
	name        string
	description string
	kind        string
	removed     bool
}

// DivisionPlan is the outcome for one incident's divisions.
type DivisionPlan struct {
	// AssignKindTo is the ID of an existing division to mark as the message map.
	AssignKindTo string
	// AddNew requests a new message map division.
	AddNew bool
}

// None reports whether nothing needs to be written.
func (p DivisionPlan) None() bool { return p.AssignKindTo == "" && !p.AddNew }

// PlanDivision folds the incident's division events (in stream order) and decides
// what to write. It is idempotent: once a MESSAGE_MAP division exists the plan is empty.
func PlanDivision(events []Event) (DivisionPlan, error) {
	divs := map[string]*division{}

	var order []string

	for _, e := range events {
		switch e.Type {
		case "DivisionAdded":
			var d struct {
				Division struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					Description string `json:"description"`
					Kind        string `json:"kind"`
				} `json:"division"`
			}
			if err := json.Unmarshal(e.Data, &d); err != nil {
				return DivisionPlan{}, err
			}

			if _, seen := divs[d.Division.ID]; !seen {
				order = append(order, d.Division.ID)
			}

			divs[d.Division.ID] = &division{
				id: d.Division.ID, name: d.Division.Name, description: d.Division.Description, kind: d.Division.Kind,
			}
		case "Imported":
			var d struct {
				Divisions []struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					Description string `json:"description"`
					Kind        string `json:"kind"`
				} `json:"divisions"`
			}
			if err := json.Unmarshal(e.Data, &d); err != nil {
				return DivisionPlan{}, err
			}

			for _, x := range d.Divisions {
				if _, seen := divs[x.ID]; !seen {
					order = append(order, x.ID)
				}

				divs[x.ID] = &division{id: x.ID, name: x.Name, description: x.Description, kind: x.Kind}
			}
		case "DivisionRenamed":
			var d struct {
				ID          string  `json:"id"`
				Name        string  `json:"name"`
				Description *string `json:"description"`
			}
			if err := json.Unmarshal(e.Data, &d); err != nil {
				return DivisionPlan{}, err
			}

			if div := divs[d.ID]; div != nil {
				div.name = d.Name
				if d.Description != nil {
					div.description = *d.Description
				}
			}
		case "DivisionKindAssigned":
			var d struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
			}
			if err := json.Unmarshal(e.Data, &d); err != nil {
				return DivisionPlan{}, err
			}

			if div := divs[d.ID]; div != nil {
				div.kind = d.Kind
			}
		case "DivisionRemoved":
			var d struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(e.Data, &d); err != nil {
				return DivisionPlan{}, err
			}

			if div := divs[d.ID]; div != nil {
				div.removed = true
			}
		}
	}

	var live []*division

	for _, id := range order {
		div := divs[id]
		if div.removed {
			continue
		}

		if div.kind == Kind {
			return DivisionPlan{}, nil
		}

		live = append(live, div)
	}

	// The description is what users read, so it is the stronger signal.
	for _, div := range live {
		if matches(div.description, divisionDescriptions) {
			return DivisionPlan{AssignKindTo: div.id}, nil
		}
	}

	for _, div := range live {
		if matches(div.name, divisionNames) {
			return DivisionPlan{AssignKindTo: div.id}, nil
		}
	}

	return DivisionPlan{AddNew: true}, nil
}

// LayerStream is the ordered event history of one layer stream.
type LayerStream struct {
	ID     string
	Events []Event
}

// LayerPlan is the outcome for one incident's layers.
type LayerPlan struct {
	// AssignKindTo is the ID of an existing layer to mark as the message map layer.
	AssignKindTo string
	// AddNew requests a new message map layer.
	AddNew bool
}

// None reports whether nothing needs to be written.
func (p LayerPlan) None() bool { return p.AssignKindTo == "" && !p.AddNew }

// PlanLayer decides what to write for an incident's layers. Streams must be
// ordered oldest first; the oldest matching layer wins.
func PlanLayer(streams []LayerStream) (LayerPlan, error) {
	type layerState struct {
		id      string
		name    string
		kind    string
		removed bool
	}

	var live []layerState

	for _, s := range streams {
		st := layerState{id: s.ID}

		for _, e := range s.Events {
			switch e.Type {
			case "Created", "Imported":
				var d struct {
					Name string `json:"name"`
					Kind string `json:"kind"`
				}
				if err := json.Unmarshal(e.Data, &d); err != nil {
					return LayerPlan{}, err
				}

				st.name, st.kind = d.Name, d.Kind
			case "Renamed":
				var d struct {
					Name string `json:"name"`
				}
				if err := json.Unmarshal(e.Data, &d); err != nil {
					return LayerPlan{}, err
				}

				st.name = d.Name
			case "KindAssigned":
				var d struct {
					Kind string `json:"kind"`
				}
				if err := json.Unmarshal(e.Data, &d); err != nil {
					return LayerPlan{}, err
				}

				st.kind = d.Kind
			case "Removed":
				st.removed = true
			}
		}

		if st.removed {
			continue
		}

		if st.kind == Kind {
			return LayerPlan{}, nil
		}

		live = append(live, st)
	}

	for _, st := range live {
		if matches(st.name, layerNames) {
			return LayerPlan{AssignKindTo: st.id}, nil
		}
	}

	return LayerPlan{AddNew: true}, nil
}

func matches(value string, candidates []string) bool {
	v := strings.TrimSpace(value)
	for _, c := range candidates {
		if strings.EqualFold(v, c) {
			return true
		}
	}

	return false
}
