-- +goose Up
CREATE TABLE IF NOT EXISTS eventsourcing.archive_events (
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    version     int         NOT NULL,
    event_type  text        NOT NULL,
    data        jsonb       NOT NULL,
    metadata    jsonb       NOT NULL,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL,
    xid         xid8        NOT NULL,
    seq         bigint      NOT NULL,
    archived_at timestamptz NOT NULL,
    PRIMARY KEY (stream_type, stream_id, version)
);
CREATE INDEX IF NOT EXISTS archive_events_archived_at_idx ON eventsourcing.archive_events (archived_at);

CREATE TABLE IF NOT EXISTS eventsourcing.archive_aggregate_index (
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    incident_id uuid        NOT NULL,
    archived_at timestamptz NOT NULL,
    PRIMARY KEY (stream_type, stream_id)
);
CREATE INDEX IF NOT EXISTS archive_aggregate_index_incident_id_idx ON eventsourcing.archive_aggregate_index (incident_id);

CREATE TABLE IF NOT EXISTS eventsourcing.archived_incidents (
    incident_id uuid        PRIMARY KEY,
    archived_at timestamptz NOT NULL,
    reason      text        NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS eventsourcing.archived_incidents;
DROP TABLE IF EXISTS eventsourcing.archive_aggregate_index;
DROP TABLE IF EXISTS eventsourcing.archive_events;