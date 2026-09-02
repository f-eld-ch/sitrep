// Package service_test contains integration-style tests for the application
// services. Every test runs against the in-memory event store — no database
// required. The inmem stack is a real implementation of the outbound ports, so
// these tests exercise the full write path: transaction → load → domain command
// → append → notify.
package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/inmem"
	"github.com/f-eld-ch/sitrep/internal/core/service"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// ── Test helpers ──────────────────────────────────────────────────────────────

var (
	testActor = identity.Actor{Sub: "test-sub", Email: "test@example.com", Name: "Tester"}
	testAt    = time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
)

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

// testStack wires the full inmem infrastructure and returns a factory and the
// underlying store so tests can verify persisted aggregate state.
func testStack(t *testing.T) (*service.Factory, *inmem.EventStore) {
	t.Helper()

	store := inmem.NewEventStore()
	factory := service.NewFactory(
		service.WithTransactor(inmem.NewTransactor()),
		service.WithClock(fixedClock{t: testAt}),
		service.WithIDs(inmem.UUIDGen{}),
		service.WithNotifier(inmem.NewNotifier()),
		service.WithMessageCounter(inmem.NewMessageCounter()),
	)

	return factory, store
}

// repos returns the four generic repositories backed by the given store.
func repos(store *inmem.EventStore) (
	incidents *eventstore.IncidentRepository,
	messages *eventstore.MessageRepository,
	layers *eventstore.LayerRepository,
	features *eventstore.FeatureRepository,
) {
	return eventstore.NewIncidentRepository(store),
		eventstore.NewMessageRepository(store),
		eventstore.NewLayerRepository(store),
		eventstore.NewFeatureRepository(store)
}

// ctx returns a background context with the test actor injected.
func ctx() context.Context {
	return identity.WithActor(context.Background(), testActor)
}

// newID returns a fresh random UUID (uuid.New is fine in tests).
func newID() uuid.UUID { return uuid.New() }
