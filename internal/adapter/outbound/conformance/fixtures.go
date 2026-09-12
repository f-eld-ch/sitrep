package conformance

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// ── Minimal widget aggregate ──────────────────────────────────────────────────
// Used by the event store sub-suite to avoid importing domain packages.
// The conformance harness is intentionally domain-agnostic at the store level.

type (
	widgetCreated struct{ Name string }
	widgetRenamed struct{ Name string }
)

type widget struct {
	root eventsourcing.Root
	Name string
}

func newWidget(id uuid.UUID) *widget {
	a := &widget{}
	a.root.SetID(id)
	eventsourcing.Register(a, widgetCreated{}, widgetRenamed{})

	return a
}

func (a *widget) Root() *eventsourcing.Root { return &a.root }
func (a *widget) AggregateType() string     { return "Widget" }
func (a *widget) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case widgetCreated:
		a.Name = d.Name
	case widgetRenamed:
		a.Name = d.Name
	}

	return nil
}

func trackWidget(a *widget, data any) {
	eventsourcing.TrackChange(a, data, time.Now().UTC(), nil)
}

// rawEvent constructs a bare eventsourcing.Event for use in projection
// idempotency tests where we need to replay the exact same event twice.
func rawEvent(streamType string, streamID uuid.UUID, eventType string, version int, data any) eventsourcing.Event {
	raw, err := json.Marshal(data)
	if err != nil {
		panic("rawEvent: marshal: " + err.Error())
	}

	return eventsourcing.Event{
		StreamType: streamType,
		StreamID:   streamID,
		Version:    version,
		EventType:  eventType,
		Data:       json.RawMessage(raw),
		OccurredAt: time.Now().UTC(),
		RecordedAt: time.Now().UTC(),
	}
}
