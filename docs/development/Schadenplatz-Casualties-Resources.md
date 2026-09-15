# Schadenplatz, Casualties & Resources — Design Plan

## Domain Overview

Three new aggregates. One extended aggregate. Clear geographic and organisational hierarchy:

```
Incident
  └── Schadenplatz  (zone/area — GeoJSON geometry)
          ├── Casualties  (running totals, delta-driven via message triage only)
          └── Resource    (own aggregate, always assigned to a Schadenplatz)
                  ├── HomeLocation       (origin base, e.g. "Feuerwehr Altdorf")
                  └── DeploymentLocation (precise point within Schadenplatz)
```

A default Schadenplatz ("Allgemein") is auto-created per incident. Its ID is stored on the Incident aggregate. It is never shown by name in the triage UI — casualties and resources not attributed to a named site go there implicitly.

---

## Architectural Constraints

These apply to every item in this plan without exception.

**1. Command handlers never read from read models.**
Service methods load aggregate state exclusively from the event store. Cross-aggregate validation loads the other aggregate by ID from the event store. Read model tables are for queries only.

**2. Cross-aggregate coordination belongs to the service layer.**
When a single user action must affect multiple aggregates, the service issues all commands in sequence, each loading its aggregate from the event store. Where atomicity is required, the repository implements transactional saves (see 2.3).

**3. Every outbound port has three adapter implementations.**
All event store repositories and read model query interfaces are implemented for: `inmem`, `sqlite`, `postgres`. No new aggregate or query type is introduced without all three.

**4. Invariants are enforced on the aggregate, not in the service.**
Aggregate command methods validate domain rules against current in-memory state before calling `eventsourcing.TrackChange`. `Transition` only updates state and never validates.

**5. All casualty changes must be attributed to a message.**
There are no direct operator corrections to casualty counts. Every `CasualtiesRecorded` event carries a non-nullable `SourceMessageID`. Corrections are made by creating a new message and triaging it. Administrative operations (transfer between Schadenplätz) have their own event types without message attribution.

---

## Part 1 — Aggregates & Events

### 1.1 Incident Aggregate — Extension

The Incident aggregate stores the default Schadenplatz ID so it can be looked up in O(1) without scanning the event stream.

```go
type Incident struct {
    // existing fields +
    defaultSchadenplatzID *shared.SchadenplatzID
}
```

**New event:**

```go
// internal/core/domain/incident/events.go
type DefaultSchadenplatzLinked struct {
    SchadenplatzID shared.SchadenplatzID
}
```

Fired by `IncidentService.Open` after creating the default Schadenplatz.

---

### 1.2 Schadenplatz Aggregate

**File:** `internal/core/domain/schadenplatz/`

```go
type Schadenplatz struct {
    eventsourcing.Root
    incidentID  shared.IncidentID
    name        string
    location    *SchadenplatzLocation
    isDefault   bool
    casualties  CasualtyState
    mergedInto  *shared.SchadenplatzID // write-side only, not exposed via API
}

type SchadenplatzLocation struct {
    Name     string
    Geometry map[string]any  // GeoJSON — Point today, Polygon later, no schema change needed
}

type CasualtyState struct {
    Vermisste, Tote, Verletzte, Obdachlose, Eingeschlossene int
}

type CasualtyDeltas struct {
    Vermisste, Tote, Verletzte, Obdachlose, Eingeschlossene int
}

func (d CasualtyDeltas) Negated() CasualtyDeltas { /* negate all fields */ }
func (d CasualtyDeltas) IsZero() bool             { /* all fields == 0 */ }
func (d CasualtyDeltas) NetFrom(prev *CasualtyDeltas) CasualtyDeltas { /* d - prev */ }
```

**Events:**

```go
type Created            struct{ IncidentID shared.IncidentID; Name string; IsDefault bool }
type Renamed            struct{ Name string }
type LocationSet        struct{ Location SchadenplatzLocation }
type LocationCleared    struct{}
type CasualtiesRecorded struct {
    Deltas          CasualtyDeltas
    SourceMessageID shared.MessageID   // required — all changes must be via a message
    RecordedBy      string
}
type CasualtiesTransferredOut struct {
    ToSchadenplatzID shared.SchadenplatzID
    Deltas           CasualtyDeltas    // positive — the amount leaving
    RecordedBy       string
}
type CasualtiesTransferredIn struct {
    FromSchadenplatzID shared.SchadenplatzID
    Deltas             CasualtyDeltas  // positive — the amount arriving
    RecordedBy         string
}
type MergedInto struct{ TargetID shared.SchadenplatzID }
```

There is no `Removed` event. Removal is implemented as merge into the default Schadenplatz.

**Domain invariant — no category may go negative:**

