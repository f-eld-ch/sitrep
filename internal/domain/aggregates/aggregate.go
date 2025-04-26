package aggregates

import (
	"errors"
	"fmt"
	"time"

	"github.com/f-eld-ch/sitrep/internal/domain"
	"github.com/f-eld-ch/sitrep/internal/domain/incident"
	"github.com/google/uuid"
	"github.com/hallgren/eventsourcing/aggregate"
)

func init() {
	uuid.EnableRandPool()
	aggregate.SetIDFunc(func() string { return domain.GenerateUUID().String() })
}

type IncidentAggregate struct {
	aggregate.Root
	incident incident.Incident
}

// OpenIncident constructor for Incident
func OpenIncident(name, location string) (*IncidentAggregate, error) {
	if name == "" {
		return nil, errors.New("name can't be blank")
	}
	i, err := incident.New(name, incident.Location{Name: location})
	if err != nil {
		return nil, err
	}

	ia := IncidentAggregate{incident: *i}
	aggregate.TrackChange(&ia, &Opened{Name: name, At: time.Now()})
	aggregate.TrackChange(&ia, &Locate{incident.Location{Name: location}})

	return &ia, nil
}

// Close closes the incident
func (i *IncidentAggregate) Close() error {
	if !i.incident.ClosedAt().IsZero() {
		return errors.New("already closed incident")
	}

	aggregate.TrackChange(i, &Closed{At: time.Now()})
	return nil
}

func (i IncidentAggregate) String() string {
	var reason string
	var aggregateType string

	if len(i.Events()) > 0 {
		reason = i.Events()[0].Reason()
		aggregateType = i.Events()[0].AggregateType()
	} else {
		reason = "No reason"
		aggregateType = "No aggregateType"
	}

	format := `IncidentAggregate:
	ID: %s
	Incident: %s,
	(First Reason: %s)
	(First AggregateType %s)
	(Pending aggregateEvents: %d)
	(aggregateVersion: %d)
`
	return fmt.Sprintf(format, i.ID(), i.incident, reason, aggregateType, len(i.Events()), i.Version())
}
