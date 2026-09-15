// Package schadenplatz implements the Schadenplatz aggregate root.
//
// A Schadenplatz represents a geographic area of impact within an incident.
// Every incident automatically gets one default Schadenplatz ("Allgemein")
// when it is opened; additional ones can be created by operators.
//
// Casualties are recorded as deltas from message triage. The aggregate
// enforces the invariant that no running total ever goes below zero.
package schadenplatz

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// CasualtyTotals holds the running totals across all recorded messages.
type CasualtyTotals struct {
	Vermisste       int
	Tote            int
	Verletzte       int
	Obdachlose      int
	Eingeschlossene int
}

// Schadenplatz is the aggregate root for a geographic impact area.
type Schadenplatz struct {
	root eventsourcing.Root

	incidentID shared.IncidentID
	name       string
	isDefault  bool
	geoJSON    []byte
	casualties CasualtyTotals
	mergedInto *shared.SchadenplatzID
}

// New creates a new (empty) Schadenplatz aggregate ready to receive commands.
func New(id shared.SchadenplatzID) *Schadenplatz {
	s := &Schadenplatz{}
	s.root.SetID(uuid.UUID(id))
	eventsourcing.Register(s,
		Created{}, Renamed{}, GeometrySet{},
		CasualtiesRecorded{}, MergedIntoDefault{},
	)

	return s
}

// Root implements eventsourcing.Aggregate.
func (s *Schadenplatz) Root() *eventsourcing.Root { return &s.root }

// AggregateType implements eventsourcing.Aggregate.
func (s *Schadenplatz) AggregateType() string { return "Schadenplatz" }

// OwnerIncidentID implements eventsourcing.Owned.
func (s *Schadenplatz) OwnerIncidentID() uuid.UUID { return uuid.UUID(s.incidentID) }

// ──────────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────────

func (s *Schadenplatz) ID() shared.SchadenplatzID   { return shared.SchadenplatzID(s.root.ID()) }
func (s *Schadenplatz) IncidentID() shared.IncidentID { return s.incidentID }
func (s *Schadenplatz) Name() string                 { return s.name }
func (s *Schadenplatz) IsDefault() bool              { return s.isDefault }
func (s *Schadenplatz) GeoJSON() []byte              { return s.geoJSON }
func (s *Schadenplatz) Casualties() CasualtyTotals   { return s.casualties }
func (s *Schadenplatz) IsMerged() bool               { return s.mergedInto != nil }
func (s *Schadenplatz) MergedInto() *shared.SchadenplatzID { return s.mergedInto }

// ──────────────────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────────────────

// Create establishes the Schadenplatz for an incident.
func (s *Schadenplatz) Create(
	incidentID shared.IncidentID,
	name string,
	isDefault bool,
	at time.Time,
	actor string,
) error {
	if strings.TrimSpace(name) == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	eventsourcing.TrackChange(s, Created{
		IncidentID: incidentID,
		Name:       name,
		IsDefault:  isDefault,
	}, at, baseMeta(actor))

	return nil
}

// Rename changes the display name.
func (s *Schadenplatz) Rename(name, actor string, at time.Time) error {
	if err := s.requireActive(); err != nil {
		return err
	}

	if strings.TrimSpace(name) == "" {
		return shared.ValidationError{Field: "name", Message: "must not be empty"}
	}

	eventsourcing.TrackChange(s, Renamed{Name: name}, at, baseMeta(actor))

	return nil
}

// SetGeometry updates the GeoJSON geometry. Pass nil to clear.
func (s *Schadenplatz) SetGeometry(geoJSON []byte, actor string, at time.Time) error {
	if err := s.requireActive(); err != nil {
		return err
	}

	eventsourcing.TrackChange(s, GeometrySet{GeoJSON: geoJSON}, at, baseMeta(actor))

	return nil
}

// RecordCasualties records casualty deltas from a message triage.
// All resulting totals must remain non-negative.
func (s *Schadenplatz) RecordCasualties(
	sourceMessageID shared.MessageID,
	deltas CasualtyDeltas,
	at time.Time,
	actor string,
) error {
	if err := s.requireActive(); err != nil {
		return err
	}

	if err := s.validateCasualtyDeltas(deltas); err != nil {
		return err
	}

	eventsourcing.TrackChange(s, CasualtiesRecorded{
		SourceMessageID: sourceMessageID,
		Deltas:          deltas,
	}, at, baseMeta(actor))

	return nil
}

// MergeIntoDefault marks this Schadenplatz as merged into the default one.
// The caller is responsible for copying casualty totals to the default
// Schadenplatz before calling this command.
// Merging the default Schadenplatz into itself is rejected.
func (s *Schadenplatz) MergeIntoDefault(defaultID shared.SchadenplatzID, actor string, at time.Time) error {
	if err := s.requireActive(); err != nil {
		return err
	}

	if s.isDefault {
		return shared.ValidationError{Field: "schadenplatz", Message: "cannot merge the default Schadenplatz into itself"}
	}

	eventsourcing.TrackChange(s, MergedIntoDefault{DefaultSchadenplatzID: defaultID}, at, baseMeta(actor))

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Transition
// ──────────────────────────────────────────────────────────────────────────────

// Transition implements eventsourcing.Aggregate. Total, I/O-free.
func (s *Schadenplatz) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case Created:
		s.incidentID = d.IncidentID
		s.name = d.Name
		s.isDefault = d.IsDefault
	case Renamed:
		s.name = d.Name
	case GeometrySet:
		s.geoJSON = d.GeoJSON
	case CasualtiesRecorded:
		s.casualties.Vermisste += d.Deltas.Vermisste
		s.casualties.Tote += d.Deltas.Tote
		s.casualties.Verletzte += d.Deltas.Verletzte
		s.casualties.Obdachlose += d.Deltas.Obdachlose
		s.casualties.Eingeschlossene += d.Deltas.Eingeschlossene
	case MergedIntoDefault:
		id := d.DefaultSchadenplatzID
		s.mergedInto = &id
	default:
		return fmt.Errorf("schadenplatz.Transition: unhandled event type %T", e.Data)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func (s *Schadenplatz) requireActive() error {
	if s.mergedInto != nil {
		return shared.ErrSchadenplatzMerged
	}

	return nil
}

func (s *Schadenplatz) validateCasualtyDeltas(d CasualtyDeltas) error {
	if s.casualties.Vermisste+d.Vermisste < 0 {
		return shared.ErrCasualtyBelowZero
	}

	if s.casualties.Tote+d.Tote < 0 {
		return shared.ErrCasualtyBelowZero
	}

	if s.casualties.Verletzte+d.Verletzte < 0 {
		return shared.ErrCasualtyBelowZero
	}

	if s.casualties.Obdachlose+d.Obdachlose < 0 {
		return shared.ErrCasualtyBelowZero
	}

	if s.casualties.Eingeschlossene+d.Eingeschlossene < 0 {
		return shared.ErrCasualtyBelowZero
	}

	return nil
}

func baseMeta(actor string) map[string]any {
	return map[string]any{"actor": actor}
}
