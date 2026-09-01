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
