# DRAFT: Automatic Telemetry Events

This document describes how automatic telemetry events — positions and sensor readings — enter SitRep, how they reach the map and the Einsatzjournal, and what they add to the existing domain model.

---

## Overview

The Einsatzjournal today holds hand-written messages from radio, phone and email. Automatic telemetry events extend it with machine input, in two kinds:

- **Position report** — a vehicle with a GPS tracker, a team's handheld, a drone.
- **Sensor report** — radiation levels, weather, water levels during a flooding incident.

A report is what a source sends; what it carries is a position or a reading.

Both are immutable statements about the world, attributed to a source — the same as a hand-written message, which is why they belong in the same append-only log. What differs is visibility: the log holds everything, the Einsatzjournal shows a curated subset. Raw source events never appear there, only **derived events** do.

Twenty vehicles over an eight-hour Einsatz produce tens of thousands of events, against a journal of a few hundred entries. That is fine on the write side — a report has no rule to enforce, so it is appended without loading or replaying anything. Where the rate matters is the read model.

---

## Concepts

### `Source` (Quelle)

The hardware that originates the data: a GPS tracker, a dose-rate probe, a fixed weather station. A gateway is **not** a source — it is a network element like the daemon itself, so two probes behind one LoRaWAN gateway are two sources and the gateway appears only in event metadata.

A source may sit inside an Einsatzmittel — a vehicle, a Peli case — or belong to nobody in particular, such as another organisation's weather station.

| Field | Meaning |
|---|---|
| identity | the device (IMEI, callsign-SSID, DevEUI) |
| label | descriptive, so discovery shows something recognisable — "Tracker Peli 4" |
| kind | tracker, probe, gauge, weather station |
| credentials | what the daemon presents for it |
| declared streams | see below |

**Operational identity lives on the `Feature`, not here.** "Fahrzeug 21" and its taktisches Zeichen are set when a stream is attached — the only point at which anyone knows what the hardware is mounted in — so moving a tracker between vehicles is a detach and a re-attach. A future Mitteltabelle would slot in at that step, supplying label and symbol from the Mittel instead of an operator typing them; specified separately.

Sources are global and can be provisioned ahead of time: a box of trackers registered and ready to appear in discovery. Registering one is a rare write with rules to enforce, so `Source` is an **Aggregate** — unlike the reports it emits.

### Streams

A `Source` emits one or more **streams**, and the stream is the unit of attachment. A vehicle tracker emits a position-report stream and perhaps a battery stream; a carried dose-rate probe emits a sensor-report stream and a position-report stream.

| Stream kind | Carries | Attaches to a `Feature` by |
|---|---|---|
| **Position-report stream** | a position per event: accuracy, fix type, course, speed, altitude | **substitution** — it becomes the feature's geometry |
| **Sensor-report stream** | one quantity: value and unit per event; label, description, value type and bounds declared | **annotation** — optional, "display this value here" |

Streams are global and outlive incidents. Like sources they are auto-provisioned on first sight — requiring pre-registration would drop data and defeat discovery — and an operator relabels afterwards.

Readings carry no scaling coefficients and no unit conversion; the daemon normalises to engineering units. Alarm levels live on `Rule`, and a stream's bounds are plausibility only, for rejecting garbage.

### Attachment

`Feature` is the attach point. A position-report stream answers the question a feature already asks — *where is this* — so it substitutes for the geometry; a sensor report is annotated on instead.

**A sensor-report stream never requires a feature.** Unattached it still charts and still fires rules, because rules and charts read the stream, never the feature. It is presented below the Lagekarte, which is also where a stream goes when its position is unavailable or not useful.

Attaching a discovered stream creates the feature on a designated layer, and the operator supplies the label and taktisches Zeichen from the BABS catalogue (`BabsIconId`, `ui/src/components/babs/`) at that moment. That is one act per Einsatz for a source's streams. It is incident-scoped because a feature belongs to a layer and a layer to an incident.