```go
func (s *Schadenplatz) RecordCasualties(
    deltas CasualtyDeltas, sourceMessageID shared.MessageID, recordedBy string, at time.Time,
) error {
    if s.mergedInto != nil {
        return ErrSchadenplatzMerged{ID: s.ID(), MergedInto: *s.mergedInto}
    }
    if err := s.validateCasualtyDeltas(deltas); err != nil {
        return err
    }
    eventsourcing.TrackChange(s, CasualtiesRecorded{
        Deltas: deltas, SourceMessageID: sourceMessageID, RecordedBy: recordedBy,
    }, at, nil)
    return nil
}

func (s *Schadenplatz) TransferOut(
    to shared.SchadenplatzID, deltas CasualtyDeltas, recordedBy string, at time.Time,
) error {
    if s.mergedInto != nil { return ErrSchadenplatzMerged{...} }
    if err := s.validateCasualtyDeltas(deltas.Negated()); err != nil { return err }
    eventsourcing.TrackChange(s, CasualtiesTransferredOut{...}, at, nil)
    return nil
}

func (s *Schadenplatz) ReceiveTransfer(
    from shared.SchadenplatzID, deltas CasualtyDeltas, recordedBy string, at time.Time,
) error {
    if s.mergedInto != nil { return ErrSchadenplatzMerged{...} }
    eventsourcing.TrackChange(s, CasualtiesTransferredIn{...}, at, nil)
    return nil
}

func (s *Schadenplatz) validateCasualtyDeltas(d CasualtyDeltas) error {
    checks := []struct{ field string; current, delta int }{
        {"Vermisste",       s.casualties.Vermisste,       d.Vermisste},
        {"Tote",            s.casualties.Tote,            d.Tote},
        {"Verletzte",       s.casualties.Verletzte,       d.Verletzte},
        {"Obdachlose",      s.casualties.Obdachlose,      d.Obdachlose},
        {"Eingeschlossene", s.casualties.Eingeschlossene, d.Eingeschlossene},
    }
    for _, c := range checks {
        if c.current+c.delta < 0 {
            return ErrCasualtyNegative{Field: c.field, Current: c.current, Delta: c.delta}
        }
    }
    return nil
}
```

```go
type ErrCasualtyNegative struct{ Field string; Current, Delta int }
type ErrSchadenplatzMerged struct{ ID, MergedInto shared.SchadenplatzID }
```

Both errors surface through GraphQL as domain validation errors, not 500s.

---

### 1.3 Resource Aggregate

**File:** `internal/core/domain/resource/`

Resources are always assigned to a Schadenplatz. If none is specified at alert time, the service assigns the incident's default Schadenplatz. `schadenplatzID` is therefore non-nullable on the aggregate after `Alerted`.

```go
type Resource struct {
    eventsourcing.Root
    incidentID         shared.IncidentID
    schadenplatzID     shared.SchadenplatzID   // always set — defaults to incident default
    formation          Formation               // FW | POL | ARMEE | ZS | TECHNB | SAN | OTHER
    name               string
    size               UnitSize                // TRUPP | GRUPPE | ZUG | KOMPANIE | BATAILLON
    personnelCount     int
    hauptaufgabe       string
    contact            *Contact                // {medium: RADIO|PHONE|OTHER, detail}
    homeLocation       *Location               // origin base — name + optional coords
    deploymentLocation *DeploymentLocation     // precise point within Schadenplatz
    status             ResourceStatus
    statusAt           time.Time
    einsatzBeginn      *time.Time
    einsatzEnde        *time.Time
    predecessorID      *shared.ResourceID
    successorID        *shared.ResourceID
    sourceMessageID    *shared.MessageID
}

type Location struct {
    Name        string
    Coordinates *[2]float64
}

type DeploymentLocation struct {
    Lat   float64  // required — precise point
    Lng   float64
    Label string
}
```

**UnitSize and personnelCount:**

Standard Swiss civil protection unit sizes with expected personnel ranges:

| UnitSize | Typical range |
|---|---|
| TRUPP | 1–2 |
| GRUPPE | 3–12 |
| ZUG | 13-60 |
| KOMPANIE | 61-300 |
| BATAILLON | 300+ |

The domain validates that `personnelCount` falls within the expected range for the given `UnitSize` and returns a `ErrUnitSizeMismatch` warning (non-blocking — operator can confirm and proceed). The UI suggests the appropriate `UnitSize` when `personnelCount` is entered to reduce manual selection errors.

**State machine:**

```
AUFGEBOTEN → EINSATZBEREIT → EINGESETZT → ABGELOEST (terminal)
                   ↑_______________↑
              (standby between deployments)
```

**Events:**

```go
type Alerted struct {
    IncidentID      shared.IncidentID
    SchadenplatzID  shared.SchadenplatzID  // non-nullable — always resolved to default if omitted
    Formation       Formation
    Name            string
    Size            UnitSize
    PersonnelCount  int
    Hauptaufgabe    string
    Contact         *Contact
    HomeLocation    *Location
    SourceMessageID *shared.MessageID
}
type MarkedReady               struct{ At time.Time }
type Deployed                  struct{ At time.Time }
type StoodDown                 struct{ At time.Time }
type Relieved                  struct{ At time.Time; SuccessorID *shared.ResourceID }
type SuccessionLinked          struct{ PredecessorID shared.ResourceID }
type ReassignedToSchadenplatz  struct{ SchadenplatzID shared.SchadenplatzID }
type DeploymentLocationUpdated struct{ Location *DeploymentLocation }
type HauptaufgabeChanged       struct{ Hauptaufgabe string }
type ContactUpdated            struct{ Contact Contact }
type PersonnelCountUpdated     struct{ Count int }
type EinsatzDauerRecorded      struct{ Beginn time.Time; Ende *time.Time }
```

---

### 1.4 Message Aggregate — Extend Triaged Event

The Message aggregate stores the last `SchadenplatzEntries` in its in-memory state so the triage service can compute net deltas on re-triage without reading a read model.

