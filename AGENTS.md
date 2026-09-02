# SitRep Backend — Agent Guide

Read this before editing anything outside `ui/`.

The backend is a Go application using hexagonal architecture, event sourcing, and CQRS.
Design rationale, layer diagram, aggregate rules, and projector internals are all documented in
[docs/development/Backend Architecture.md](docs/development/Backend%20Architecture.md).
This file covers the practical concerns an agent needs to work safely in the codebase.

---

## Setup

Requirements: Go (version pinned in `go.mod`), Docker Compose, `golangci-lint`.

```bash
# 1. Start infrastructure (Postgres + Dex OIDC)
docker compose up -d

# 2. Run migrations (goose, embedded in the binary)
go run . migrate up

# 3. Start the server
go run .
```

The server listens on `:4180` by default (configurable via `config.yaml` — gitignored, never commit).
Local auth uses a static actor — no OIDC round-trip required for development.

---

## Before every commit — mandatory gates

Run these in order. `fmt` rewrites files; `run` checks what `fmt` produced.

```bash
golangci-lint fmt ./...
golangci-lint run ./...
go test ./...
```

| Command                  | What it checks                                    |
| ------------------------ | ------------------------------------------------- |
| `golangci-lint fmt ./...` | Canonical Go formatting (replaces `gofmt`)       |
| `golangci-lint run ./...` | Static analysis, import discipline, style rules  |
| `go test ./...`           | All unit and integration tests                   |

CI runs identical checks and rejects anything that fails.
Do **not** use `gofmt` directly — `golangci-lint fmt` is the single formatter.

### Commit messages

Conventional Commits, scoped by area:

```
feat(incident): add ChangeLocation command
fix(projection): make Moved/Restyled idempotent on replay
chore(migrations): add 00006_drop_readmodel_fks
refactor(service): extract division validation into aggregate
```

Common scopes: `incident`, `message`, `layer`, `feature`, `projection`, `migrations`, `graphql`,
`auth`, `cli`.

---

## Testing

