-- +goose Up

-- ──────────────────────────────────────────────────────────────────────────────
-- Event log
-- ──────────────────────────────────────────────────────────────────────────────

-- seq is the rowid alias and the global stream cursor.
--
-- AUTOINCREMENT is REQUIRED, not an optimisation. Without it SQLite assigns
-- max(rowid)+1 and reuses values freed by DELETE. IncidentRetention.Archive
-- deletes events, routinely including the tail of the log, so a plain rowid
-- would be reissued behind the projector's checkpoint and that event would
-- never be read.
CREATE TABLE eventsourcing_events (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_type TEXT    NOT NULL,
    stream_id   TEXT    NOT NULL,
    version     INTEGER NOT NULL,
    event_type  TEXT    NOT NULL,
    data        TEXT    NOT NULL,
    metadata    TEXT    NOT NULL,
    occurred_at TEXT    NOT NULL,
    recorded_at TEXT    NOT NULL,

    -- Optimistic-concurrency guard and EventStore.Load scan.
    UNIQUE (stream_type, stream_id, version)
) STRICT;

-- Supports IncidentHierarchyGuard.HasChildren and event-type scans.
CREATE INDEX eventsourcing_events_type_idx
    ON eventsourcing_events (stream_type, event_type);

-- ──────────────────────────────────────────────────────────────────────────────
-- Projection support
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE eventsourcing_projection_checkpoint (
    name    TEXT    NOT NULL PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    cursor  BLOB
) WITHOUT ROWID, STRICT;

CREATE TABLE eventsourcing_projection_dead_letter (
    projection  TEXT    NOT NULL,
    cursor      BLOB    NOT NULL,
    stream_type TEXT    NOT NULL,
    stream_id   TEXT    NOT NULL,
    version     INTEGER NOT NULL,
    error       TEXT    NOT NULL,
    attempts    INTEGER NOT NULL,
    parked_at   TEXT    NOT NULL,
    PRIMARY KEY (projection, stream_type, stream_id, version)
) STRICT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Aggregate index and counters
-- ──────────────────────────────────────────────────────────────────────────────

-- Maps every stream to its owning incident so retention can purge all streams
-- belonging to an incident without scanning the log.
CREATE TABLE eventsourcing_aggregate_index (
    stream_type TEXT NOT NULL,
    stream_id   TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    PRIMARY KEY (stream_type, stream_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX eventsourcing_aggregate_index_incident_id_idx
    ON eventsourcing_aggregate_index (incident_id);

-- Per-incident message counter for gapless, immutable message numbers.
CREATE TABLE eventsourcing_incident_counters (
    incident_id TEXT    NOT NULL PRIMARY KEY,
    next_number INTEGER NOT NULL DEFAULT 1
) WITHOUT ROWID, STRICT;

-- ──────────────────────────────────────────────────────────────────────────────
-- Archive tables (retention / auto-archive)
-- ──────────────────────────────────────────────────────────────────────────────

-- seq here is a copy of the original value from eventsourcing_events; it is
-- not AUTOINCREMENT because rows are moved, not appended fresh.
CREATE TABLE eventsourcing_archive_events (
    stream_type TEXT    NOT NULL,
    stream_id   TEXT    NOT NULL,
    version     INTEGER NOT NULL,
    event_type  TEXT    NOT NULL,
    data        TEXT    NOT NULL,
    metadata    TEXT    NOT NULL,
    occurred_at TEXT    NOT NULL,
    recorded_at TEXT    NOT NULL,
    seq         INTEGER NOT NULL,
    archived_at TEXT    NOT NULL,
    PRIMARY KEY (stream_type, stream_id, version)
) STRICT;

CREATE INDEX eventsourcing_archive_events_archived_at_idx
    ON eventsourcing_archive_events (archived_at);

CREATE TABLE eventsourcing_archive_aggregate_index (
    stream_type TEXT NOT NULL,
    stream_id   TEXT NOT NULL,
    incident_id TEXT NOT NULL,
    archived_at TEXT NOT NULL,
    PRIMARY KEY (stream_type, stream_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX eventsourcing_archive_aggregate_index_incident_id_idx
    ON eventsourcing_archive_aggregate_index (incident_id);

CREATE TABLE eventsourcing_archived_incidents (
    incident_id TEXT NOT NULL PRIMARY KEY,
    archived_at TEXT NOT NULL,
    reason      TEXT NOT NULL
) WITHOUT ROWID, STRICT;

-- +goose Down
DROP TABLE IF EXISTS eventsourcing_archived_incidents;
DROP TABLE IF EXISTS eventsourcing_archive_aggregate_index;
DROP TABLE IF EXISTS eventsourcing_archive_events;
DROP TABLE IF EXISTS eventsourcing_incident_counters;
DROP TABLE IF EXISTS eventsourcing_aggregate_index;
DROP TABLE IF EXISTS eventsourcing_projection_dead_letter;
DROP TABLE IF EXISTS eventsourcing_projection_checkpoint;
DROP TABLE IF EXISTS eventsourcing_events;