**A source's streams are attached in at most one incident at a time.** A Löschfahrzeug in two Einsätze means two command structures claiming one vehicle. The rule is per source rather than per stream, because the source is the thing being claimed. Child-incident layers bubbling up into the parent are not a second attachment.

> This rule spans `Feature` streams in different incidents, so the per-stream version check cannot catch it. It needs an advisory-lock guard keyed on the source, like `IncidentHierarchyGuard` and `AccessGuard`.

| Moment | Geometry |
|---|---|
| On attach | a **Point** at the stream's latest position |
| While attached | every position event updates it in `readmodel.layer_features`, as a manual move does |
| On detach | updates stop; the last position stays |

Detach needs no event of its own: the geometry is already in the read model, and a replay reproduces it from the position events inside the attachment window.

### `Rule`

What turns a stream into a derived event: a threshold crossing, a geofence entry, a scheduled digest, or **silence** — a source that has stopped reporting, which is also how a position goes stale and the map stops presenting it as current. Rules are incident-scoped and read streams directly, never through a feature. The model is deferred — see *Follow-up*.

---

## Event Model

Position reports and sensor reports are separate streams — in the codebase's sense, event sequences keyed by `(StreamType, StreamID)` — because separately attachable things need separate identities. Neither has an Aggregate.

| | Position-report stream | Sensor-report stream |
|---|---|---|
| `StreamType` | `"PositionReport"` | `"SensorReport"` |
| `EventType` | `PositionReported` | `SensorReported` |
| `Data` | `{lat, lon, accuracy, fixType, course?, speed?, altitude?}` | `{value, unit}` |
| `Version` | store-assigned, no domain meaning | store-assigned, no domain meaning |
| `Metadata` | source, protocol, gateway, raw payload | source, protocol, gateway, raw payload |

**Value types** are numeric, boolean or enum. The third is not a convenience: a vehicle's FMS-Status is 3, but 3 means *on the way to the scene*, not a quantity — averaging it is meaningless and it charts as state-over-time. An enum stream declares its permitted values and labels; `unit` is empty for it.

**The unit belongs on the event.** `3.87` is not a fact; `3.87 m` is. That keeps the event self-describing and correct when a sensor is reconfigured, and makes the stream declaration a convenience rather than the source of truth. If an incoming unit differs from the declaration's, the event still wins and the declaration follows — but the change is surfaced, because a series that changes unit mid-stream cannot be charted as one line.

**`Version` means nothing here.** It exists only because the events primary key requires it, and nothing reads it for a source stream: `ORDER BY version` appears only in `Load`, which replays aggregates, while the projector reads globally by `(xid, seq)`. It is assigned by the store. `OccurredAt` cannot be the key instead — not unique at sub-millisecond rates, not monotonic since out-of-order arrival is normal, and not trusted, being the device's clock. Idempotency is a separate mechanism: the daemon supplies a key per event, deduplicated on its own unique index.

**Correlation** is a read-side concern. Every stream records its `Source`, so the UI can offer to attach all of a source's streams at once, and events from one packet share an `OccurredAt`.

**Time** needs no new field. `eventsourcing.Event` already carries `OccurredAt`, the device's clock when the fix or measurement was taken, and `RecordedAt`, when the store wrote it. Ordering is by `OccurredAt`, with out-of-order arrival normal — an offline tracker dumping its buffer on reconnect is routine — and backfill is identifiable as an old `OccurredAt` with a current `RecordedAt`. `Message.time` vs. `Message.createdAt` is the existing precedent.

---

## Live Positions and the Map

A position event updates the feature's geometry in `readmodel.layer_features` by exactly the path a manual move takes — `jsonb_set` on that feature, `revision` bumped — so there is one geometry per feature and one writer of it, whether an operator dragged the icon or a tracker reported a fix. `LayerFeaturesHandler` gains the position-report streams alongside `Layer` and `Feature`; it already consumes the attachment events, so it knows which feature a stream belongs to.

