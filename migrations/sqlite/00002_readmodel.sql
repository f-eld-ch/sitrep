-- +goose Up

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel_incident
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel_incident (
    id         TEXT    NOT NULL PRIMARY KEY,
    parent_id  TEXT,
    name       TEXT    NOT NULL,
    is_closed  INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    closed_at  TEXT,
    deleted_at TEXT,
    location   TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    CHECK (parent_id IS NULL OR parent_id != id),
    CHECK (location IS NULL OR json_valid(location))
) STRICT;

CREATE INDEX readmodel_incident_created_at_idx
    ON readmodel_incident (created_at DESC);
CREATE INDEX readmodel_incident_deleted_at_idx
    ON readmodel_incident (deleted_at) WHERE is_deleted = 1;
CREATE INDEX readmodel_incident_closed_at_idx
    ON readmodel_incident (closed_at) WHERE is_closed = 1 AND is_deleted = 0;
CREATE INDEX readmodel_incident_parent_id_idx
    ON readmodel_incident (parent_id, created_at DESC)
    WHERE parent_id IS NOT NULL AND is_deleted = 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel_incident_division
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel_incident_division (
    id          TEXT NOT NULL PRIMARY KEY,
    incident_id TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    removed_at  TEXT
) STRICT;

CREATE INDEX readmodel_incident_division_incident_id_idx
    ON readmodel_incident_division (incident_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel_message
-- division_ids is stored as a JSON text array; it is never a query predicate,
-- only ever read/written whole in Go (see plan constraint 7).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel_message (
    id              TEXT    NOT NULL PRIMARY KEY,
    incident_id     TEXT    NOT NULL,
    number          INTEGER NOT NULL,
    content         TEXT    NOT NULL DEFAULT '',
    sender          TEXT    NOT NULL DEFAULT '',
    sender_detail   TEXT    NOT NULL DEFAULT '',
    receiver        TEXT    NOT NULL DEFAULT '',
    receiver_detail TEXT    NOT NULL DEFAULT '',
    medium          TEXT    NOT NULL DEFAULT 'radio',
    msg_time        TEXT    NOT NULL,
    triage          TEXT    NOT NULL DEFAULT 'PENDING',
    priority        TEXT    NOT NULL DEFAULT 'NORMAL',
    division_ids    TEXT    NOT NULL DEFAULT '[]',
    author_sub      TEXT,
    last_editor_sub TEXT,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE (incident_id, number),
    CHECK (json_valid(division_ids) AND json_type(division_ids) = 'array')
) STRICT;

CREATE INDEX readmodel_message_incident_id_msg_time_idx
    ON readmodel_message (incident_id, msg_time DESC, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel_layer_features
-- geojson is TEXT (not BLOB/JSONB): whole-doc read/write in Go, inspectable
-- via sqlite3 CLI, and json_valid catch encoder bugs at write time.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel_layer_features (
    id          TEXT    NOT NULL PRIMARY KEY,
    incident_id TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    geojson     TEXT    NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}',
    revision    INTEGER NOT NULL DEFAULT 0,
    removed     INTEGER NOT NULL DEFAULT 0,
    CHECK (json_valid(geojson))
) STRICT;

CREATE INDEX readmodel_layer_features_incident_id_idx
    ON readmodel_layer_features (incident_id) WHERE removed = 0;

-- +goose Down
DROP TABLE IF EXISTS readmodel_layer_features;
DROP TABLE IF EXISTS readmodel_message;
DROP TABLE IF EXISTS readmodel_incident_division;
DROP TABLE IF EXISTS readmodel_incident;
