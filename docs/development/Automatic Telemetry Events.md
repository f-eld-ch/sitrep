# DRAFT: Automatic Telemetry Events

This document describes how automatic telemetry events — positions and sensor readings — enter SitRep, how they reach the map and the Einsatzjournal, and what they add to the existing domain model.

---

## Overview

The Einsatzjournal today holds hand-written messages from radio, phone and email. Automatic telemetry events extend it with machine input: a vehicle's GPS tracker, a team's handheld, a drone, a dose-rate probe, a weather station, a water gauge during a flooding incident.

All of it arrives as immutable statements about the world, attributed to the hardware that produced them — the same as a hand-written message, which is why it belongs in the same append-only log. What differs is visibility: the log holds everything, the Einsatzjournal shows a curated subset. Raw telemetry never reaches the journal — only the **derived entries** a rule produces from it.

Twenty vehicles over an eight-hour Einsatz produce tens of thousands of events, against a journal of a few hundred entries. That volume lands on the read model, which is where this design has to answer for it.

---

## Concepts

### `TelemetrySource`

The hardware that originates the data: a GPS tracker, a dose-rate probe, a fixed weather station. A gateway is **not** a source — it is a network element like the telemetry daemon itself, so two probes behind one LoRaWAN gateway are two sources and the gateway appears only in event metadata.

A source may sit inside an Einsatzmittel — a vehicle, a Peli case — or belong to nobody in particular, such as another organisation's weather station.

| Field | Meaning |
|---|---|
| identity | the device (IMEI, callsign-SSID, DevEUI) |
| label | descriptive, so discovery shows something recognisable — "Tracker Peli 4" |
| kind | tracker, probe, gauge, weather station |
| credentials | what the daemon presents for it |
| declared channels | see below |

`TelemetrySource` is an **Aggregate**. It carries three kinds of fact on one stream: its registration and declarations, its reports, and its attachment to an incident. Holding all three together is what makes the attachment rules enforceable — see *Attachment*.

Sources are global and can be provisioned ahead of time: a box of trackers registered and ready to appear in discovery. They are also auto-provisioned on first sight, since requiring pre-registration would drop data and defeat discovery.

A source's stream grows for as long as the hardware reports. Snapshots are the existing answer if load latency is ever measured to matter.

### Position

A source reports **zero or one** position. A tracker reports one continuously; a fixed sensor array may have no way of knowing where it is, and is placed by an operator instead.

A position carries accuracy, fix type and optionally course, speed and altitude. It is not a measured quantity to be charted — it is what the source's map feature *is*, which is why it is modelled apart from channels.

### `TelemetryChannel`

A source declares zero or more **channels**: the quantities it reports. A vehicle tracker might declare battery voltage; a carried probe declares dose rate; a vehicle declares its FMS-Status.

Each `TelemetryChannel` declares a label, description, unit, value type and plausibility bounds. **Value types** are numeric, boolean or enum. The third is not a convenience: an FMS-Status of 3 means *on the way to the scene*, not a quantity — averaging it is meaningless and it charts as state-over-time. An enum channel declares its permitted values and labels; `unit` is empty for it.

Readings carry no scaling coefficients and no unit conversion; the daemon normalises to engineering units. Alarm levels live on `Rule`, and a channel's bounds are plausibility only, for rejecting garbage.

**The unit belongs on the event.** `3.87` is not a fact; `3.87 m` is. That keeps the event self-describing and correct when a sensor is reconfigured, and makes the channel declaration a convenience rather than the source of truth. If an incoming unit differs from the declaration's, the event still wins and the declaration follows — but the change is surfaced, because a series that changes unit partway cannot be charted as one line.

### Attachment

Attaching a `TelemetrySource` to an incident is one act, recorded on the source. It supplies the layer, the label and the taktisches Zeichen from the BABS catalogue (`BabsIconId`, `ui/src/components/babs/`), and it decides **who owns the geometry**:

| Mode | Geometry |
|---|---|
| **Follows** | the source's reported position drives the map feature; operators cannot move it |
| **Fixed** | the operator places the feature and can move it; reported positions are recorded but ignored |

Both modes produce the same thing — a feature on a layer, projected from the source and annotated with its channel readings. Only the writer of the geometry differs. **Follows** is unavailable to a source that reports no position; **fixed** is always available, and is the answer for a probe whose GPS is useless indoors or a vehicle parked as a measuring station. The mode is switchable during an Einsatz, and positions keep being recorded either way, so ignoring one loses no data and following can start later with the history intact.

Operational identity therefore lives on the attachment, not on the hardware. Moving a tracker between vehicles is a detach and a re-attach. A future Mitteltabelle would slot in at that step, supplying label and symbol from the Mittel instead of an operator typing them; specified separately.

**A source is attached to at most one incident at a time.** A Löschfahrzeug in two Einsätze means two command structures claiming one vehicle. Because attachment is recorded on the source itself, this is an ordinary aggregate invariant and needs no cross-stream guard. Child-incident layers bubbling up into the parent are not a second attachment.