**This is where the rate matters.** At APRS cadence twenty vehicles produce roughly one layer update every three to five seconds — about one per UI poll — and the existing projection shape holds. At ten-second beacons the whole FeatureCollection would be refetched on every poll, and the answer then is per-feature rows so a client fetches only what changed. A future problem, not a reason to build a second projection now.

Positions still need a stream of their own, because they must exist before any `Feature` does: discovery shows sources belonging to no incident, attachment reaches backwards to positions reported before it, and a source's stream outlives the incident its feature belongs to. Writing `Feature.Moved` as well would store the same fact twice, and only for the attached window.

---

## Data Flow

### Events precede incidents

A source beacons whether or not anyone is interested, so ingest appends unconditionally with no incident in the picture; incident association is applied at projection time, by joining against attachments. Three things follow:

- **Discovery works at all.** Showing what is available to attach needs events already recorded for unclaimed sources. Discovery reads a global, incident-independent read model: last seen, last value or position, kind, health.
- **Unknown sources are provisioned, not dropped.** Discarding an unrecognised credential would make the device unattachable, so first sight creates a provisional `Source` and its streams, labelled from whatever the daemon supplied.
- **Attachment is retroactive.** A source attached at 14:20 brings its earlier events with it — the window reaches backwards and the projections pick up more rows, so a chart extends back and a rule can be evaluated over the earlier data. No backfill job, no re-ingest. Detachment is the mirror.

### Scope and access

| Aspect | Rule |
|---|---|
| Stream ownership | Source streams are global and have no owning incident, so they stay out of `eventsourcing.aggregate_index` |
| Retention | Events are never deleted; archival copies to `archive_events` and is driven per incident. A source stream spans several incidents, so it cannot move when one of them is archived, and stays in the live store. |
| Access | See *Permission Model*. Attached streams can resolve through the incident; the discovery view cannot, since it exists to show streams belonging to no incident. |
| Hierarchy | Child-incident layers already bubble up into the parent, so a feature with an attached stream follows automatically |

---

## Permission Model

*To be defined.*

It has to cover who may see the global discovery view — which exposes every device's label, kind, last-seen and last position across the instance — and how access to an attached stream's data resolves.

---

## Derived Events and the Einsatzjournal

Raw source events never become journal entries. Derived events do, when a human could act on them:

| Source stream | Derived event | Journal |
|---|---|---|
| position every 10 s | *(nothing)* | no |
| position crosses a geofence | "Einheit 4 hat den Bereitschaftsraum erreicht" | yes |
| dose rate sampled every minute | *(nothing)* | no |
| dose rate crosses 5 µSv/h | "Dosisleistung Messpunkt 3 über Schwellwert" | yes |
| source silent for 10 min | "Drohne 2 seit 10 min offline" | yes |

A derived event surfaces as an ordinary journal entry: a hand-written message is something a human noticed and wrote down, and a machine-detected state change is the same in kind. How `Message` accommodates one is journal work, specified with the rule model that produces the events — see *Follow-up*.

### Periodic entries

A scheduled rule produces the same output from a different trigger: the clock. It reports a summary over a window — min, max, mean and delta for numeric streams, time in each state for boolean and enum ones, where an average would be nonsense.

Such an entry is a **protocol record**: evidence that the water level was logged hourly, in the numbered, immutable, exportable journal. It is not monitoring — the chart and the panel below the Lagekarte serve that. Hour-class intervals are therefore the default; a 10-minute digest from five sources would put ~360 machine entries into a journal holding a few hundred in total.

---

## Ingest API

Protocol handling lives outside SitRep: a telemetry daemon speaks APRS-IS, MQTT, Traccar or LoRaWAN, normalises, and calls SitRep's gRPC ingest API. That API is specified separately. Two things the domain requires of it:

- **A content-derived idempotency key** — from source, stream, `OccurredAt` and value, never generated per send. Two daemons relaying the same source must produce the same key for the same reading; a fresh UUID per transmission makes every copy look distinct and defeats deduplication. APRS-IS deduplicates the same way, on source and payload while ignoring the relay path.
- **Two-level identity** — the daemon authenticates as itself and vouches for the sources in its payload. The device holds no credential of its own, which is what makes an auto-provisioned `Source` attributable.

