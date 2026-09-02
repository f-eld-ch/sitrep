# Incident Retention

Incident retention keeps the live event store and read models focused on active operational data.
It is available only when SitRep uses the Postgres stack.

## Tutorial: Enable Retention Locally

1. Run the database migrations:

   ```sh
   go run . migrate up --config config.yaml
   ```

2. Add the policy to `config.yaml`:

   ```yaml
   auto-close-incidents: 30
   auto-archive-incidents: 730
   ```

3. Start the server:

   ```sh
   go run . serve --config config.yaml
   ```

After the projector completes its initial catch-up, its elected leader runs retention once. It
runs again every hour. Logs include the candidate counts, cutoffs, closed incident IDs, archived
incident IDs, and archive event/stream counts.

## How-to: Operate Retention

### Disable a policy

Set either policy to `0` to disable it. A disabled policy does not query candidates, write events,
move event streams, or trigger a read-model rebuild.

```yaml
auto-close-incidents: 0
auto-archive-incidents: 0
```

The same settings can be supplied on the server command:

```sh
sitrep serve --auto-close-incidents 0 --auto-archive-incidents 730
```

### Configure with environment variables

```sh
export SITREP_AUTO_CLOSE_INCIDENTS=30
export SITREP_AUTO_ARCHIVE_INCIDENTS=730
sitrep serve
```

Configuration precedence is: CLI flags, environment variables, YAML configuration file, then
defaults.

### Investigate retention activity

Look for these structured log messages:

- `incident retention auto-close candidates`
- `incident automatically closed`
- `incident retention archive candidates`
- `incident event streams archived`
- `archived incident event-store data`
- `retention archived incidents, rebuilding read models`

An archive failure makes the projector step down. Correct the underlying issue, such as a pending
migration, then restart the server or wait for a standby projector to become leader.

## Reference

| Flag | YAML key | Default | Environment variable | Meaning |
| --- | --- | --- | --- | --- |
| `auto-close-incidents` | `auto-close-incidents` | `0` | `SITREP_AUTO_CLOSE_INCIDENTS` | Days after creation before an open incident is automatically closed. |
| `auto-archive-incidents` | `auto-archive-incidents` | `0` | `SITREP_AUTO_ARCHIVE_INCIDENTS` | Days after closure before a closed, non-deleted incident is archived. |

Both settings are `uint` day counts and are local to `sitrep serve`. A value of `0` disables the
corresponding policy. Retention is disabled by default; configure a positive value to enable it.

### Manual deletion

`deleteIncident` is a soft delete. It requires a closed incident, appends
`Deleted{ReasonManual}`, and marks `rm_incident.is_deleted = true`; normal API queries exclude it,
but its live event streams remain available until archival.

When archival is enabled, manually deleted incidents are archived seven days after the `Deleted` event. This seven-day delay is fixed and is not configurable.

### Archive storage

Archival writes to these tables in the same Postgres database:

| Table | Contents |
| --- | --- |
| `eventsourcing.archive_events` | Full copies of every archived incident-owned event stream. |
| `eventsourcing.archive_aggregate_index` | Stream-to-incident ownership records. |
| `eventsourcing.archived_incidents` | Archive audit record with archive timestamp and reason. |

The archive operation removes the corresponding live event rows, aggregate-index rows, and
per-incident message counter after the archive copies are recorded in the same transaction.

## Explanation

### Lifecycle

Open incidents past `auto-close-incidents` receive a normal `Closed{ReasonAutoTimeout}` event.
Closed incidents past `auto-archive-incidents` receive `Deleted{ReasonPurge}` before their streams
are archived. A manually deleted incident already has `Deleted{ReasonManual}`, so it is archived
directly after its fixed seven-day delay without appending a second delete event.

### Why the worker runs with the projector

Retention runs only in the Postgres projector leader, protected by the existing advisory lock.
This prevents multiple server replicas from closing or archiving the same incident concurrently.
When an archive removes live events, the same leader resets every read-model handler and replays
the remaining live event log. Archived streams are therefore absent from rebuilt read models.

### Boundaries and recovery

Archive data is terminal for the normal API: it is retained for audit and recovery, not loaded by
ordinary aggregate repositories or projectors. The in-memory stack does not run retention because
it has no archive storage adapter. Restoring an archived incident is not currently implemented.