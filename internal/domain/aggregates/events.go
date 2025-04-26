package aggregates

import (
	"time"

	"github.com/f-eld-ch/sitrep/internal/domain"
	"github.com/f-eld-ch/sitrep/internal/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/domain/journal"
	"github.com/hallgren/eventsourcing"
	"github.com/hallgren/eventsourcing/aggregate"
)

// Transition the person state dependent on the events
func (i *IncidentAggregate) Transition(event eventsourcing.Event) {
	switch e := event.Data().(type) {
	case *Opened:
		i.incident.OpenIncident(e.At)
	case *Closed:
		i.incident.Close(e.At)
	case *Locate:
		i.incident.SetLocation(e.Location)
	case *AddDivisions:
		for _, division := range e.Divisions {
			i.incident.AddDivision(division)
		}
	case *AddJournal:
		i.incident.AddJournal(e.Journal)
	}

	return
}

// Register the Aggregate to all events
func (f *IncidentAggregate) Register(r aggregate.RegisterFunc) {
	r(
		&Opened{},
		&Closed{},
		&Locate{},
		&AddDivisions{},
		&AddJournal{},
	)
}

// Events for Incident

// Opened is the event which opens an incident
type Opened struct {
	Name string
	At   time.Time
}

// Closed is the event which closes an Incident
type Closed struct {
	At time.Time
}

// Locate is the event which defines the location of  an incident
type Locate struct {
	Location incident.Location
}

// AddJournal is the event which adds a new Journal
type AddJournal struct {
	Journal journal.Journal
}

// AddDivisions is the event which adds new Divisions
type AddDivisions struct {
	Divisions []domain.Division
}