---

## Read-Model Projection

| Handler | Writes |
|---|---|
| `LayerFeaturesHandler` | `readmodel.layer_features` — **existing**, gains position-report streams |
| `DiscoveryHandler` | `readmodel.source_seen` — global "what is alive", incident-independent |
| `SensorReportHandler` | `readmodel.sensor_reading` — series for charts, the Lagekarte panel and summaries |
| `StreamRegistryHandler` | `readmodel.stream` — declared streams and their feature attachments |

---

## What This Adds

| Layer | Addition |
|---|---|
| Domain core | `source/` and `rule/` aggregates; `Feature` gains `StreamAttached` / `StreamDetached`; `PositionReport` and `SensorReport` streams with no aggregate |
| Inbound ports | `IngestService` (adapter-driven, not user-driven) · `SourceService` · `RuleService` |
| App services | `service/{ingest,source,rule}` — `ingest` is thin: normalise, append, notify |
| Outbound ports | `EventStore.AppendEvents(ctx, []eventsourcing.Event)` — appends without an Aggregate, so no load-replay-compare; `Queries` gains discovery and reading series |
| Inbound adapter | gRPC ingest, request-driven |
| Projections | the four handlers above |
| GraphQL | read-side only: stream types, the discovery query, reading series. The map is served by the existing layer query. |

`Event` is reused as it stands; its fields are public, so a source event is constructed directly rather than through `TrackChange`.

---

## Follow-up

Work this design accounts for but does not specify. Each needs its own document.

### Rules

Both the rule model and the component that applies it, plus how a `Message` carries a machine-generated entry.

**Hysteresis is the load-bearing part.** A dose rate oscillating around 5 µSv/h must not emit a journal entry per crossing, because those entries are immutable and numbered. A rule therefore needs a dwell time or a reset band, and per-scope state (armed / triggered) alongside its definition — not just a predicate.

**The evaluator has no precedent in the codebase.** Today the projector only writes read models; it never issues commands, whereas a rule evaluator reads the event stream and writes a `Message`. Whatever shape it takes: idempotency keys (`(stream, version)` for event-triggered rules, `(rule, incident, window start)` for scheduled ones), no reacting to its own output, and two drivers — the projector catch-up loop, and for scheduled rules the elected leader's ticker it already runs (`projection/projector.go`, `WithRetention`).

Open within it: whether periodic protocol entries should be **auto-triaged** rather than landing in `PENDING`, and what a scheduled rule emits when **no events arrived** in its window.

### Configuration and operator UI

Registering a source, provisioning a fleet ahead of an Einsatz, the discovery screen, and the attach flow.

---

## Prior Art: APRS

APRS has carried this traffic for decades. Three structural choices are borrowed; its encoding is not.

**Station vs. Object/Item.** A position report is a station reporting itself; an object is a station reporting about something else, owned by the station that introduced it — the two-level identity used here. APRS objects are also explicitly killed rather than left to linger; here that is a silence rule.

**Metadata decoupled from samples.** A telemetry packet carries only values; their meaning lives in separate, rarely-sent packets — `PARM` (names), `UNIT` (labels), `BITS` (polarity). That is the stream-declaration vs. event split. SitRep skips APRS's scaling coefficients (`EQNS`), since the daemon normalises first, and gives each quantity its own stream rather than a slot in a shared packet.

**Explicit imprecision.** APRS states position ambiguity explicitly and still displays data it cannot parse. Hence accuracy and fix type as first-class fields, and `raw` retained.

Not borrowed: the symbol vocabulary (SitRep uses taktische Zeichen) and all on-air encoding.

References: [telemetry format notes](https://github.com/PhirePhly/aprs_notes/blob/master/telemetry_format.md), [APRS Telemetry System](http://aprs.net/vm/DOS/TELEMTRY.HTM).
