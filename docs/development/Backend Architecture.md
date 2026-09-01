# Backend Architecture

## Overview

The sitrep backend is a Go application built around three interlocking principles:

- **Hexagonal architecture** — the business core has no knowledge of HTTP, databases, or any other infrastructure. All infrastructure concerns are adapters that plug into the core via interfaces.
- **Event sourcing** — every state change is recorded as an immutable domain event. Current state is derived by replaying the event log, never mutated in place.
- **CQRS** — writes go through aggregates and the event store; reads go through asynchronously-maintained projection tables that are optimised for query patterns.

---

## Hexagonal Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Inbound Adapters                      │
│   GraphQL resolvers (gqlgen)  ·  Echo HTTP  ·  OIDC     │
└────────────────────┬────────────────────────────────────┘
                     │ calls inbound ports
┌────────────────────▼────────────────────────────────────┐
│                  Inbound Ports                           │
│   IncidentService · MessageService · LayerService        │
│   FeatureService  (internal/core/port/inbound)           │
└────────────────────┬────────────────────────────────────┘
                     │ implemented by
┌────────────────────▼────────────────────────────────────┐
│               Application Services                       │
│   internal/core/service/{incident,message,layer,feature} │
│   Own the transaction boundary. Orchestrate domain calls.│
└────────────────────┬────────────────────────────────────┘
                     │ calls outbound ports
┌────────────────────▼────────────────────────────────────┐
│                  Outbound Ports                          │
│   EventStore · Transactor · Repositories · Queries       │
│   UserRepository · EventNotifier · Clock · IDs           │
│   (internal/core/port/outbound)                          │
└────────────────────┬────────────────────────────────────┘
                     │ implemented by
┌────────────────────▼────────────────────────────────────┐
│                  Outbound Adapters                       │
│   Postgres event store  ·  Projector  ·  Read-model      │
│   queries  ·  User repository  ·  In-memory (tests)      │
└─────────────────────────────────────────────────────────┘
```

### Package layout

| Layer | Package |
|---|---|
| Domain core | `internal/core/domain/{incident,message,layer,feature,shared}` |
| Shared kernel | `internal/eventsourcing` |
| Inbound ports | `internal/core/port/inbound` |
| Outbound ports | `internal/core/port/outbound` |
| Application services | `internal/core/service` |
| Inbound adapter — GraphQL | `internal/adapter/inbound/graphql` |
| Outbound adapter — generic repositories | `internal/adapter/outbound/eventstore` |
| Outbound adapter — Postgres event store | `internal/adapter/outbound/eventstore/postgres` |
| Outbound adapter — Postgres projector | `internal/adapter/outbound/eventstore/postgres/projection` |
| Outbound adapter — in-memory event store | `internal/adapter/outbound/eventstore/inmem` |
| Outbound adapter — in-memory projector | `internal/adapter/outbound/eventstore/inmem/projection` |
| Outbound adapter — Postgres read-model queries | `internal/adapter/outbound/queries/postgres` |
| Outbound adapter — in-memory read-model queries | `internal/adapter/outbound/queries/inmem` |
| Outbound adapter — Postgres user repository | `internal/adapter/outbound/user/postgres` |
| Identity bridge | `internal/platform/identity` |
| HTTP server & auth | `server/` |
| CLI & composition root | `internal/cli` |

### Key rule

Nothing inside `internal/core/` imports `pgx`, `echo`, `gqlgen`, or any other infrastructure package. The domain and services depend only on Go standard library types and the interfaces defined in `internal/core/port/`. Adapters import the ports; the ports never import adapters.

Compile-time assertions (`var _ outbound.Xyz = (*ConcreteType)(nil)`) appear in every adapter file to catch missing interface methods at build time rather than at runtime.

---

## Event Sourcing

### Shared kernel

`internal/eventsourcing` contains the I/O-free primitives used by every aggregate. It has no infrastructure dependencies.

```go
// Every aggregate embeds Root and registers its event types at construction.
type Root struct { /* id, version, pending events, type registry */ }

// Commands record a change:
TrackChange(aggregate, eventData, occurredAt, metadata)
//  → bumps version
//  → calls Transition (immediate in-memory state update)
//  → appends to pending list

