# Automatic Telemetry Events

## Overview

The Einsatzjournal holds hand-written messages. Telemetry adds machine input from devices such as vehicle trackers and dose-rate probes. This document describes how their positions and readings enter sitrep, how they are recorded per incident and shown on the map, and who may do what with them. The design is heavily influenced by [APRS](https://www.aprs.org/doc/APRS101.PDF), which has carried this kind of traffic for decades.

---

## Terms

A **device** is a piece of hardware that sends positions or readings on its own: a vehicle tracker, a handheld, a drone, a dose-rate probe, a weather station, a water gauge. Network elements that only relay data, such as a LoRaWAN gateway, a router or a repeater, are not devices.

A **sample** is what a device measured at one time: a position and/or sensor readings.

The **discovery state** is kept outside any incident, per device: the latest position, the latest readings, the time of the latest sample and the device's clock offset.

---

## Model

```mermaid
classDiagram
    direction LR
    class TelemetrySource {
        <<aggregate>>
        one per device
        owned by no incident
        identity, name, kind
        default symbol
        channels
        attachments
    }
    namespace Incident {
        class TelemetryRecording {
            <<aggregate>>
            one per device per incident
            configuration
            positions
            readings
            source description
        }
        class Feature["Feature (existing)"] {
            <<aggregate>>
            name, symbol, layer
            own position
        }
    }
    TelemetrySource "1" --> "0..*" TelemetryRecording : Attached / Detached
    TelemetryRecording "0..1" --> "0..1" Feature : PositionLinked / ReadingsLinked
```

A fact about the device goes on the `TelemetrySource`; what it sent during an incident goes on the `TelemetryRecording`; how it is shown on the map goes on the `Feature`.

| Aggregate | Owned by | Retention |
|---|---|---|
| `TelemetrySource` | no incident | never archived; holds no positions or readings |
| `TelemetryRecording` | its incident | archived and deleted with the incident |
| `Feature` | its incident | archived and deleted with the incident |

Ownership uses the existing mechanism: an owned aggregate implements `eventsourcing.Owned`, which lists its stream under the incident in `eventsourcing.aggregate_index`, and archiving an incident moves the listed streams to `archive_events`.

### `TelemetrySource`

An aggregate, one stream per device; "source" for short. Its id is derived from the device's identity, like `feature.DeriveID`, so ingest finds a device's source without a lookup.

| Field | Meaning |
|---|---|
| identity | must be unique among all devices, e.g. an IMEI, callsign-SSID or DevEUI |
| name | recognisable in discovery, e.g. "Tracker Peli 4" |
| kind | tracker, probe, gauge, weather station |
| default symbol | taktisches Zeichen used when the source is attached with a new `Feature` |
| channels | the quantities it reports, see below |

A source reports zero or one position: latitude, longitude, accuracy, fix type, and optionally course, speed and altitude. Position is not a channel, because it decides where the source is on the map rather than being a quantity to chart.

A channel is a declaration on the source: label, description, unit and value type. Value types are numeric and enum. An enum channel declares labelled states instead of a unit. Readings arrive normalised to engineering units and checked for plausibility by the telemetry daemon (see [Ingesting](#ingesting)).

| Event | Data |
|---|---|
| `Registered` | identity, kind, name, default symbol |
| `Updated` | name, kind, default symbol |
| `ChannelAdded` / `ChannelUpdated` | channel declaration |
| `ChannelRemoved` | channel |
| `Attached` / `Detached` | incident, recording id |
| `Unregistered` | — |

### `TelemetryRecording`

An aggregate, one stream per source per incident, holding what that source sent while attached to that incident. Its id is derived from the source and the incident, like `feature.DeriveID`, so re-attaching a source to the same incident continues the same stream.

A recording is self-describing through `SourceDescribed`, so an exported or archived incident is complete without the source stream.

Its configuration says what is recorded: the linked `Feature`, if any, whether the position is recorded, and which channels are. See [Attaching](#attaching).

| Event | Written | Data |
|---|---|---|
| `SourceDescribed` | on attach; when the source changes while attached | identity, kind, name, channels |
| `Configured` | on attach; when the configuration changes; on detach | feature id, position on/off, channels — empty on detach |
| `PositionRecorded` | by ingest, if the position is recorded | `{lat, lon, accuracy, fixType, course?, speed?, altitude?}` |
| `ReadingsRecorded` | by ingest | `[{channel, value, unit}]`, the recorded readings of one sample |

A reading's `value` matches its channel's value type: a number, or an enum state's key as a string. The unit is on every numeric reading, so a reading stays correct when its channel's declaration changes. An enum reading has no unit; its key is resolved with the channel's states in the `SourceDescribed` in effect when it was recorded.

Positions and readings carry protocol, gateway, clock source, raw payload and, if the time was replaced, the original time as metadata.

### `Feature`

The existing aggregate for a drawn object on a layer. It gains links to a recording:

| Event | Written | Data |
|---|---|---|
| `PositionLinked` / `PositionUnlinked` | position recording switched on / off for this `Feature`; relinked; detached | recording id |
| `ReadingsLinked` / `ReadingsUnlinked` | readings switched on / off for this `Feature`; relinked; detached | recording id |

How the links behave is described in [Attaching](#attaching).

---

## Attaching

Attaching a source to an incident is a command. The operator chooses a `Feature`, or none, and toggles the position and each channel; only what is switched on is recorded. Recording starts at attach; nothing the source measured before enters the incident.

| `Feature` | Linked to | Position on the map |
|---|---|---|
| linked, position on | existing, or new with the source's name and default symbol | follows the recorded positions |
| linked, position off | existing | the `Feature`'s own, moved by operators |
| none | — | none; where such a source is shown is left to the UI |

Each command writes all affected streams in one transaction, as the incident service does for `Incident` and `IncidentAccess`. Events are written only by commands and by ingest, never in reaction to other events, so replay reproduces the state and creates nothing.

A source is attached to at most one incident at a time: one device in two incidents would mean two command structures claiming it. Because the current attachment is on the `TelemetrySource`, this is an ordinary aggregate invariant. Child-incident layers shown in the parent are not a second attachment.

### Position on the map

While `PositionLinked`, the `Feature`'s position on the map comes from the recording's `PositionRecorded` events, not from the `Feature` itself. The `Feature` therefore rejects a `Moved` that takes effect while it is `PositionLinked`, also once the link has ended, except the one written when a position link ends. A `Moved` that takes effect outside a link is accepted, for example one for an older message on a message map layer. Name and symbol change with `Restyled` as usual; the layer is fixed, as for any `Feature`.

A `Feature` created on attach is `Placed` without geometry, and a `Feature` without geometry is not shown on the map.

### Ending a position link

When a command ends a `Feature`'s `PositionLinked` state — by turning the position off, relinking the source to another `Feature`, or detaching it — it writes `PositionUnlinked` and, before it, one of:

- a `Moved` to the position with the latest `OccurredAt` recorded for this `Feature`, taking effect at that `OccurredAt`, so it stays where the source was last seen;
- nothing, if no position was recorded and the `Feature` has its own geometry;
- `Removed`, if no position was recorded and the `Feature` has no geometry. Readings still linked to the removed `Feature` are unlinked as well.

On message map layers, every `Feature` change normally references a message. A `Feature` change written by attaching, configuring or detaching a source references an event of its recording instead: the `Moved` when a position link ends references the last `PositionRecorded`, every other change the `Configured` written with it.

### Detaching

Detaching ends recording until the source is attached again. The `Feature` is unlinked as above; unless removed, it remains on its layer as an ordinary `Feature`. Other commands also detach:

- Removing a linked `Feature`. Its position link ends as above before it is removed, so `Restored` brings it back where the source was last seen, without re-attaching. The removal takes effect no earlier than that.
- Closing an incident detaches all its sources, also when retention closes it automatically. Reopening does not re-attach. The close command finds the incident's recordings through a new outbound port over `eventsourcing.aggregate_index`, which the event store writes synchronously, and detaches every source currently attached to the incident in the same transaction. It is the first command on an incident that writes other aggregates.
- Unregistering a source, when its device is de-provisioned.

Close is serialised with every other write to the incident's recordings, by commands and by ingest, through a lock per incident on the same port: close takes it exclusively, all other writers shared. Each takes the lock before it checks that the incident is open and holds it until its transaction commits. Optimistic concurrency is not enough, because neither attach nor ingest writes the `Incident`. As with `IncidentHierarchyGuard`, the lock is implemented in the adapters.

---

## Ingesting

The telemetry daemon is an external service: it receives or fetches data from devices and third-party providers — for example over APRS-IS, MQTT, LoRaWAN or a web API — normalises it into positions and readings in engineering units, and calls sitrep's gRPC ingest API, an inbound adapter specified separately.

```mermaid
flowchart LR
    D["devices and<br/>third-party providers"] --> T["<b>telemetry daemon</b><br/>receive or fetch<br/>filter devices<br/>verify devices<br/>limit rates<br/>normalise<br/>reject implausible values"]
    T -- "gRPC" --> I["<b>sitrep ingest</b><br/>authenticate telemetry daemon<br/>find source<br/>drop too frequent"]
    I --> R["TelemetryRecording<br/>(if attached)"]
    I --> S["discovery state<br/>(always)"]
```

The ingest API has at least these calls:

| Call | Carries |
|---|---|
| announce a device | identity, name, kind, default symbol, channels |
| de-provision a device | identity |
| send samples | per sample: identity, `OccurredAt`, clock source, position and/or readings, metadata |

A call is acknowledged once its effects are stored; a telemetry daemon retries until it is.

Ingest updates the discovery state with every sample newer than the one it holds. If the source was attached to an incident at the sample's `OccurredAt`, ingest appends the sample to that incident's recording for the source, limited to the position and channels switched on in the `Configured` in effect at that time (see [Attaching](#attaching)); otherwise it stores nothing else. An incident that is no longer open is never modified, so a late sample for it is dropped. The discovery state is written directly by ingest, not projected, because it also covers unattached sources, whose data are not events.

If a reading reaches ingest with a unit other than its channel's declared unit, ingest records it as sent.

### Trust

The telemetry daemon, not the device, is authenticated by sitrep; the telemetry daemon vouches for the sources in its payload. Devices are verified by the telemetry daemon or the system it receives data from, as far as the protocol allows: a LoRaWAN network server checks device keys, APRS has nothing to check. sitrep holds no per-device credentials.

### Provisioning

Devices are provisioned in the telemetry daemon, with their name, kind, default symbol and channels. The telemetry daemon forwards data only from provisioned devices, and its configuration can limit that further, for example by region or callsign for a provider such as aprs.fi. Ingest registers a source when the telemetry daemon announces a provisioned device; announcing a device whose source is registered updates its name, kind, default symbol and channels. A channel missing from the announcement is removed. A channel in a `Configured` that the source no longer declares is ignored. A sample from a device without a registered source is dropped. When a device is de-provisioned, the telemetry daemon calls ingest to de-provision it, and ingest unregisters its source, detaching it first if it is attached, and removes it from the discovery state. Data already recorded in incidents is unaffected. If the device is provisioned again, ingest registers its previous source again, because the source's id is derived from the device's identity.

### Rates

Without limits, a device sending every second would produce almost 30,000 samples in eight hours. Most devices already send at a sensible rate: APRS trackers typically use [SmartBeaconing](https://www.qsl.net/n2ixd/digitraker/smartbeaconing.htm) — rare when parked, frequent at speed, extra on turns — and sensors report about once a minute, enum channels on change and periodically. The telemetry daemon may limit the rate of a device that sends more often than an incident needs.

Ingest limits rates to protect sitrep from overload, whatever devices and telemetry daemons send. A position is dropped if its `OccurredAt` is less than about 30 s from the `OccurredAt` of another recorded position of the same source. A numeric reading is dropped if its `OccurredAt` is less than about 30 s from the `OccurredAt` of another recorded reading of the same channel. Enum channels can change in bursts, so an enum reading is dropped only if its channel already has about 5 recorded readings whose `OccurredAt` is within about 1 min of its own. The position and each reading of a sample are checked separately, so a sample's position can be dropped while its readings are kept.

A recording then typically grows by about 120 events per hour, under 10,000 over a three-day incident. Ingest loads the recording for every sample, replaying its events. With recordings growing at this rate, this is acceptable at first; if load latency is measured to matter, `outbound.SnapshotStore` (so far only no-op implementations) is the remedy. Operator commands rarely write to a recording, so on a version conflict with incoming telemetry the service retries.

### Duplicates

A duplicate, such as a retried send or the same sample relayed by two telemetry daemons, has the same `OccurredAt` as the original or one only seconds later, so the rate limits drop it. An enum reading with the same `OccurredAt` as a recorded reading of the same channel is dropped as well.

### Time and device clocks

`PositionRecorded` and `ReadingsRecorded` carry `OccurredAt`, the device time of the sample, and `RecordedAt`, when it was stored. Ordering is by `OccurredAt`; late arrival, e.g. a buffer sent after a device was offline, is normal. A recording's versions follow arrival order, not `OccurredAt`: anything that depends on time — the recording's own state, the read models — orders by `OccurredAt`; a version only identifies an event.

The telemetry daemon states the clock source with each sample, since a device can lose GNSS and fall back to its own clock:

| Clock source | `OccurredAt` |
|---|---|
| `gnss`, `ntp`, `rtc` (the device's free-running clock) | as sent |
| `none` | the telemetry daemon's receive time |

The following applies to every sample:

- Upper bound: `OccurredAt` may be at most the time ingest receives the sample, plus a small buffer for skewed clocks. Later values are replaced by the time ingest received the sample, with the original time kept in metadata.
- No lower bound: the attachment check above also drops samples with a clock reset to 1970 or a week-number rollover.
- Ingest counts, per source, the samples it drops — from before the attach, for an incident that is no longer open, too frequent — and the samples whose time it replaced, as OTel metrics, so a device whose samples are all dropped is visible outside the incident.
- The discovery state shows each source's clock offset, `RecordedAt − OccurredAt`. A constant offset, especially in whole hours, indicates a misconfigured clock and is reported as an OTel metric with a `Warn` log and flagged in discovery; a shrinking one is a buffer being sent. sitrep never corrects offsets.

---

## Map and Read Models

| Projection handler | Writes |
|---|---|
| `LayerFeaturesHandler` | `readmodel.layer_features` — existing, gains `TelemetryRecording` |
| `ReadingHandler` | `readmodel.reading` — reading series for charts |
| `SourceRegistryHandler` | `readmodel.telemetry_source` — registrations, channels, current attachment |

In `readmodel.layer_features`, a linked `Feature` combines name and symbol from the `Feature`, the latest readings while readings are linked, and the position with the latest `OccurredAt` while the position is linked, together with that `OccurredAt`, so the map can show how old the position is.

Reading series are per `Feature`: a reading belongs to the `Feature` linked at its `OccurredAt`, also if it arrives late. A source without a `Feature` has one series per recording. The read models show an enum reading with its state's label.

The existing layer query serves the map unchanged. GraphQL gains queries for sources, discovery and reading series, and mutations to attach, configure and detach a source.

At about one position per minute, twenty vehicles cause one layer update every three seconds, which the current projection handles. Much higher rates would need the map to fetch only changed features instead of the whole layer.

---

## Permissions

| Action | Who |
|---|---|
| provision and de-provision devices, with their name, kind and default symbol, in the telemetry daemon | `system_admin`; the means are not decided yet |
| see the full discovery state, with positions and clock offsets | `system_admin`; while attaching, whoever may attach |
| attach, configure, detach | new incident action `telemetry.attach`: owner, manager, editor |
| see recorded data | whoever may read the incident's layers |

---

## Examples

In the tables, `Feature`s are referred to by name.

### A sensor box at two measuring points

A portable box with GNSS, a water-level probe and a battery sensor is provisioned in the telemetry daemon. In the incident "Hochwasser Thur", an operator places a `Feature` "Messpunkt 1" on the map and attaches the box to it, recording only the water level; the box's GNSS is not used. Later the box is carried to a second point. The operator places a `Feature` "Messpunkt 2" and links the box to it, without detaching it from the incident. Messpunkt 1 keeps the water level measured there; Messpunkt 2's series starts after the move.

| Step | `TelemetrySource` | `TelemetryRecording` | `Feature` |
|---|---|---|---|
| box provisioned in the telemetry daemon | `Registered`, `ChannelAdded` ×2 | | |
| operator places "Messpunkt 1" | | | Messpunkt 1: `Placed` |
| attached to Messpunkt 1; position off, water level on | `Attached` | `SourceDescribed`, `Configured`(Messpunkt 1, off, [water_level]) | Messpunkt 1: `ReadingsLinked` |
| box sends | | `ReadingsRecorded`(water_level); position and battery not recorded | |
| operator places "Messpunkt 2" | | | Messpunkt 2: `Placed` |
| box relinked to Messpunkt 2 | | `Configured`(Messpunkt 2, off, [water_level]) | Messpunkt 1: `ReadingsUnlinked` · Messpunkt 2: `ReadingsLinked` |
| box sends | | `ReadingsRecorded`(water_level) | |

### A truck that parks in a shelter

Truck TLF 21 has a tracker with GNSS and a sensor for the water left in its tank. An operator attaches the tracker with a new `Feature`, recording position and tank level. The `Feature` appears on the map with the first position and follows the truck as it drives to the incident; the operator renames it. The truck then parks in a shelter where GNSS is useless, so the operator switches the position off: the `Feature` stays where the truck was last seen, and the tank level keeps coming. When the incident is closed, the tracker is detached and its `Feature` remains on the map.

| Step | `TelemetrySource` | `TelemetryRecording` | `Feature` |
|---|---|---|---|
| tracker provisioned in the telemetry daemon | `Registered`, `ChannelAdded`(tank_level) | | |
| attached with a new `Feature`; position on, tank level on | `Attached` | `SourceDescribed`, `Configured`(TLF 21, on, [tank_level]) | `Placed` (without geometry), `PositionLinked`, `ReadingsLinked` |
| truck drives | | `PositionRecorded` …, `ReadingsRecorded`(tank_level 2400 l) | (shown on the map from the first position) |
| operator renames it | | | `Restyled` |
| parked in the shelter; position switched off | | `Configured`(TLF 21, off, [tank_level]) | `Moved`(last position), `PositionUnlinked` |
| incident closed (`Closed` on the `Incident`) | `Detached` | `Configured`(empty) | `ReadingsUnlinked` |

---

## Future Work

### Telemetry daemon

A UI for provisioning devices in the telemetry daemon, ahead of an incident or during it, for an organisation's own devices and third-party sources. A catalogue of providers — MeteoSchweiz, aprs.fi, Flightradar24 — could make theirs available with little configuration.

A static clock offset per device, configured in the telemetry daemon, for devices whose clocks cannot be fixed.

### sitrep backend

A rule turns telemetry into a journal message, a derived entry, when a person could act on it: a dose rate crossing 5 µSv/h, a vehicle entering the Bereitschaftsraum, a drone silent for ten minutes. Positions and readings themselves never become journal entries.

Known constraints:

- Evaluation belongs in the service layer. A projection that emitted messages would emit them again on every rebuild.
- Idempotency keys: `(recording, version)` for event-triggered rules, `(rule, incident, window start)` for scheduled ones; a rule never reacts to its own output.
- Hysteresis: a value oscillating around a threshold must not emit an immutable, numbered message per crossing, so a rule needs a dwell time or reset band and armed/triggered state.
- Periodic summaries are protocol records, not monitoring, so their interval should be long, e.g. hourly.
- Open: whether periodic entries are auto-triaged, and what a scheduled rule emits when nothing arrived.

A recording starts at attach, and sitrep keeps no history for unattached sources. Bringing earlier data into an incident would require keeping it, or fetching it from the telemetry daemon or the provider.

### sitrep UI

Discovery, the attach dialog, and where sources attached without a `Feature` are shown.

Sources can also be attached through a Mittel. `Resource` is currently created inside an incident. Once Mittel can be created ahead of time, a Mittel can list its sources: alerting it into an incident attaches them with a default configuration, name and symbol, and `Relieved` detaches them. Manual attach remains for sources without a Mittel, such as a MeteoSchweiz weather station.

The Nachrichtenkarte shows the map at a past time from `readmodel.feature_change`, which holds `Feature` changes but no recorded positions. Showing where a source was at that time needs its positions over time.