```go
// internal/core/domain/message/events.go
type Triaged struct {
    Triage              shared.TriageStatus
    Priority            shared.PriorityStatus
    DivisionIDs         []shared.DivisionID
    SchadenplatzEntries []SchadenplatzEntry  // empty list is valid — no casualties/resources
}

type SchadenplatzEntry struct {
    SchadenplatzID  shared.SchadenplatzID
    Casualties      *CasualtyDeltas          // nil = no update for this site
    NewResources    []NewResourceEntry
    ResourceUpdates []ResourceStatusUpdate
}

type NewResourceEntry struct {
    Formation      Formation
    Name           string
    Size           UnitSize
    PersonnelCount int
    Hauptaufgabe   string
    Contact        *Contact
    HomeLocation   *Location
}

type ResourceStatusUpdate struct {
    ResourceID shared.ResourceID
    NewStatus  ResourceStatus
}
```

The Message aggregate exposes:

```go
func (m *Message) PreviousCasualtiesFor(id shared.SchadenplatzID) *CasualtyDeltas
func (m *Message) IncidentID() shared.IncidentID
```

Both read from aggregate in-memory state — no read model access.

---

## Part 2 — Service Layer

### 2.1 Outbound Ports (Repositories)

**File:** `internal/core/port/outbound/repositories.go`

```go
type IncidentRepository interface {
    // extend existing:
    Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error)
    Save(ctx context.Context, i *incident.Incident) error
}

type SchadenplatzRepository interface {
    Load(ctx context.Context, id shared.SchadenplatzID) (*schadenplatz.Schadenplatz, error)
    Save(ctx context.Context, s *schadenplatz.Schadenplatz) error
    SaveBoth(ctx context.Context, a, b *schadenplatz.Schadenplatz) error // transactional — used by ReassignCasualties and Merge
}

type ResourceRepository interface {
    Load(ctx context.Context, id shared.ResourceID) (*resource.Resource, error)
    Save(ctx context.Context, r *resource.Resource) error
    SaveBoth(ctx context.Context, a, b *resource.Resource) error // transactional — used by Relieve + succession
}
```

`SaveBoth` writes both aggregates' pending events in a single database transaction. For `sqlite` and `postgres` it wraps both appends in one `WithinTx` closure. For `inmem`, `WithinTx` is a no-op — two sequential `Append` calls are serialised by a mutex but not truly atomic. This is accepted: the inmem adapter is a unit-test adapter only. `SaveBoth` atomicity correctness is validated by SQLite and Postgres conformance tests.

Implementations required in all three adapters:

```
internal/adapter/outbound/eventstore/
  inmem/{schadenplatz,resource}_store.go
  sqlite/{schadenplatz,resource}_store.go
  postgres/{schadenplatz,resource}_store.go
```

---

### 2.2 SchadenplatzService

**File:** `internal/core/service/schadenplatz.go`

```go
func (s *SchadenplatzService) Create(ctx context.Context, incidentID, name string, isDefault bool) (*schadenplatz.Schadenplatz, error)
func (s *SchadenplatzService) Rename(ctx context.Context, id, name string) error
func (s *SchadenplatzService) SetLocation(ctx context.Context, id string, loc SchadenplatzLocation) error
func (s *SchadenplatzService) ClearLocation(ctx context.Context, id string) error
func (s *SchadenplatzService) RecordCasualties(ctx context.Context, id string, deltas CasualtyDeltas, sourceMessageID shared.MessageID, recordedBy string) error
func (s *SchadenplatzService) ReassignCasualties(ctx context.Context, fromID, toID string, deltas CasualtyDeltas, actorSub string) error
func (s *SchadenplatzService) Merge(ctx context.Context, sourceID, targetID string) error
func (s *SchadenplatzService) Remove(ctx context.Context, id string) error
```

**Remove merges into default — ID looked up from Incident aggregate:**

```go
func (s *SchadenplatzService) Remove(ctx context.Context, id string) error {
    sp, err := s.repo.Load(ctx, id)           // event store
    if sp.IsDefault() { return ErrCannotRemoveDefault }
    inc, err := s.incidentRepo.Load(ctx, sp.IncidentID())  // event store
    return s.Merge(ctx, id, inc.DefaultSchadenplatzID().String())
}
```

**ReassignCasualties — atomic via SaveBoth:**

```go
func (s *SchadenplatzService) ReassignCasualties(ctx context.Context, fromID, toID string, deltas CasualtyDeltas, actorSub string) error {
    from, err := s.repo.Load(ctx, fromID)  // event store
    to,   err := s.repo.Load(ctx, toID)    // event store
    if from.IncidentID() != to.IncidentID() { return ErrSchadenplatzIncidentMismatch }
    if err := from.TransferOut(to.ID(), deltas, actorSub, now); err != nil { return err }
    if err := to.ReceiveTransfer(from.ID(), deltas, actorSub, now); err != nil { return err }
    return s.repo.SaveBoth(ctx, from, to)  // single transaction
}
```

**Merge — also uses SaveBoth:**

```go
func (s *SchadenplatzService) Merge(ctx context.Context, sourceID, targetID string) error {
    source, err := s.repo.Load(ctx, sourceID)
    target, err := s.repo.Load(ctx, targetID)
    if source.IncidentID() != target.IncidentID() { return ErrSchadenplatzIncidentMismatch }
    if source.MergedInto() != nil                 { return ErrSchadenplatzMerged{...} }
    if target.MergedInto() != nil                 { return ErrSchadenplatzMerged{...} }
    eventsourcing.TrackChange(source, MergedInto{TargetID: target.ID()}, ...)
    return s.repo.Save(ctx, source)
    // projector cascades: adds source casualties into target read model; updates resource rows
}
```

---

### 2.3 ResourceService

**File:** `internal/core/service/resource.go`

