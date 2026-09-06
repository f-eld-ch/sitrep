-- +goose Up
-- Read-model projection tables for the event-sourced backend.
-- These are maintained by the projector and queried by the GraphQL read-side.

-- ──────────────────────────────────────────────────────────────────────────────
-- rm_incident
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE rm_incident (
    id         uuid        NOT NULL,
    name       text        NOT NULL,
    is_closed  boolean     NOT NULL DEFAULT false,
    is_deleted boolean     NOT NULL DEFAULT false,
    closed_at  timestamptz,
    location   jsonb,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- rm_incident_division
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE rm_incident_division (
    id          uuid NOT NULL,
    incident_id uuid NOT NULL,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    removed_at  timestamptz,
    PRIMARY KEY (id),
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE
);
CREATE INDEX ON rm_incident (created_at DESC);
CREATE INDEX ON rm_incident_division (incident_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- rm_message
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE rm_message (
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
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE,
    UNIQUE (incident_id, number)
);
CREATE INDEX ON rm_message (incident_id, msg_time DESC, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- rm_layer_features
-- One row per layer; geojson holds the full FeatureCollection.
-- revision increments on every feature change so clients can skip re-render.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE rm_layer_features (
    id          uuid    NOT NULL,
    incident_id uuid    NOT NULL,
    name        text    NOT NULL,
    geojson     jsonb   NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}'::jsonb,
    revision    int     NOT NULL DEFAULT 0,
    removed     boolean NOT NULL DEFAULT false,
    PRIMARY KEY (id),
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE
);
CREATE INDEX ON rm_layer_features (incident_id) WHERE removed = false;

-- +goose Down
DROP TABLE IF EXISTS rm_layer_features;
DROP TABLE IF EXISTS rm_message;
DROP TABLE IF EXISTS rm_incident_division;
DROP TABLE IF EXISTS rm_incident;