// The event store replays history:
Apply(aggregate, event)
//  → decodes json.RawMessage via the type registry
//  → calls Transition
//  → advances version
```

### Aggregate structure

Each aggregate (`Incident`, `Message`, `Layer`, `Feature`) follows the same pattern:

```
domain/incident/
  aggregate.go   — Incident struct, New(), AggregateType(), Transition()
  events.go      — plain structs with json tags: Opened, Renamed, Closed, …
  commands.go    — Open(), Rename(), Close(), … (validate → TrackChange)
```

A command method never writes to the database. It validates the invariant, calls `TrackChange` with the event data struct, which calls `Transition` to update in-memory state and appends to the pending list. The service then saves the aggregate via the repository.

### Write path

```
HTTP request
  → resolver (parse + validate input)
    → service.WithinTx(ctx, func() {
        aggregate = repo.Load(ctx, id)   // replay from event store
        aggregate.Command(args)          // validate + TrackChange
        repo.Save(ctx, aggregate)        // Append pending events
      })
    → notifier.Notify(ctx)              // NOTIFY pg channel
```

`repo.Load` calls `EventStore.Load`, which replays all events for the stream by calling `Apply` for each one. `repo.Save` calls `EventStore.Append`, which inserts the pending events in a single statement within the open transaction.

### Snapshots

As an aggregate accumulates events over its lifetime, loading it requires replaying every event from version 1. For aggregates with long histories this replay latency grows linearly. Snapshots cut that cost: a snapshot captures the full aggregate state at a specific version so that load only needs to replay events appended after the snapshot was taken.

The `outbound.SnapshotStore` port defines the contract:

```go
type SnapshotStore interface {
    // Load restores a previously saved snapshot into a. Returns found=false if none exists
    // or if the stored schema version does not match the aggregate's current version.
    // A snapshot is always discardable — on mismatch the repository falls back to full replay.
    Load(ctx context.Context, streamType string, id uuid.UUID, a Aggregate) (found bool, err error)

    // Save persists the current aggregate state as a snapshot.
    Save(ctx context.Context, a Aggregate) error
}
```

When wired, the load sequence becomes:

```
repo.Load(id)
  ├── snapshot.Load(id, aggregate)      ← fast path: restore state at version N
  │       found=true  → replay only events with version > N
  │       found=false → replay all events from version 1
  └── EventStore.Load(id, after=snapshotVersion)
```

**Current status:** Both the PostgreSQL and in-memory adapters ship a `NoopSnapshotStore` that always returns `found=false` and discards `Save`. The repositories do not yet call the snapshot store — they always perform a full replay. The port exists so that a concrete implementation can be added per aggregate type once replay latency is measured and proven to matter. The rule in the port doc is explicit: *enable per aggregate type only on measured load latency, never speculatively.*

### Optimistic concurrency

Each event carries a monotonically increasing version number scoped to its stream. When the event store appends pending events it enforces that the version has not advanced since the aggregate was loaded — if another writer committed first, the append is rejected and the caller receives a concurrency conflict error. There are no pessimistic locks.

The `modifyFeature` mutation avoids a conflict by loading the `Feature` aggregate once and applying both `Move` and `Restyle` within a single operation, rather than as two separate mutations that would race on the same version.

---

## Projectors

Projectors maintain denormalised read-model tables from the event log. They run as a background goroutine and process events asynchronously after a write.

### Architecture

```
event store
        │
        │  notification channel wake-up
        │  + periodic poll fallback
        ▼
   Projector.Run(ctx)
        │
        ├─ per-handler catch-up loop
        │       read events after checkpoint
        │       for each event: handler.Handle(ctx, event)
        │       advance checkpoint
        │
        └─ dead-letter parking on repeated failure
```

After each successful write the event store notifies the projector via the `EventNotifier` port. The projector wakes up, reads all events past its last checkpoint, and processes them. A periodic poll acts as a fallback in case a notification is missed.

### Checkpoint and versioning

Each handler has:
- A `Name() string` — stable identifier used to store its checkpoint.
- A `Version() int` — if the stored checkpoint version does not match, the handler calls `Reset()` which discards its read-model state and replays from the beginning. This allows projectors to be evolved: increment the version, redeploy, and the projection rebuilds automatically.

### Projection handlers

| Handler | Reads events from | Writes to |
|---|---|---|
| `IncidentHandler` | `Incident` stream | `rm_incident` |
| `IncidentDivisionHandler` | `Incident` stream | `rm_incident_division` |
| `MessageHandler` | `Message` stream | `rm_message` |
| `LayerFeaturesHandler` | `Layer` + `Feature` streams | `rm_layer_features` |

### Read-model tables

```
rm_incident          — one row per incident (name, location, status, timestamps)
rm_incident_division — one row per division per incident
rm_message           — one row per message (content, sender, receiver, medium, msg_time, triage, …)
rm_layer_features    — one row per layer; geojson holds the full FeatureCollection;
                       revision increments on every feature change for client-side diffing