Detaching stops the updates. The service writes an ordinary `Feature` holding the last position in the same transaction, so the icon persists on the layer and becomes editable like any other — the same pattern the incident service already uses to create `Incident` and `IncidentAccess` together.

A source needs no attachment to be useful. Unattached it still charts and still fires rules, because both read the source directly and never the map. It is presented below the Lagekarte, which is also where a source goes when its position is unavailable or not useful.

### `Rule`

What turns telemetry into a derived entry: a threshold crossing, a geofence entry, a scheduled digest, or **silence** — a source that has stopped reporting, which is also how a position goes stale and the map stops presenting it as current. Rules are incident-scoped and read sources directly. The model is deferred — see *Follow-up*.

---

## Event Model

One stream per source, `StreamType` `"TelemetrySource"`.

| Event | Data |
|---|---|
| `Registered` | identity, kind, label |
| `Relabelled` | label |
| `ChannelDeclared` | channel id, label, description, unit, value type, bounds |
| `PositionReported` | `{lat, lon, accuracy, fixType, course?, speed?, altitude?}` |
| `ReadingReported` | `{channel, value, unit}` |
| `AttachedToIncident` | incident, layer, label, symbol, geometry mode, position (fixed mode) |
| `PlacementMoved` | position — fixed mode only |
| `DetachedFromIncident` | — |

Reports carry `protocol`, `gateway` and the raw payload in metadata; the stream already identifies the source. `Version` behaves as it does on every other aggregate: stream ordering and the optimistic concurrency check, nothing more.

**Time** needs no new field. `eventsourcing.Event` already carries `OccurredAt`, the device's clock when the fix or measurement was taken, and `RecordedAt`, when the store wrote it. Ordering is by `OccurredAt`, with out-of-order arrival normal — an offline tracker dumping its buffer on reconnect is routine — and backfill is identifiable as an old `OccurredAt` with a current `RecordedAt`. `Message.time` vs. `Message.createdAt` is the existing precedent.

---

## Live Positions and the Map

A source's map feature is projected into `readmodel.layer_features` from its own events — `AttachedToIncident` creates the row, `PositionReported` or `PlacementMoved` updates the geometry, `DetachedFromIncident` hands it over to a real `Feature`. `LayerFeaturesHandler` gains `TelemetrySource` alongside `Layer` and `Feature`, so one table still holds every feature on a layer and the existing layer query serves the map unchanged.

**This is where the rate matters.** At APRS cadence twenty vehicles produce roughly one layer update every three to five seconds — about one per UI poll — and the existing projection shape holds. At ten-second beacons the whole FeatureCollection would be refetched on every poll, and the answer then is per-feature rows so a client fetches only what changed. A future problem, not a reason to build a second projection now.

---

## Data Flow

### Events precede incidents

A source beacons whether or not anyone is interested, so ingest appends unconditionally with no incident in the picture; incident association comes from the attachment recorded later on the same stream. Three things follow:

- **Discovery works at all.** Showing what is available to attach needs events already recorded for unclaimed sources. Discovery reads a global, incident-independent read model: last seen, last value or position, kind, health.
- **Unknown sources are provisioned, not dropped.** Discarding an unrecognised credential would make the device unattachable, so first sight registers a provisional source and its channels, labelled from whatever the daemon supplied.
- **Attachment is retroactive.** A source attached at 14:20 brings its earlier events with it — the projections pick up what was recorded before the attachment, so a chart extends back and a rule can be evaluated over it. No backfill job, no re-ingest. Detachment is the mirror.

### Scope and access

| Aspect | Rule |
|---|---|
| Ownership | A source is never owned by an incident, so it stays out of `eventsourcing.aggregate_index`. Archiving an incident must never delete a source whose history spans several. |
| Retention | Events are never deleted. Archival is driven per incident and copies to `archive_events`; a source stream spans incidents and stays in the live store. |
| Access | See *Permission Model*. An attached source can resolve through its incident; the discovery view cannot, since it exists to show sources belonging to none. |
| Hierarchy | Child-incident layers already bubble up into the parent, so an attached source's feature follows automatically |

---

## Permission Model

*To be defined.*

It has to cover who may see the global discovery view — which exposes every device's label, kind, last-seen and last position across the instance — and how access to an attached source's data resolves.

---

## Derived Entries and the Einsatzjournal

Raw telemetry never becomes a journal entry. A rule can turn it into one, when a human could act on the result:

| Telemetry | Derived entry | Journal |
|---|---|---|
| position every 10 s | *(nothing)* | no |
| position crosses a geofence | "Einheit 4 hat den Bereitschaftsraum erreicht" | yes |
| dose rate sampled every minute | *(nothing)* | no |
| dose rate crosses 5 µSv/h | "Dosisleistung Messpunkt 3 über Schwellwert" | yes |
| source silent for 10 min | "Drohne 2 seit 10 min offline" | yes |