```go
func (s *ResourceService) Alert(ctx context.Context, cmd AlertResourceCommand) (*resource.Resource, error)
func (s *ResourceService) MarkReady(ctx context.Context, id string) error
func (s *ResourceService) Deploy(ctx context.Context, id string) error
func (s *ResourceService) StandDown(ctx context.Context, id string) error
func (s *ResourceService) Relieve(ctx context.Context, id string, successorID *string) error
func (s *ResourceService) Reassign(ctx context.Context, id, schadenplatzID string) error
func (s *ResourceService) UpdateDeploymentLocation(ctx context.Context, id string, loc *DeploymentLocation) error
func (s *ResourceService) SetEinsatzDauer(ctx context.Context, id string, beginn time.Time, ende *time.Time) error
func (s *ResourceService) UpdateContact(ctx context.Context, id string, contact Contact) error
func (s *ResourceService) UpdateHauptaufgabe(ctx context.Context, id, hauptaufgabe string) error
func (s *ResourceService) UpdatePersonnelCount(ctx context.Context, id string, count int) error
```

**Alert resolves default Schadenplatz from Incident aggregate if none provided:**

```go
func (s *ResourceService) Alert(ctx context.Context, cmd AlertResourceCommand) (*resource.Resource, error) {
    schadenplatzID := cmd.SchadenplatzID
    if schadenplatzID == nil {
        inc, err := s.incidentRepo.Load(ctx, cmd.IncidentID)  // event store
        id := inc.DefaultSchadenplatzID()
        schadenplatzID = &id
    }
    sp, err := s.schadenplatzRepo.Load(ctx, *schadenplatzID)  // event store
    if sp.MergedInto() != nil                  { return nil, ErrSchadenplatzMerged{...} }
    if sp.IncidentID() != cmd.IncidentID       { return nil, ErrSchadenplatzIncidentMismatch }
    r := resource.New()
    eventsourcing.TrackChange(r, Alerted{SchadenplatzID: *schadenplatzID, ...}, ...)
    return r, s.repo.Save(ctx, r)
}
```

**Deploy auto-sets EinsatzBeginn only if not already set:**

```go
func (s *ResourceService) Deploy(ctx context.Context, id string) error {
    r, err := s.repo.Load(ctx, id)
    eventsourcing.TrackChange(r, Deployed{At: now}, ...)
    if r.EinsatzBeginn() == nil {
        eventsourcing.TrackChange(r, EinsatzDauerRecorded{Beginn: now, Ende: nil}, ...)
    }
    return s.repo.Save(ctx, r)
}
```

**Relieve with succession — atomic via SaveBoth:**

```go
func (s *ResourceService) Relieve(ctx context.Context, id string, successorID *string) error {
    r, err := s.repo.Load(ctx, id)
    eventsourcing.TrackChange(r, Relieved{At: now, SuccessorID: successorID}, ...)
    if r.EinsatzBeginn() != nil && r.EinsatzEnde() == nil {
        eventsourcing.TrackChange(r, EinsatzDauerRecorded{Beginn: *r.EinsatzBeginn(), Ende: &now}, ...)
    }
    if successorID == nil {
        return s.repo.Save(ctx, r)
    }
    successor, err := s.repo.Load(ctx, *successorID)  // event store
    eventsourcing.TrackChange(successor, SuccessionLinked{PredecessorID: r.ID()}, ...)
    return s.repo.SaveBoth(ctx, r, successor)  // single transaction
}
```

---

### 2.4 MessageService — Triage Command Flow

The UI sends commands per step during triage:

- **Step 3** (Schadenplätz): `createSchadenplatz` mutations fire immediately as the operator creates new sites. Existing site selection is local UI state only.
- **Steps 4 & 5** (Personen, Mittel): local UI state only — nothing is persisted yet.
- **"Triage abschliessen"**: single `triageMessage` mutation carries the complete `SchadenplatzEntries`. This is the transactional boundary for the Message aggregate and the trigger for all fan-out.

**Pre-validation before any event is written:**

```go
func (s *MessageService) TriageMessage(ctx context.Context, cmd TriageMessageCommand) error {
    msg, err := s.messageRepo.Load(ctx, cmd.MessageID)

    // Pre-validate all Schadenplätz and casualty invariants before writing any event
    for _, entry := range cmd.SchadenplatzEntries {
        sp, err := s.schadenplatzRepo.Load(ctx, entry.SchadenplatzID)  // event store
        if sp.IncidentID() != msg.IncidentID() { return ErrSchadenplatzIncidentMismatch }
        if sp.MergedInto() != nil              { return ErrSchadenplatzMerged{...} }
        if entry.Casualties != nil {
            prevDeltas := msg.PreviousCasualtiesFor(entry.SchadenplatzID)  // from aggregate state
            netDelta := entry.Casualties.NetFrom(prevDeltas)
            if err := sp.ValidateCasualtyDeltas(netDelta); err != nil { return err }
        }
    }

    // All checks passed — write Message event
    eventsourcing.TrackChange(msg, Triaged{...}, ...)
    if err := s.messageRepo.Save(ctx, msg); err != nil { return err }

    // Fan-out — sequential, best-effort after Message is committed
    for _, entry := range cmd.SchadenplatzEntries {
        if entry.Casualties != nil {
            prevDeltas := msg.PreviousCasualtiesFor(entry.SchadenplatzID)
            netDelta := entry.Casualties.NetFrom(prevDeltas)
            if !netDelta.IsZero() {
                if err := s.schadenplatzService.RecordCasualties(
                    ctx, entry.SchadenplatzID, netDelta, cmd.MessageID, actorSub,
                ); err != nil { return err }
            }
        }
        for _, nr := range entry.NewResources {
            if _, err := s.resourceService.Alert(ctx, AlertResourceCommand{
                IncidentID:      msg.IncidentID(),
                SchadenplatzID:  &entry.SchadenplatzID,
                SourceMessageID: &cmd.MessageID,
                ...nr,
            }); err != nil { return err }
        }
        for _, ru := range entry.ResourceUpdates {
            if err := s.dispatchResourceStatusUpdate(ctx, ru); err != nil { return err }
        }
    }
    return nil
}
```