```

### Error handling

If a handler returns an error, the projector retries with exponential backoff. If all retries fail, the failing event is parked in a dead-letter store and the projector advances past it to avoid getting stuck. Dead-lettered events can be inspected and replayed once the underlying issue is fixed.

### CQRS split

The write and read paths are fully separated and never share types.

**Write path — aggregates and state DTOs**

Services return state DTOs (`IncidentState`, `MessageState`, defined in `internal/core/port/inbound`) built directly from the aggregate in memory immediately after a write. Mutation resolvers use these DTOs to build their response. They do **not** re-read from the projection tables — which avoids a read-after-write race, because the projector processes events asynchronously and may not have caught up yet.

**Read path — `outbound.Queries` port**

Query resolvers (`incidents`, `incident`, `message`, `layersForIncident`) bypass the service layer entirely and call `outbound.Queries` directly. Queries are not part of the services because they have no invariants to enforce and no aggregate to load — mixing them into services would couple unrelated concerns and create a path where a read could be issued inside an open write transaction, returning stale results.

The `outbound.Queries` port and its read-model row types (`IncidentRM`, `MessageRM`, `LayerRM`, `DivisionRM`) are defined in `internal/core/port/outbound/readmodels.go`. These types are plain data bags:

- They carry **denormalised** state read from the `rm_*` projection tables.
- They are **never passed back** to the write side — no service method accepts or returns an `*RM` type.
- The `LayerRM` carries the full GeoJSON FeatureCollection as an opaque `json.RawMessage` so resolvers can forward it to the client without parsing; individual Feature objects are extracted on demand.

**Resolver wiring**

The GraphQL `Resolver` struct holds both sides independently:

```go
type Resolver struct {
    Incidents inbound.IncidentService  // write
    Messages  inbound.MessageService   // write
    Layers    inbound.LayerService     // write
    Features  inbound.FeatureService   // write
    Queries   outbound.Queries         // read — bypasses services entirely
}
```

**Implementations**

| Backend | Package |
|---|---|
| PostgreSQL | `internal/adapter/outbound/queries/postgres` — queries `rm_*` tables via SQL |
| In-memory | `internal/adapter/outbound/queries/inmem` — reads from the in-memory projection handlers |

### Projector ↔ Queries synchronisation

The Projector and Queries are closely coupled even though they share no port or interface — their connection is the **read-model storage layer**. The Projector is its exclusive writer; Queries is its exclusive reader.

```
Write path                           Read-model storage        Read path
─────────────────────────────────    ──────────────────────    ───────────────────
Service → EventStore.Append          rm_incident               Queries.ListIncidents
        → Notifier.Notify      →     rm_message            →   Queries.ListMessages
                                     rm_layer_features         Queries.ListLayers
Projector.CatchUp
  handler.Apply (writes)             (shared storage)          (reads)
```

**Consistency model — eventual**

The projector runs asynchronously. A `Queries` call issued in the same HTTP request that triggered the write will likely return state that does not yet include that write. This is intentional and safe because:

- Mutation resolvers never call `Queries` — they use the aggregate state DTO returned by the service.
- Query resolvers serve separate requests, by which time the projector has almost certainly caught up (sub-millisecond under normal load with NOTIFY wake-up).

**PostgreSQL**

Both the projector and the queries implementation hold a `*pgxpool.Pool` pointed at the same database. Synchronisation is entirely implicit: the projector commits a transaction, the `rm_*` rows become visible, and the next SQL query from `Queries` reads them. No shared Go state; no explicit coordination needed.

**In-memory**

The handler instances are the shared state. The same pointers are passed to both the projector and the queries implementation at construction time:

```go
incidents := projection.NewIncidentHandler()
messages  := projection.NewMessageHandler()
layers    := projection.NewLayerFeaturesHandler()

