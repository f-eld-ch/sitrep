-- +goose Up
-- Event-store schema: events table, projection support, and aggregate index.
-- Kept separate from the Hasura baseline so the event-sourcing layer can be
-- applied independently to an existing database or a fresh one.
-- All DDL is idempotent (IF NOT EXISTS) so it is safe to re-run.

CREATE SCHEMA IF NOT EXISTS eventsourcing;

CREATE TABLE IF NOT EXISTS eventsourcing.events (
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    version     int         NOT NULL,
    event_type  text        NOT NULL,
    data        jsonb       NOT NULL,
    metadata    jsonb       NOT NULL,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    xid         xid8        NOT NULL DEFAULT pg_current_xact_id(),
    seq         bigserial,
    PRIMARY KEY (stream_type, stream_id, version)
);
CREATE INDEX IF NOT EXISTS events_xid_seq_idx ON eventsourcing.events (xid, seq);

CREATE TABLE IF NOT EXISTS eventsourcing.projection_checkpoint (
    name    text  NOT NULL,
    version int   NOT NULL DEFAULT 1,
    cursor  bytea,
    PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS eventsourcing.projection_dead_letter (
    projection  text        NOT NULL,
    cursor      bytea       NOT NULL,
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    version     int         NOT NULL,
    error       text        NOT NULL,
    attempts    int         NOT NULL,
    parked_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (projection, stream_type, stream_id, version)
);

-- Aggregate index: maps every stream to its owning incident, so retention can
-- find and purge all streams belonging to an incident without scanning the log.
CREATE TABLE IF NOT EXISTS eventsourcing.aggregate_index (
    stream_type text NOT NULL,
    stream_id   uuid NOT NULL,
    incident_id uuid NOT NULL,
    PRIMARY KEY (stream_type, stream_id)
);
CREATE INDEX IF NOT EXISTS aggregate_index_incident_id_idx ON eventsourcing.aggregate_index (incident_id);

-- Per-incident message counter for gapless, immutable message numbers.
CREATE TABLE IF NOT EXISTS eventsourcing.incident_counters (
    incident_id uuid NOT NULL,
    next_number int  NOT NULL DEFAULT 1,
    PRIMARY KEY (incident_id)
);

-- +goose Down
DROP TABLE IF EXISTS eventsourcing.incident_counters;
DROP TABLE IF EXISTS eventsourcing.aggregate_index;
DROP TABLE IF EXISTS eventsourcing.projection_dead_letter;
DROP TABLE IF EXISTS eventsourcing.projection_checkpoint;
DROP TABLE IF EXISTS eventsourcing.events;
DROP SCHEMA IF EXISTS eventsourcing;