An empty `SchadenplatzEntries` list is valid — the service skips the fan-out entirely. This is the common case where a message is triaged for status and priority only.

---

### 2.5 IncidentService — Auto-create Default Schadenplatz

```go
func (s *IncidentService) Open(ctx context.Context, cmd OpenIncidentCommand) (*incident.Incident, error) {
    inc := incident.New()
    eventsourcing.TrackChange(inc, incident.Opened{...}, ...)
    if err := s.incidentRepo.Save(ctx, inc); err != nil { return nil, err }

    def, err := s.schadenplatzService.Create(ctx, inc.ID(), "__allgemein__", true)
    if err != nil { return nil, err }

    eventsourcing.TrackChange(inc, incident.DefaultSchadenplatzLinked{SchadenplatzID: def.ID()}, ...)
    return inc, s.incidentRepo.Save(ctx, inc)
}
```

---

## Part 3 — Query Layer

### 3.1 Outbound Query Ports

**File:** `internal/core/port/outbound/readmodels.go`

```go
type SchadenplatzQueries interface {
    GetByID(ctx context.Context, id shared.SchadenplatzID) (*SchadenplatzReadModel, error)
    ListByIncident(ctx context.Context, incidentID shared.IncidentID) ([]*SchadenplatzReadModel, error)
    GetCasualties(ctx context.Context, id shared.SchadenplatzID) (*CasualtyState, error)
    GetIncidentCasualties(ctx context.Context, incidentID shared.IncidentID) (*CasualtyState, error)
    GetContributingMessages(ctx context.Context, id shared.SchadenplatzID) ([]*MessageCasualtyContribution, error)
}

type ResourceQueries interface {
    GetByID(ctx context.Context, id shared.ResourceID) (*ResourceReadModel, error)
    ListByIncident(ctx context.Context, incidentID shared.IncidentID) ([]*ResourceReadModel, error)
    ListBySchadenplatz(ctx context.Context, id shared.SchadenplatzID) ([]*ResourceReadModel, error)
    ListBySourceMessage(ctx context.Context, messageID shared.MessageID) ([]*ResourceReadModel, error)
}

type MessageQueries interface {
    // extend existing:
    GetSchadenplatzEntries(ctx context.Context, messageID shared.MessageID) ([]*MessageSchadenplatzEntry, error)
}
```

Implementations required in all three adapters:

```
internal/adapter/outbound/queries/
  inmem/{schadenplatz,resource}_queries.go
  sqlite/{schadenplatz,resource}_queries.go
  postgres/{schadenplatz,resource}_queries.go
```

---

### 3.2 Read Model Tables

```sql
CREATE TABLE readmodel_schadenplatz (
    id            TEXT PRIMARY KEY,
    incident_id   TEXT NOT NULL,
    name          TEXT NOT NULL,
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    location_name TEXT,
    geometry      JSONB,
    updated_at    TIMESTAMP
);

CREATE TABLE readmodel_schadenplatz_casualties (
    schadenplatz_id  TEXT PRIMARY KEY,
    incident_id      TEXT NOT NULL,
    vermisste        INTEGER NOT NULL DEFAULT 0,
    tote             INTEGER NOT NULL DEFAULT 0,
    verletzte        INTEGER NOT NULL DEFAULT 0,
    obdachlose       INTEGER NOT NULL DEFAULT 0,
    eingeschlossene  INTEGER NOT NULL DEFAULT 0
);

-- Per-message deltas for audit and re-triage idempotency
CREATE TABLE readmodel_message_casualties (
    message_id       TEXT NOT NULL,
    schadenplatz_id  TEXT NOT NULL,
    incident_id      TEXT NOT NULL,
    vermisste        INTEGER NOT NULL DEFAULT 0,
    tote             INTEGER NOT NULL DEFAULT 0,
    verletzte        INTEGER NOT NULL DEFAULT 0,
    obdachlose       INTEGER NOT NULL DEFAULT 0,
    eingeschlossene  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (message_id, schadenplatz_id)
);

CREATE TABLE readmodel_message_schadenplatz_entries (
    message_id       TEXT NOT NULL,
    schadenplatz_id  TEXT NOT NULL,
    casualties_json  TEXT,
    PRIMARY KEY (message_id, schadenplatz_id)
);

CREATE TABLE readmodel_resource (
    id                   TEXT PRIMARY KEY,
    incident_id          TEXT NOT NULL,
    schadenplatz_id      TEXT NOT NULL,  -- non-nullable; always set to default if not specified
    formation            TEXT NOT NULL,
    name                 TEXT NOT NULL,
    size                 TEXT NOT NULL,
    personnel_count      INTEGER NOT NULL,
    hauptaufgabe         TEXT NOT NULL,
    status               TEXT NOT NULL,
    status_at            TIMESTAMP NOT NULL,
    contact_medium       TEXT,
    contact_detail       TEXT,
    home_location_name   TEXT,
    home_location_lat    REAL,
    home_location_lng    REAL,
    deployment_lat       REAL,
    deployment_lng       REAL,
    deployment_label     TEXT,
    einsatz_beginn       TIMESTAMP,
    einsatz_ende         TIMESTAMP,
    einsatz_dauer_min    INTEGER,
    predecessor_id       TEXT,
    successor_id         TEXT,
    source_message_id    TEXT
);
```