proj    := projection.NewProjector(store, []projection.Handler{incidents, messages, layers})
queries := inmem.NewQueries(incidents, divisions, messages, layers)
```

The projector calls `handler.Apply`, which mutates the maps. `Queries` reads those same maps under a read lock. The explicit synchronisation point in tests is `proj.CatchUp(ctx)` — calling it between a write and a read assertion guarantees the projector has processed all pending events before the assertion runs.

### No shared serialization type

There is no Go type that both the Projector and Queries depend on to exchange data. Their only coupling is the storage layer itself.

**PostgreSQL** — the contract is the `rm_*` table schema (column names and types). The Projector decodes event JSON into ad-hoc local structs and executes SQL `INSERT`/`UPDATE` statements. Queries scans SQL rows into `*RM` types. Neither side imports the other; the database schema is the interface.

**In-memory** — the `*Row` structs (`IncidentRow`, `MessageRow`, `LayerRow`) in the projection package act as the in-memory table schema. The Projector writes into them; Queries reads from them and maps to `*RM` types. This coupling is contained within the adapter boundary and involves no serialization.

The `*RM` types (`IncidentRM`, `MessageRM`, `LayerRM`) are output-only — they belong to the `outbound.Queries` port and flow only toward the resolver. The Projector never sees them. This means the Projector's internal storage shape can evolve independently of how Queries presents data to callers, as long as what ends up in storage satisfies what Queries expects to read. A schema change to an RM type does not force a Projector change, and vice versa.

---

## Event Store Implementations

The `outbound.EventStore` port defines a storage-agnostic contract. Implementations are adapters; the core never references them directly.

```go
type EventStore interface {
    Load(ctx, aggregate) error
    Append(ctx, aggregate) error
}
```

### In-memory (`inmem`)

`internal/adapter/outbound/eventstore/inmem`

**Event store:** Stores events in a plain Go slice keyed by stream. No persistence, no concurrency guarantees beyond a single goroutine.

**Projector:** `internal/adapter/outbound/eventstore/inmem/projection`

A synchronous projector backed by plain Go maps. It exposes a `CatchUp(ctx)` method that processes all events appended since the last cursor, which lets tests drive the full write→project→read cycle without goroutines or timers. `Run(ctx)` does an initial `CatchUp` and then blocks until the context is cancelled, satisfying `outbound.Projector` as a drop-in for the no-op.

Handlers (`IncidentHandler`, `IncidentDivisionHandler`, `MessageHandler`) mirror the PostgreSQL handlers event-by-event but mutate in-memory maps under a mutex instead of executing SQL. They expose typed query methods (`Get`, `All`, `ForIncident`) so tests can assert on read-model state directly.

A `Reset(ctx)` method clears all handler state and replays from the beginning — demonstrating the same version-triggered rebuild semantics as the PostgreSQL projector, but synchronously.

**Notifier:** In-process buffered channel. `Notify` sends a token; `Wait` blocks until a token arrives or the context is cancelled. No database connection required.

### PostgreSQL (`postgres`)

`internal/adapter/outbound/eventstore/postgres`

#### Event store

Events are stored in `eventsourcing.events` — a single append-only table inside a dedicated schema. One row per event. The schema is managed by goose migrations (`migrations/00002_eventsourcing.sql`).

**Table: `eventsourcing.events`**

| Column | Type | Purpose |
|---|---|---|
| `stream_type` | `text` | Aggregate type string, e.g. `"Incident"` |
| `stream_id` | `uuid` | Aggregate ID |
| `version` | `int` | Monotonically increasing per stream; primary key component |
| `event_type` | `text` | Go struct name used to decode `data`, e.g. `"Opened"` |
| `data` | `jsonb` | JSON-encoded event payload |
| `metadata` | `jsonb` | Actor sub and any other cross-cutting fields |
| `occurred_at` | `timestamptz` | When the domain event happened — may be operator-supplied |
| `recorded_at` | `timestamptz` | Wall-clock time at insert, set by the database |
| `xid` | `xid8` | PostgreSQL transaction ID, set by the database at insert |
| `seq` | `bigserial` | Auto-increment tie-breaker within a transaction |

`PRIMARY KEY (stream_type, stream_id, version)` — this is what enforces optimistic concurrency. A conflicting insert raises a unique-violation error which the event store maps to an `errOptimisticConflict` sentinel.

An index on `(xid, seq)` supports the projector's global ordering query.

**Load** (`EventStore.Load`): selects all events for a given `(stream_type, stream_id)` ordered by `version` and returns them as `[]eventsourcing.Event` with `Data` as `json.RawMessage`. `Apply` decodes each one via the aggregate's type registry.

**Append** (`EventStore.Append`): must be called within a transaction opened by the `Transactor`. It iterates the aggregate's pending events, JSON-encodes `Data` and `Metadata`, and inserts each row. The database returns `(xid, seq)` which are packed into an opaque 16-byte `Cursor` value for the projector.

**Read** (`EventStore.Read`): used exclusively by the projector. Selects up to `batchSize` (100) events with `(xid, seq) > cursor` and `xid < pg_snapshot_xmin(pg_current_snapshot())`. The snapshot watermark prevents the projector from reading events whose transaction has not yet committed, which avoids the classic SERIAL gap race: a row with a lower sequence number could still be in-flight if its transaction started before but commits after a row with a higher sequence.

**Supporting tables:**

- `eventsourcing.aggregate_index` — maps every `(stream_type, stream_id)` to its owning `incident_id` for retention/purge queries without scanning the full event log.
- `eventsourcing.incident_counters` — per-incident counter for gapless, immutable message numbers. The row is locked for the duration of the write transaction so two concurrent `RecordMessage` calls cannot get the same number.

#### Transactor

`Transactor.WithinTx` begins a `pgx` transaction, stores it in the context under a package-private key, and passes the enriched context to the work function. `EventStore.Append` and any read-model writes that need to be atomic retrieve the transaction via `TxFromCtx`. This means the event append and any supporting writes (e.g. the message counter increment) happen in a single database transaction.

#### Notifier

After `Transactor.WithinTx` commits, the service calls `Notifier.Notify`, which issues a `NOTIFY <channel>` (default channel name: `events`). The projector holds a dedicated connection that has issued `LISTEN <channel>`; `Wait` blocks on that connection until a notification arrives or the context is cancelled.

#### Projector

`internal/adapter/outbound/eventstore/postgres/projection`

**Start-up — version check:** On `Run`, before entering the main loop, the projector calls `initCheckpoints`. For each handler it reads the stored `version` from `eventsourcing.projection_checkpoint`. If the stored version differs from `h.Version()`, it calls `h.Reset()` (truncates the handler's read-model tables), clears any dead-letter rows for that handler, and resets the cursor to `NULL` (replay from beginning). This makes schema or logic changes to a handler self-healing: increment `Version()`, deploy, and the projection rebuilds automatically.

**Main loop:**

```
catchUp()          ← process all events since each handler's checkpoint
  │
  └── for each handler:
        cursor = loadCheckpoint(handler.Name())
        loop:
          events, next = store.Read(ctx, cursor, batchSize=100)
          for each event:
            if handler.Handles(streamType, eventType):
              applyWithDeadLetter(handler, event)   ← up to 3 attempts, exponential backoff
          saveCheckpoint(handler.Name(), next)
          cursor = next
          break if len(events) < batchSize

