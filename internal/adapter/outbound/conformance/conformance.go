// Package conformance provides a shared test suite for the outbound storage ports.
// inmem, SQLite, and Postgres all run against the same suite via their Factory.
//
// Files in this package are regular (non-_test.go) Go files so they can be
// imported from _test.go files in other packages. They may import testing and
// testify because this package is only ever compiled into test binaries.
package conformance

import (
	"context"
	"testing"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

// Backend is one fully wired storage stack under test.
// Nil optional fields skip their sub-suite.
type Backend struct {
	Store         outbound.EventStore
	Transactor    outbound.Transactor
	Notifier      outbound.EventNotifier
	Queries       outbound.Queries
	AccessQueries outbound.AccessQueries

	IncidentAccess outbound.IncidentAccessChecker
	GlobalAccess   outbound.GlobalAccessChecker

	// Lock, when non-nil, runs the projector lock sub-suite.
	Lock outbound.ProjectorLock
	// Users, when non-nil, runs the user repository sub-suite.
	Users outbound.FirstUserRepository

	// Project drains the event log into every read model synchronously.
	// Called after each write in query/projection sub-suites.
	Project func(ctx context.Context) error
	// ResetProjections resets all handlers and replays from cursor zero.
	ResetProjections func(ctx context.Context) error
	// ApplyEvent applies one event to the named handler in isolation (bypassing
	// the projector cursor) to verify per-event idempotency.
	ApplyEvent func(ctx context.Context, handler string, e eventsourcing.Event) error
}

// Factory constructs a fresh Backend for each test. It is called once per
// top-level sub-suite (e.g. once for eventstore tests, once for query tests),
// so each sub-suite starts with an empty database.
type Factory func(t *testing.T) *Backend

// Run executes the full conformance suite against the given factory.
func Run(t *testing.T, f Factory) {
	t.Helper()

	t.Run("EventStore", func(t *testing.T) {
		RunEventStore(t, f)
	})

	t.Run("Lock", func(t *testing.T) {
		RunLock(t, f)
	})

	t.Run("Projection", func(t *testing.T) {
		RunProjection(t, f)
	})

	t.Run("Queries", func(t *testing.T) {
		RunQueries(t, f)
	})

	t.Run("MessageAcknowledgements", func(t *testing.T) {
		RunMessageAcknowledgements(t, f)
	})

	t.Run("Timeline", func(t *testing.T) {
		RunTimeline(t, f)
	})

	t.Run("Listings", func(t *testing.T) {
		RunListings(t, f)
	})

	t.Run("FeatureChanges", func(t *testing.T) {
		RunFeatureChanges(t, f)
	})

	t.Run("ReadModels", func(t *testing.T) {
		RunReadModels(t, f)
	})

	t.Run("Lifecycles", func(t *testing.T) {
		RunLifecycles(t, f)
	})

	t.Run("Access", func(t *testing.T) {
		RunAccess(t, f)
	})

	t.Run("Users", func(t *testing.T) {
		RunUsers(t, f)
	})
}