Incident-level casualty total computed at query time:

```sql
SELECT SUM(vermisste), SUM(tote), SUM(verletzte), SUM(obdachlose), SUM(eingeschlossene)
FROM readmodel_schadenplatz_casualties WHERE incident_id = ?
```

---

### 3.3 Projectors

All projectors require implementations for all three adapters.

**SchadenplatzProjector:**
- `Created` → insert into `readmodel_schadenplatz`; insert zero row into `readmodel_schadenplatz_casualties`
- `Renamed` → update name
- `LocationSet/Cleared` → update geometry
- `CasualtiesRecorded` → upsert `readmodel_message_casualties` row; subtract old row values from `readmodel_schadenplatz_casualties`, add new values (handles re-triage correctly)
- `CasualtiesTransferredOut` → subtract from source row
- `CasualtiesTransferredIn` → add to target row
- `MergedInto` → add source casualty row into target; `UPDATE readmodel_resource SET schadenplatz_id = targetID WHERE schadenplatz_id = sourceID`; delete source from `readmodel_schadenplatz` and `readmodel_schadenplatz_casualties`

**ResourceProjector:**
- `Alerted` → insert into `readmodel_resource`
- `MarkedReady / Deployed / StoodDown / Relieved` → update status + status_at
- `Deployed` → set `einsatz_beginn` if null
- `Relieved` → set `einsatz_ende` if null; compute `einsatz_dauer_min`
- `EinsatzDauerRecorded` → set beginn/ende/dauer_min
- `SuccessionLinked` → set `predecessor_id`; set `successor_id` on predecessor row
- `ReassignedToSchadenplatz` → update `schadenplatz_id`
- `DeploymentLocationUpdated / ContactUpdated / HauptaufgabeChanged / PersonnelCountUpdated` → update respective fields

**MessageProjector (extend existing):**
- `Triaged` → upsert `readmodel_message_schadenplatz_entries`

---

## Part 4 — GraphQL Schema

```graphql
scalar GeoJSON

type Schadenplatz {
  id: ID!
  incidentId: ID!
  name: String!
  isDefault: Boolean!
  location: SchadenplatzLocation
  casualties: CasualtyState!
  resources: [Resource!]!
  contributingMessages: [Message!]!
}

type SchadenplatzLocation {
  name: String!
  geometry: GeoJSON
}

type CasualtyState {
  vermisste: Int!
  tote: Int!
  verletzte: Int!
  obdachlose: Int!
  eingeschlossene: Int!
}

type CasualtyDeltas {
  vermisste: Int!
  tote: Int!
  verletzte: Int!
  obdachlose: Int!
  eingeschlossene: Int!
}

type Resource {
  id: ID!
  incidentId: ID!
  schadenplatz: Schadenplatz!   # non-nullable — always assigned
  formation: ResourceFormation!
  name: String!
  size: UnitSize!
  personnelCount: Int!
  hauptaufgabe: String!
  status: ResourceStatus!
  statusAt: DateTime!
  contact: Contact
  homeLocation: Location
  deploymentLocation: DeploymentLocation
  einsatzBeginn: DateTime
  einsatzEnde: DateTime
  einsatzDauerMinutes: Int
  predecessor: Resource
  successor: Resource
  sourceMessage: Message
}

type Location {
  name: String!
  lat: Float
  lng: Float
}

type DeploymentLocation {
  lat: Float!
  lng: Float!
  label: String!
}

type Contact {
  medium: ContactMedium!
  detail: String!
}

type Incident {
  # existing fields +
  schadenplaetze: [Schadenplatz!]!
  casualties: CasualtyState!
  resources: [Resource!]!
}

type Message {
  # existing fields +
  schadenplatzEntries: [MessageSchadenplatzEntry!]!
}

type MessageSchadenplatzEntry {
  schadenplatz: Schadenplatz!
  casualties: CasualtyDeltas
  alertedResources: [Resource!]!
}

type ReassignCasualtiesResult {
  from: Schadenplatz!
  to: Schadenplatz!
}

enum ResourceFormation { FW POL ARMEE ZS TECHNB SAN OTHER }
enum UnitSize          { TRUPP GRUPPE ZUG KOMPANIE BATAILLON }
enum ResourceStatus    { AUFGEBOTEN EINSATZBEREIT EINGESETZT ABGELOEST }
enum ContactMedium     { RADIO PHONE OTHER }

# Mutations
createSchadenplatz(incidentId: ID!, name: String!): Schadenplatz!
renameSchadenplatz(id: ID!, name: String!): Schadenplatz!
setSchadenplatzLocation(id: ID!, location: SchadenplatzLocationInput!): Schadenplatz!
clearSchadenplatzLocation(id: ID!): Schadenplatz!
mergeSchadenplatz(sourceId: ID!, targetId: ID!): Schadenplatz!
removeSchadenplatz(id: ID!): Schadenplatz!   # merges into default; returns default
reassignCasualties(fromSchadenplatzId: ID!, toSchadenplatzId: ID!, deltas: CasualtyDeltasInput!): ReassignCasualtiesResult!

alertResource(incidentId: ID!, input: AlertResourceInput!): Resource!
markResourceReady(id: ID!): Resource!
deployResource(id: ID!): Resource!
standDownResource(id: ID!): Resource!
relieveResource(id: ID!, successorId: ID): Resource!
reassignResource(id: ID!, schadenplatzId: ID!): Resource!
updateDeploymentLocation(id: ID!, location: DeploymentLocationInput): Resource!
setEinsatzDauer(id: ID!, input: EinsatzDauerInput!): Resource!
updateResourceContact(id: ID!, contact: ContactInput!): Resource!
updateHauptaufgabe(id: ID!, hauptaufgabe: String!): Resource!
updatePersonnelCount(id: ID!, count: Int!): Resource!

triageMessage(id: ID!, input: TriageMessageInput!): Message!

input TriageMessageInput {
  triage: TriageStatus!
  priority: PriorityStatus!
  divisionIds: [ID!]!
  schadenplatzEntries: [SchadenplatzEntryInput!]!  # empty list valid — no casualties/resources
}

input SchadenplatzEntryInput {
  schadenplatzId: ID!
  casualties: CasualtyDeltasInput
  newResources: [AlertResourceInput!]
  resourceUpdates: [ResourceStatusUpdateInput!]
}

input AlertResourceInput {
  schadenplatzId: ID              # optional — defaults to incident default Schadenplatz
  formation: ResourceFormation!
  name: String!
  size: UnitSize!
  personnelCount: Int!
  hauptaufgabe: String!
  contact: ContactInput
  homeLocation: LocationInput
}

input ResourceStatusUpdateInput {
  resourceId: ID!
  newStatus: ResourceStatus!
}

input SchadenplatzLocationInput {
  name: String!
  geometry: GeoJSON
}

input CasualtyDeltasInput {
  vermisste: Int
  tote: Int
  verletzte: Int
  obdachlose: Int
  eingeschlossene: Int
}

input EinsatzDauerInput {
  beginn: DateTime!
  ende: DateTime
}
```