select:
  ctx.Done()    → return
  pollTicker    → catchUp() again (500ms fallback)
  notifier.Wait → catchUp() again (NOTIFY wake-up, 2s timeout)
```

Each `h.Apply` call runs inside its own database transaction so a handler failure is rolled back cleanly. The checkpoint is advanced per batch, not per event, so a restart after a partial batch re-processes the batch from the last saved cursor — handlers must therefore be idempotent.

**Dead-letter:** If all 3 attempts fail, `parkDeadLetter` upserts a row into `eventsourcing.projection_dead_letter` recording the projection name, cursor, event coordinates, error text, and attempt count. The projector then advances the checkpoint past the failing event so one bad event cannot permanently stall the projection. Dead-lettered rows can be replayed by resetting the checkpoint cursor to before the parked event.

**Read-model tables** (schema: `migrations/00003_readmodels.sql`):

| Table | Owner handler | Description |
|---|---|---|
| `rm_incident` | `IncidentHandler` | One row per incident — name, status flags, location JSON, timestamps |
| `rm_incident_division` | `IncidentDivisionHandler` | One row per division per incident; soft-deleted via `removed_at` |
| `rm_message` | `MessageHandler` | One row per message — all fields including `msg_time`, `division_ids uuid[]`, author/editor subs |
| `rm_layer_features` | `LayerFeaturesHandler` | One row per layer; `geojson jsonb` holds the full `FeatureCollection`; `revision int` increments on every feature change for client-side diff detection |

### SQLite (planned)

**Event store:** Same schema shape as PostgreSQL — one append-only events table with stream type, stream ID, version, payload, and timestamps. The unique constraint on `(stream_type, stream_id, version)` provides the same optimistic concurrency guarantee.

**Projector:** The database notification mechanism would be replaced with an in-process channel signalled directly by the event store after each append. Checkpoint and dead-letter state would be stored in dedicated SQLite tables. No changes to the projector port interface or handler implementations would be required.

---

## Aggregate Rules

### Commands

A command is a public method on the aggregate that represents the intent to change state.

**Rules:**

1. **Validate before recording.** Check all invariants and return a typed error (`shared.ValidationError`, `shared.ErrAlreadyClosed`, …) *before* calling `TrackChange`. If validation fails, no event is emitted and the aggregate state is unchanged.

2. **No I/O.** Commands must not touch the database, clock, or any other external system. Timestamps and generated IDs are passed in as parameters by the service.

3. **One logical operation → one or more events.** A single command may call `TrackChange` multiple times when the operation is naturally decomposed (e.g. `UpdateDivisions` emits individual `DivisionAdded`/`DivisionRenamed`/`DivisionRemoved` events rather than a single bulk event). Each event must still be independently meaningful to a projector.

4. **State is visible immediately.** `TrackChange` calls `Transition` before appending to the pending list. Subsequent commands on the same aggregate within the same service call see the updated state.

5. **Actor and timestamp are always passed in.** The actor (`identity.Actor.Sub`) and the wall-clock time are provided by the service. The aggregate never reads the clock or the identity context itself.

6. **Signature convention:**
   ```go
   func (a *Aggregate) CommandName(domainArgs..., actor string, at time.Time) error
   ```
   The actor string and timestamp always come last, in that order.

---

### Events

An event is an immutable fact that something happened. It is the only thing written to the database.

**Rules:**

1. **Past tense, noun phrase.** Names describe what already occurred: `Opened`, `Renamed`, `Closed`, `DivisionAdded` — never imperative (`Open`, `AddDivision`).

2. **Plain structs with JSON tags.** Events are simple data bags — no methods, no behaviour. All fields must be JSON-serialisable because the event store stores them as `jsonb`.

3. **Carry the minimal delta.** Include only what changed, not the full aggregate state. A `Renamed` event carries `Name string`, not the entire incident. Projectors reconstruct full state by replaying the sequence.

4. **Pointer fields for optional / sparse data.** Use `*string`, `*time.Time`, etc. for fields that may not change in a correction event (e.g. `Corrected` uses pointer fields so `nil` means "not changed").

5. **Value objects, not IDs of other aggregates.** An event may reference an ID from another aggregate (e.g. `Recorded.IncidentID`) but must not embed the other aggregate's state. Cross-aggregate consistency is eventual, enforced by the projector.

6. **Registered in `New()`.** Every event type handled by `Transition` must be passed to `eventsourcing.Register` in the constructor. An unregistered type causes `Apply` to return an error during replay.

7. **`Transition` must be total.** The `default` branch of the switch must return an error (the framework will surface it). There is no valid reason for `Transition` to silently ignore an event type.

8. **`Imported` is the exception.** The `Imported` event is a one-shot snapshot written by a migration. It is deliberately fat (carries all fields) so that the migration does not need to replay the original Hasura history. After version 1, only ordinary domain events appear on the stream.

---

### Naming conventions

| Concept | Convention | Examples |
|---|---|---|
| Aggregate type string | PascalCase, singular | `"Incident"`, `"Message"`, `"Layer"`, `"Feature"` |
| Aggregate struct | PascalCase, same as type string | `Incident`, `Message` |
| Command method | Imperative verb phrase, on the aggregate | `Open`, `Rename`, `Close`, `Reopen`, `Delete`, `Record`, `Correct`, `Triage` |
| Event struct | Past-tense verb or noun phrase, no "Event" suffix | `Opened`, `Renamed`, `Closed`, `DivisionAdded`, `Recorded`, `Corrected` |
| Event file | `events.go` in the aggregate package | `domain/incident/events.go` |
| Aggregate file | `<aggregate>.go` in the aggregate package | `domain/incident/incident.go` |
| Embedded value objects used in events | Suffix `Data` | `LocationData`, `DivisionData` |
| Error sentinels | `Err` prefix, camelCase, in `shared` | `shared.ErrAlreadyClosed`, `shared.ErrIncidentNotOpen` |
| Validation errors | `shared.ValidationError{Field, Message}` | `{Field: "name", Message: "must not be empty"}` |
| Metadata helper | `baseMeta(actor string) map[string]any` | returns `{"actor": "<sub>"}` |

**Do not** name events with a verb in the present tense (`Create`, `Update`) — those read as commands. Events are facts, not instructions.

**Do not** suffix events with `Event` (`OpenedEvent`) — the package context makes the type unambiguous.

---

### Relationship summary

```
Command method
  ├── validate invariants      → return error, stop
  └── eventsourcing.TrackChange(aggregate, EventStruct{…}, at, meta)
        ├── builds Event{Version: current+pending+1, Data: EventStruct}
        ├── calls Transition(event)   → updates in-memory state
        └── appends to pending list