All tests use [`testify`](https://github.com/stretchr/testify) — `assert` for non-fatal checks,
`require` for fatal ones (stops the test immediately on failure).

```go
import (
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

require.NoError(t, err)
assert.Equal(t, "expected", actual)
```

Never use `t.Fatal` / `t.Error` directly. Never use `log.Fatal` in tests.

### Running tests

```bash
go test ./...                                 # all packages
go test ./internal/core/service/...           # one subtree
go test -run TestRecordMessage ./...          # single test by name
go test -race ./...                           # race detector (run before PRs)
```

### Test strategy

Tests do **not** require Postgres. The in-memory stack
(`internal/adapter/outbound/eventstore/inmem`) is wired for all unit and integration tests.
Use `internal/cli/stack.go`'s `inmem` builder as the reference for how to assemble a full stack
in tests.

Three tiers:

- **Domain tests** — construct the aggregate directly, call commands, assert on the pending event
  list or accessor values. No services, no repositories.
- **Service tests** — use the in-memory event store and in-memory projector. Call `proj.CatchUp(ctx)`
  between a write and a read-model assertion to flush the projection synchronously.
- **Resolver tests** — exercise the full GraphQL resolver layer with the in-memory stack wired in.
  Use `internal/adapter/inbound/graphql/resolver_test.go` as the pattern.

Postgres-only behaviour (e.g. optimistic concurrency, `NOTIFY`/`LISTEN`) is tested by integration
tests that require a live database and are tagged accordingly — do not add a `+build integration`
tag without also supplying a Compose-based fixture.

---

## Directory layout

```
/
├── api/schema.graphql          — shared SDL contract; gqlgen and codegen read from here
├── migrations/                 — goose migration files (SQL + Go)
│   ├── *.sql                   — named NNNN_<slug>.sql
│   └── migrations.go           — registers Go migrations; set m.Source for display names
├── internal/
│   ├── eventsourcing/          — shared kernel: Root, TrackChange, Apply, Register, Owned interface
│   ├── core/
│   │   ├── domain/             — pure aggregates; zero infrastructure imports
│   │   │   ├── incident/
│   │   │   ├── message/
│   │   │   ├── layer/
│   │   │   ├── feature/
│   │   │   └── shared/         — error sentinels, value types (DivisionID, IncidentID, …)
│   │   ├── port/
│   │   │   ├── inbound/        — service interfaces called by resolvers
│   │   │   └── outbound/       — EventStore, Queries, Repositories, Transactor, …
│   │   └── service/            — application services + factory.go
│   ├── adapter/
│   │   ├── inbound/graphql/    — gqlgen resolver + generated code
│   │   └── outbound/
│   │       ├── eventstore/
│   │       │   ├── postgres/   — Postgres event store + projector + projection handlers
│   │       │   └── inmem/      — in-memory event store + synchronous projector (tests)
│   │       ├── queries/
│   │       │   ├── postgres/   — SQL read-model queries
│   │       │   └── inmem/      — in-memory read-model queries (tests)
│   │       └── user/postgres/  — user repository
│   ├── cli/
│   │   ├── serve.go            — composition root: wires every concrete type
│   │   └── stack.go            — postgres / inmem stack builders (shared by main + tests)
│   └── platform/identity/      — ActorFrom(ctx), LocalEnforcer
└── server/                     — Echo HTTP server, OIDC middleware, routes
```

---

## Key invariants

These are easy to get wrong and not always caught by the compiler.

### Nothing in `internal/core/` may import infrastructure

`internal/core/domain/` and `internal/core/service/` must not import `pgx`, `echo`, `gqlgen`,
or any other infrastructure package. The compiler won't stop you — the depguard linter will.
Run `golangci-lint run` before assuming an import is allowed.

### Compile-time interface assertions

Every adapter file that implements a port interface carries a blank-identifier assertion:

```go
var _ outbound.EventStore = (*EventStore)(nil)
```

Add one whenever you implement a new interface. It surfaces missing methods at build time, not
at runtime.

### Handlers must be idempotent

Projection handlers are replayed from the beginning whenever `Version()` changes, and from the
last batch cursor on restart. Every `Apply` case must produce the same result regardless of how
many times it runs. Use `INSERT … ON CONFLICT DO UPDATE` or remove-then-add patterns — never
plain `INSERT`.

### Mutation resolvers never call `outbound.Queries`

After a write, the resolver returns data from the aggregate state DTO (`inbound.IncidentState`,
`inbound.MessageState`, …) — not from the read model. The projector is asynchronous; a `Queries`
call in the same request would race.

### `TrackChange` calls `Transition` immediately

In-memory state is updated before the event is saved. A command that calls `TrackChange` twice
will see the updated state from the first call when it executes the second. This is intentional —
do not re-read from the aggregate between `TrackChange` calls.

### Service signatures

Application service methods always accept a `context.Context` first and return an error last.
Side-effecting methods return a state DTO as the first return value.

### Command signature convention

```go
func (a *Aggregate) CommandName(domainArgs ..., actor string, at time.Time) error
```

Actor string and timestamp always come last, in that order. The aggregate never reads the clock.

---

## Logging

The application uses the standard library `log/slog` throughout. The default logger is configured
at startup by `internal/cli/log.go` and replaced with the OTel fan-out logger when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set (`internal/cli/otel.go`). You never initialise a logger
yourself — use the package-level functions.

### Always pass context

Use the `Context` variants so that trace/span IDs are attached to every log line automatically:

```go
// correct — span IDs flow through
slog.DebugContext(ctx, "creating layer", "incident_id", incidentID, "actor", actor.Sub)
slog.InfoContext(ctx, "migration applied", "version", r.Source.Version)
slog.WarnContext(ctx, "preflight finding", "finding", w)
slog.ErrorContext(ctx, "service error", "operation", op, "error", err)

// wrong — never use the context-free variants inside request paths
slog.Debug("creating layer", ...)
slog.Info("migration applied", ...)
```

### Scoped loggers for long-lived components

Background components (projectors, servers) use a scoped logger stored on the struct so every
log line carries the component name without repeating it at every call site:

```go
type Projector struct {
    log *slog.Logger
    ...
}

func NewProjector(...) *Projector {
    return &Projector{
        log: slog.Default().WithGroup("projector"),
        ...
    }
}

// usage inside the struct — still passes ctx for trace correlation
p.log.Info("projection caught up", "handler", h.Name(), "applied", n)
```

### Log levels

| Level   | When to use                                                             |
| ------- | ----------------------------------------------------------------------- |
| `Debug` | Per-operation entry points in services — args and actor sub             |
| `Info`  | Lifecycle events: server start, migration applied, projector ready      |
| `Warn`  | Degraded but recoverable: missing config, preflight warnings            |
| `Error` | Unexpected infrastructure failures only — see `logIfUnexpected` below   |

### Domain errors are not logged at the service layer

`internal/core/service/assertions.go` defines `logIfUnexpected`, which suppresses logging for all
expected domain sentinels (`ErrNotFound`, `ErrIncidentNotOpen`, `ErrAlreadyClosed`, …). Those
errors are normal business outcomes and are handled at the resolver boundary. Only call
`logIfUnexpected` (or log at `Error`) for infrastructure failures that indicate something is
genuinely broken.

---

## OpenTelemetry instrumentation

All three signals (traces, metrics, logs) are exported via OTLP gRPC when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without it, the SDK is skipped and the application runs
with no-op providers — no code changes needed for local development.

### Traces — service methods

Every application service method opens a span and defers its end. The tracer is obtained once at
construction time via `otel.Tracer`:

```go
type LayerService struct {
    tracer trace.Tracer
    ...
}

func NewLayerService(...) *LayerService {
    return &LayerService{tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"), ...}
}

func (s *LayerService) CreateLayer(ctx context.Context, ...) (shared.LayerID, error) {
    ctx, span := s.tracer.Start(ctx, "LayerService.CreateLayer",
        trace.WithAttributes(
            attribute.String("incident.id", incidentID.String()),
            attribute.String("layer.name", name),
        ))
    defer span.End()

    // ... do work ...

    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return shared.LayerID{}, err
    }
    // Set output attributes after success
    span.SetAttributes(attribute.String("layer.id", layerID.String()))
    return layerID, nil
}
```

Rules:
- Pass `ctx` from `tracer.Start` into all downstream calls — this propagates the span context.
- Set **input** attributes at span start, **output** attributes (e.g. generated IDs) on success.
- Call `span.RecordError` + `span.SetStatus(codes.Error, …)` on every error return.
- Use the tracer name `"github.com/f-eld-ch/sitrep/service"` for all application services.

Automatic instrumentation (no changes needed):
- HTTP layer: `otelecho` middleware
- GraphQL: `otelgqlgen` middleware
- SQL: `otelpgx` tracer on the pool

When you add a new service method, follow the pattern above. When you add a new adapter that
performs I/O (HTTP call, SQL query), check whether an OTel contrib library already instruments it
before adding manual spans.

### Traces — projector

All projector implementations use `otel.Tracer("sitrep/projector")`. Keep spans around finite
units of work: lock-acquire attempts, checkpoint initialization, catch-up, handler reset/rebuild,
retention, and per-event apply. Do not wrap long-lived `Run` loops or leadership periods in spans;
the `projector.running` gauge covers lifecycle. Attach stable attributes such as handler name,
lock name, stream type, event type, stream ID, event version, and applied-event counts. Record
errors and set span status before returning them, but treat `context.Canceled` during shutdown as
a normal lifecycle outcome rather than a span error.

The Postgres projector relies on `NOTIFY` rather than periodic polling. Its notifier keeps a
persistent `LISTEN` connection while the projector is running so notifications can queue while a
catch-up pass is applying events.

### Metrics — projector

The projectors expose counters, histograms, and gauges registered via `otel.Meter`:

| Metric name                  | Type      | Attributes                        |
| ---------------------------- | --------- | --------------------------------- |
| `projector.events.applied`   | counter   | `handler`                         |
| `projector.catchup.duration` | histogram | —                                 |
| `projector.errors`           | counter   | `handler`, `type` (checkpoint/read/apply) |
| `projector.dead_letters`     | counter   | `handler`                         |
| `projector.leadership.acquired` | counter | —                                 |
| `projector.lock.contended`   | counter   | —                                 |
| `projector.running`          | gauge     | `backend`                         |

When adding metrics elsewhere, obtain a meter with a package-scoped name:

```go
meter := otel.Meter("sitrep/projector")   // or "sitrep/service", "sitrep/eventstore"
counter, _ := meter.Int64Counter("my.metric",
    metric.WithDescription("What it counts"),
    metric.WithUnit("{event}"),
)
```

Ignore the error from `meter.Int64Counter` — the OTel SDK returns a valid no-op instrument on
error; swallowing it is intentional and consistent with the rest of the codebase.

### Logs — OTel bridge

When OTel is configured, `internal/cli/otel.go` replaces the default `slog` handler with a
multi-handler that fans out to both stdout (text) and the OTLP log bridge (`otelslog`). The bridge
filters at `Info` and above — `Debug` lines go only to stdout. This is automatic; no code change
is needed to emit log records to the collector.

---

## Functional options

The codebase uses functional options for constructors where the number of dependencies would make
a plain function signature unwieldy, or where options are genuinely optional. Two variants are in
use — choose based on whether configuration can fail.

### Infallible options — `type Option func(*T)`

Used when setting a field cannot produce an error (e.g. `service.Factory`).

```go
// Type alias — just a function that mutates the struct.
type FactoryOption func(*Factory)

// Each option is a function that returns the option.
func WithTransactor(tx outbound.Transactor) FactoryOption {
    return func(f *Factory) { f.tx = tx }
}

func WithClock(clock outbound.Clock) FactoryOption {
    return func(f *Factory) { f.clock = clock }
}

// Constructor applies all options in order.
func NewFactory(opts ...FactoryOption) *Factory {
    f := &Factory{}
    for _, o := range opts {
        o(f)
    }
    return f
}

// Call site — at the composition root.
factory := service.NewFactory(
    service.WithTransactor(tx),
    service.WithClock(clock),
    service.WithIDs(ids),
    service.WithNotifier(notifier),
    service.WithMessageCounter(counter),
)
```

### Fallible options — `type Option func(*T) error`

Used when configuration can fail (e.g. `server.Server`, where wiring a route group may error).

```go
type Option func(*Server) error

func WithPort(port uint) Option {
    return func(s *Server) error {
        if port == 0 {
            return errors.New("port must be non-zero")
        }
        s.port = port
        return nil
    }
}

// Constructor collects errors rather than panicking.
func NewServer(opts ...Option) *Server {
    s := &Server{}
    for _, o := range opts {
        if err := o(s); err != nil {
            // surface at startup — a misconfigured server must not start silently
            panic(fmt.Sprintf("server option: %v", err))
        }
    }
    return s
}
```

### When to use functional options

Use them when a constructor has more than ~4 dependencies, or when some of those dependencies are
optional (e.g. OIDC client). For simple types with 1–3 required parameters, a plain constructor
is clearer — don't introduce options just for consistency.

The `service.Factory` pattern is the primary use case: it holds the **cross-cutting**
dependencies (transactor, clock, IDs, notifier) that every service needs, so they are injected
once rather than threaded through every `NewXxxService` call individually. Aggregate-specific
repositories are passed directly to the factory's service-builder methods, not via options,
because they are not shared across services.

---

## GraphQL — regenerating after schema changes

Edit `api/schema.graphql`, then regenerate:

```bash
go generate ./internal/adapter/inbound/graphql/...
```

This overwrites `schema.resolvers.go` — new resolver stubs are appended; existing implementations
are preserved. Never edit the generated `generated/` package by hand.

---

## Migrations

Migrations live in `migrations/`. Use goose conventions:

- SQL: `NNNN_<slug>.sql` with `-- +goose Up` / `-- +goose Down` annotations.
- Never change past migration files that may already be committed or applied; add a new migration instead. Only edit migration files that are still uncommitted and not yet applied anywhere.
- Go: register in `migrations/migrations.go` via `goose.NewGoMigration`; always set `m.Source`
  to the filename so the migration appears correctly in goose output:
  ```go
  m := goose.NewGoMigration(4, &goose.GoFunc{RunTx: up}, &goose.GoFunc{RunTx: down})
  m.Source = "00004_import.go"
  ```

Migrations run automatically on `go run . migrate up`. Never apply schema changes by hand against
the dev database — they will be lost on the next `migrate up` run.

---

## Gotchas

- **`gofmt` is not the formatter.** Always use `golangci-lint fmt ./...`. Running `gofmt`
  directly may produce output that conflicts with the linter's expectations.

- **`service.Factory` is the wiring point.** When a service gains a new dependency, update
  `internal/core/service/factory.go` and both stack builders in `internal/cli/stack.go` (postgres
  and inmem). Tests that construct services directly will fail to compile otherwise.

- **Bump `Version()` when changing a handler's logic.** Forgetting this means the existing
  projection is not rebuilt after deploy — stale read-model data silently persists. Any change to
  a projection handler's `Apply` logic or its `Reset` schema must be accompanied by a
  `Version()` increment.

- **`Imported` events are fat by design.** Each aggregate has an `Imported` event that carries the
  full historical state. They are written once by the data migration and must not be used for normal
  domain operations. Do not add new `Imported` events for ordinary mutations.

- **Read-model FK constraints are dropped.** Migration `00006` drops the foreign-key constraints
  from `rm_incident_division`, `rm_message`, and `rm_layer_features` back to `rm_incident`.
  `TRUNCATE rm_incident` therefore does **not** cascade. If you add a new read-model table with an
  FK to `rm_incident`, drop that constraint in a new migration — otherwise projection rebuilds will
  fail.

- **Message numbers are counters, not sequence positions.** `eventsourcing.incident_counters` is
  locked for the duration of the write transaction to guarantee gapless assignment. Do not derive
  message numbers from list position or event version.

- **Feature IDs are deterministic UUIDs.** The UI derives feature IDs with `uuidv3(drawId, URL)`.
  The backend accepts the client-supplied ID — it never generates one for `PlaceFeature`. Changing
  this breaks re-sent create idempotency.

- **`Owned` interface for `aggregate_index`.** Aggregates that belong to an incident implement
  `eventsourcing.Owned` (`OwnerIncidentID() uuid.UUID`). The Postgres event store checks this
  interface in `Append` and upserts into `eventsourcing.aggregate_index` on version 1. New
  aggregates that are owned by an incident must implement this interface.