A derived entry is an ordinary journal entry: a hand-written message is something a human noticed and wrote down, and a machine-detected state change is the same in kind. How `Message` accommodates one is journal work, specified with the rule model that produces them — see *Follow-up*.

### Periodic entries

A scheduled rule produces the same output from a different trigger: the clock. It reports a summary over a window — min, max, mean and delta for numeric channels, time in each state for boolean and enum ones, where an average would be nonsense.

Such an entry is a **protocol record**: evidence that the water level was logged hourly, in the numbered, immutable, exportable journal. It is not monitoring — the chart and the panel below the Lagekarte serve that. Hour-class intervals are therefore the default; a 10-minute digest from five sources would put ~360 machine entries into a journal holding a few hundred in total.

---

## Ingest API

Protocol handling lives outside SitRep: a telemetry daemon speaks APRS-IS, MQTT, Traccar or LoRaWAN, normalises, and calls SitRep's gRPC ingest API. That API is specified separately. Two things the domain requires of it:

- **A content-derived idempotency key** — from source, channel, `OccurredAt` and value, never generated per send. Two daemons relaying the same source must produce the same key for the same reading; a fresh UUID per transmission makes every copy look distinct and defeats deduplication. APRS-IS deduplicates the same way, on source and payload while ignoring the relay path.
- **Two-level identity** — the daemon authenticates as itself and vouches for the sources in its payload. The device holds no credential of its own, which is what makes an auto-provisioned source attributable.

---

## Read-Model Projection

| Handler | Writes |
|---|---|
| `LayerFeaturesHandler` | `readmodel.layer_features` — **existing**, gains `TelemetrySource` |
| `DiscoveryHandler` | `readmodel.source_seen` — global "what is alive", incident-independent |
| `ReadingHandler` | `readmodel.reading` — series for charts, the Lagekarte panel and summaries |
| `SourceRegistryHandler` | `readmodel.telemetry_source` — registrations, declared channels, attachments |

---

## What This Adds

| Layer | Addition |
|---|---|
| Domain core | `telemetry/` and `rule/` aggregates. `Feature` is unchanged. |
| Inbound ports | `IngestService` (adapter-driven, not user-driven) · `TelemetrySourceService` · `RuleService` |
| App services | `service/{ingest,telemetry,rule}` — `ingest` is thin: normalise, append, notify |
| Outbound ports | `Queries` gains discovery and reading series. The event store is unchanged — telemetry appends through the ordinary aggregate path. |
| Inbound adapter | gRPC ingest, request-driven |
| Projections | the four handlers above |
| GraphQL | read-side only: source types, the discovery query, reading series. The map is served by the existing layer query. |

---

## Follow-up

Work this design accounts for but does not specify. Each needs its own document.

### Rules

Both the rule model and the component that applies it, plus how a `Message` carries a machine-generated entry.

**Evaluation belongs in the service layer.** Projections only build read models and never cause side effects — a projector that emitted journal entries would re-emit them on every rebuild. A rule evaluator therefore loads aggregates and issues commands through the ordinary write path, driven by the elected leader's ticker for scheduled rules. Whatever shape it takes: idempotency keys (`(source, version)` for event-triggered rules, `(rule, incident, window start)` for scheduled ones) and no reacting to its own output.

**Hysteresis is the load-bearing part.** A dose rate oscillating around 5 µSv/h must not emit a journal entry per crossing, because those entries are immutable and numbered. A rule therefore needs a dwell time or a reset band, and per-scope state (armed / triggered) alongside its definition — not just a predicate.

Open within it: whether periodic protocol entries should be **auto-triaged** rather than landing in `PENDING`, and what a scheduled rule emits when **no events arrived** in its window.

### Configuration and operator UI

Registering a source, provisioning a fleet ahead of an Einsatz, the discovery screen, and the attach flow.

---

## Prior Art: APRS

APRS has carried this traffic for decades. Three structural choices are borrowed; its encoding is not.

**Station vs. Object/Item.** A position report is a station reporting itself; an object is a station reporting about something else, owned by the station that introduced it — the two-level identity used here. APRS objects are also explicitly killed rather than left to linger; here that is a silence rule.

**Metadata decoupled from samples.** A telemetry packet carries only values; their meaning lives in separate, rarely-sent packets — `PARM` (names), `UNIT` (labels), `BITS` (polarity). That is the channel-declaration vs. event split. SitRep skips APRS's scaling coefficients (`EQNS`), since the daemon normalises first, and gives each quantity its own channel rather than a slot in a shared packet.

**Explicit imprecision.** APRS states position ambiguity explicitly and still displays data it cannot parse. Hence accuracy and fix type as first-class fields, and `raw` retained.

Not borrowed: the symbol vocabulary (SitRep uses taktische Zeichen) and all on-air encoding.

References: [telemetry format notes](https://github.com/PhirePhly/aprs_notes/blob/master/telemetry_format.md), [APRS Telemetry System](http://aprs.net/vm/DOS/TELEMTRY.HTM).