---

## Part 5 — UI

### 5.1 Triage Command Flow

| Step | UI action | Backend call |
|---|---|---|
| 3 — Schadenplätz | Operator creates a new site inline | `createSchadenplatz` fires immediately |
| 3 — Schadenplätz | Operator selects existing sites | Local UI state only |
| 4 — Personen | Operator enters casualty deltas | Local UI state only |
| 5 — Mittel | Operator alerts/updates resources | Local UI state only |
| "Triage abschliessen" | Operator confirms | Single `triageMessage` mutation with full `SchadenplatzEntries` |

Errors from `createSchadenplatz` are reported inline in Step 3. Errors from `triageMessage` (e.g. `ErrCasualtyNegative`, `ErrSchadenplatzMerged`) are reported on the confirmation action before closing the triage.

### 5.2 Step 3 — Schadenplätz

Named Schadenplätz only. The default is never shown. If nothing is selected, data goes to the default implicitly and is labelled "Allgemein" in subsequent steps and in the attribution display.

```
┌─ Schadenplätze ──────────────────────────────────────────┐
│  Betrifft diese Meldung einen spezifischen Schadenplatz? │
│                                                          │
│  ☑  Schadenplatz Nord                                   │
│  ☐  Schadenplatz Süd                                    │
│                                                          │
│  + Neuen Schadenplatz erfassen                           │
│                                                          │
│  Ohne Auswahl: Allgemein (keine spezifische Zuordnung)   │
└──────────────────────────────────────────────────────────┘
```

Step auto-collapses when only the default exists. Becomes prominent once named sites exist.

### 5.3 Step 4 — Personen

One `CasualtySection` per selected Schadenplatz, labelled. When no site was selected in Step 3, one section is shown labelled "Allgemein (keine spezifische Zuordnung)" — making the implicit routing to the default explicit.

### 5.4 Step 5 — Mittel

One resource section per selected Schadenplatz. Each section:
- **Alert new resource** — inline form; `UnitSize` suggested from `personnelCount` as operator types
- **Update existing resources** — compact list with inline status controls

When no site was selected in Step 3, one section labelled "Allgemein" as above.

### 5.5 Attribution Display

On message detail:
```
Triage-Auswirkungen
  Schadenplatz Nord   Tote +2 · Verletzte +3
  Allgemein           Vermisste −2
  Alarmiert           Gruppe 1 (FW) → Schadenplatz Nord
```

On Schadenplatz detail — casualty history:
```
Meldung #47    Tote +2  Verletzte +3
Meldung #51    Vermisste −1
──────────────────────────────────
Total          Tote 2  Verletzte 3  Vermisste −1
```

On Resource detail:
```
Alarmiert durch:  Meldung #47 — "Brand ausgeweitet..."
```

### 5.6 New Incident Views

**Lageübersicht tab** — Schadenplätz cards with casualty totals and resource counts; incident-level summary row.

**Mittel-Board** (later) — all resources, filterable by Schadenplatz/formation/status, inline status transitions, succession chains.

**Map** (later) — Schadenplätz as GeoJSON layers (Point → Polygon); resource pins at `deploymentLocation`; resources without a deployment location fall back to their Schadenplatz center.

---

## Part 6 — Message Attribution

