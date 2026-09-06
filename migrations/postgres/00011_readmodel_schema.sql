-- +goose Up
-- Create readmodel schema and projection tables.
-- The existing public.rm_* tables are left intact for rolling upgrades
-- and will be dropped in a future migration.

CREATE SCHEMA IF NOT EXISTS readmodel;

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel.incident
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel.incident (
    id         uuid        NOT NULL,
    parent_id  uuid,
    name       text        NOT NULL,
    is_closed  boolean     NOT NULL DEFAULT false,
    is_deleted boolean     NOT NULL DEFAULT false,
    closed_at  timestamptz,
    deleted_at timestamptz,
    location   jsonb,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT incident_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX ON readmodel.incident (created_at DESC);
CREATE INDEX ON readmodel.incident (deleted_at) WHERE is_deleted = true;
CREATE INDEX ON readmodel.incident (closed_at) WHERE is_closed = true AND is_deleted = false;
CREATE INDEX ON readmodel.incident (parent_id, created_at DESC) WHERE parent_id IS NOT NULL AND is_deleted = false;

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel.incident_division
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel.incident_division (
    id          uuid NOT NULL,
    incident_id uuid NOT NULL,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    removed_at  timestamptz,
    PRIMARY KEY (id)
);

CREATE INDEX ON readmodel.incident_division (incident_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel.message
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel.message (
    id              uuid        NOT NULL,
    incident_id     uuid        NOT NULL,
    number          int         NOT NULL,
    content         text        NOT NULL DEFAULT '',
    sender          text        NOT NULL DEFAULT '',
    sender_detail   text        NOT NULL DEFAULT '',
    receiver        text        NOT NULL DEFAULT '',
    receiver_detail text        NOT NULL DEFAULT '',
    medium          text        NOT NULL DEFAULT 'radio',
    msg_time        timestamptz NOT NULL,
    triage          text        NOT NULL DEFAULT 'PENDING',
    priority        text        NOT NULL DEFAULT 'NORMAL',
    division_ids    uuid[]      NOT NULL DEFAULT '{}',
    author_sub      text,
    last_editor_sub text,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (incident_id, number)
);

CREATE INDEX ON readmodel.message (incident_id, msg_time DESC, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- readmodel.layer_features
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE readmodel.layer_features (
    id          uuid    NOT NULL,
    incident_id uuid    NOT NULL,
    name        text    NOT NULL,
    geojson     jsonb   NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}'::jsonb,
    revision    int     NOT NULL DEFAULT 0,
    removed     boolean NOT NULL DEFAULT false,
    PRIMARY KEY (id)
);

CREATE INDEX ON readmodel.layer_features (incident_id) WHERE removed = false;

-- +goose Down
DROP TABLE IF EXISTS readmodel.layer_features;
DROP TABLE IF EXISTS readmodel.message;
DROP TABLE IF EXISTS readmodel.incident_division;
DROP TABLE IF EXISTS readmodel.incident;
DROP SCHEMA IF EXISTS readmodel;