Service
  └── repo.Save(ctx, aggregate)
        └── EventStore.Append(ctx, pending events)   → INSERT, optimistic lock
              └── pg NOTIFY → projector wakes up
```

---

## GraphQL API

The schema lives in `api/schema.graphql` and is the single source of truth. `gqlgen` generates the execution engine and model types; resolver implementations are hand-written in `internal/adapter/inbound/graphql/schema.resolvers.go`.

The `Resolver` struct holds only port interfaces:

```go
type Resolver struct {
    Incidents inbound.IncidentService
    Messages  inbound.MessageService
    Layers    inbound.LayerService
    Features  inbound.FeatureService
    Queries   outbound.Queries
}
```

Regenerate after schema changes:

```bash
go generate ./internal/adapter/inbound/graphql/...
```

---

## Authentication

OIDC via `zitadel/oidc` with PKCE. The flow:

1. `GET /oauth2/sign_in` — redirects to the IdP.
2. `GET /oauth2/callback` — exchanges the auth code, validates the ID token signature against JWKS, writes encrypted cookies (`securecookie`), upserts the user profile.
3. `RequireLogin` middleware — decodes cookies, verifies the ID token, refreshes if expiring within 15 minutes, and stores an `identity.Actor{Sub, Email, Name}` in `context.Context`.
4. Services call `identity.ActorFrom(ctx)` to retrieve the actor; the `Sub` (OIDC subject claim) is the stable author identifier written to every domain event.

Local development uses `LocalEnforcer` which injects a static actor without any OIDC round-trip.

---

## Observability

All three OTEL signals are exported via OTLP gRPC.

| Signal | Instrumented at |
|---|---|
| Traces | HTTP (`otelecho`), GraphQL operations (`otelgqlgen`), every service method (manual spans), SQL queries (`otelpgx`), OIDC outbound HTTP (`otelhttp`) |
| Metrics | Go runtime (`contrib/instrumentation/runtime`), OTLP periodic reader |
| Logs | `slog` fanned out to stdout + OTLP log bridge (`otelslog`); context-aware calls attach trace/span IDs automatically |

The trace hierarchy for a mutation:

```
POST /api/v2/graphql          (otelecho)
  └── mutation createMessage  (otelgqlgen)
        └── MessageService.RecordMessage
              ├── SELECT FROM eventsourcing.events  (otelpgx)
              └── INSERT INTO eventsourcing.events  (otelpgx)
```

---

## Composition Root

`internal/cli/serve.go` is the only place that knows about concrete types. Everything else depends on interfaces. The startup sequence:

1. Initialise OTEL SDK (traces, metrics, logs).
2. Open Postgres pool with `otelpgx` tracer.
3. Construct infrastructure: event store, transactor, notifier.
4. Construct repositories (wrap event store).
5. Construct application services via `service.Factory`.
6. Construct read-model queries.
7. Start projector goroutine.
8. Start OIDC client; attach `UserRepository`.
9. Start Echo HTTP server with all routes and middleware.
10. Block until context cancellation; drain projector, close pool.

---

## Adding a New Feature

1. **Domain event** — add a struct to `domain/xxx/events.go` and register it in `New()`.
2. **Command** — add a method to the aggregate that validates the invariant and calls `TrackChange`.
3. **Service method** — add to the service, thread through the inbound port interface.
4. **Projection** — add a case to the relevant `Handler.Handle` switch to update the read model. Bump the handler `Version()`.
5. **GraphQL** — add the field/mutation to `api/schema.graphql`, run `go generate`, implement the resolver.
6. **Migration** — if the read-model schema changes, add a new goose migration file.