| Question | Answered by |
|---|---|
| Which messages contributed to Schadenplatz X casualties? | `readmodel_message_casualties WHERE schadenplatz_id = X` |
| What did message #47 contribute overall? | `readmodel_message_schadenplatz_entries WHERE message_id = 47` |
| Which message triggered Resource Y? | `readmodel_resource.source_message_id` |
| What resources were alerted from message #47? | `readmodel_resource WHERE source_message_id = 47` |
| Succession chain for a resource? | Follow `predecessor_id` / `successor_id` in read model |

---

## Part 7 — Delivery Order

| Phase | Scope | Adapter work | Depends on |
|---|---|---|---|
| 1 | Schadenplatz aggregate + events | — | — |
| 2 | SchadenplatzRepository port + SaveBoth (inmem/sqlite/postgres) | 3 adapters | 1 |
| 3 | SchadenplatzService (all commands) | — | 2 |
| 4 | Incident aggregate: DefaultSchadenplatzLinked event + field | — | — |
| 5 | IncidentService: auto-create default Schadenplatz on Open | — | 3, 4 |
| 6 | Schadenplatz read model tables + projector (inmem/sqlite/postgres) | 3 adapters | 2 |
| 7 | SchadenplatzQueries port + inmem/sqlite/postgres | 3 adapters | 6 |
| 8 | Schadenplatz GraphQL types + mutations + Incident.schadenplaetze/casualties | — | 7 |
| 9 | Resource aggregate + events | — | — |
| 10 | ResourceRepository port + SaveBoth (inmem/sqlite/postgres) | 3 adapters | 9 |
| 11 | ResourceService (all commands) | — | 2, 10 |
| 12 | Resource read model table + projector (inmem/sqlite/postgres) | 3 adapters | 10 |
| 13 | ResourceQueries port + inmem/sqlite/postgres | 3 adapters | 12 |
| 14 | Resource GraphQL types + mutations | — | 13 |
| 15 | Extend Triaged event on Message aggregate | — | 1, 9 |
| 16 | Extend TriageMessage service + pre-validation + fan-out | — | 3, 11, 15 |
| 17 | Casualty projector extensions (inmem/sqlite/postgres) | 3 adapters | 16 |
| 18 | Message attribution queries + GraphQL extensions | — | 17 |
| 19 | UI: Schadenplätz triage step | — | 8 |
| 20 | UI: Per-site Personen step | — | 19 |
| 21 | UI: Per-site Mittel step | — | 19 |
| 22 | UI: Message attribution display | — | 18 |
| 23 | UI: Lageübersicht tab | — | 8, 14 |
| 24 | setSchadenplatzLocation (GeoJSON) + map rendering | 3 adapters | 8 |
| 25 | mergeSchadenplatz + projector cascade (inmem/sqlite/postgres) | 3 adapters | 7 |
| 26 | reassignCasualties (inmem/sqlite/postgres) | 3 adapters | 7 |
| 27 | updateDeploymentLocation + resource map pins | — | 14, 24 |
| 28 | UI: Mittel-Board view | — | 14 |
| 29 | Resource Material / equipment | — | 9 |

---

## Part 8 — Resolved Design Decisions

| # | Decision |
|---|---|
| 8.1 | Fan-out is backend-side. UI fires `createSchadenplatz` per-step; all triage data is bundled in the final `triageMessage` call. Pre-validation before the Message event is written prevents the most common inconsistency. Remaining fan-out partial failure is accepted with clear error reporting. |
| 8.2 | `ReassignCasualties` and `Merge` use `SaveBoth` — a single database transaction across both aggregates. Atomicity guaranteed. |
| 8.3 | Default Schadenplatz ID stored on the Incident aggregate via `DefaultSchadenplatzLinked` event. `LoadDefault` becomes a direct event store load by known ID — O(1). |
| 8.4 | Re-triaging a message against a merged Schadenplatz returns `ErrSchadenplatzMerged`. The operator must update their triage to reference the surviving Schadenplatz. No automatic redirection. |
| 8.5 | Operations requiring a live Schadenplatz (commands) return `ErrSchadenplatzMerged` if the aggregate is merged. Audit/history keeps the original ID. The read model projector cascades resource `schadenplatz_id` to the target on `MergedInto`. |
| 8.6 | UnitSize: TRUPP, GRUPPE, ZUG, KOMPANIE, BATAILLON. Domain validates `personnelCount` is within the expected range for the given size and returns `ErrUnitSizeMismatch` as a non-blocking warning. UI suggests the appropriate size as the operator types `personnelCount`. |
| 8.7 | Resources are always assigned to a Schadenplatz. If none is specified, the service resolves the incident's default Schadenplatz from the Incident aggregate. `schadenplatzID` on the Resource aggregate is non-nullable. |
| 8.8 | All casualty changes must go through a message triage. `CasualtiesRecorded.SourceMessageID` is non-nullable. There are no direct operator corrections — corrections are made by creating a new message and triaging it. Administrative transfers between Schadenplätz use `CasualtiesTransferredOut/In` which do not require a message. |
| 8.9 | Concurrency conflicts on `Save` (optimistic concurrency) are retried by the service layer. Pre-validation is re-evaluated on each retry using freshly loaded aggregate state. |
| 8.10 | GraphQL subscriptions for `schadenplatzUpdated` and `resourceUpdated` are a follow-on phase. Noted as a live-operation requirement. |
| 8.11 | `SchadenplatzEntries` may be an empty list. Service skips fan-out. This is the common case for messages triaged for status/priority only. |
| 8.12 | When no Schadenplatz is selected in Step 3, Steps 4 and 5 display the label "Allgemein (keine spezifische Zuordnung)" rather than appearing unlabelled. |
