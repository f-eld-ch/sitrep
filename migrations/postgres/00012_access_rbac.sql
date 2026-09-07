-- +goose Up
CREATE TABLE IF NOT EXISTS readmodel.incident_access (
    incident_id    uuid        NOT NULL,
    principal_kind text        NOT NULL,
    principal_id   text        NOT NULL,
    role           text        NOT NULL,
    granted_at     timestamptz NOT NULL,
    revoked_at     timestamptz,
    granted_by     text        NOT NULL,
    revoked_by     text,
    PRIMARY KEY (incident_id, principal_kind, principal_id, role)
);

CREATE TABLE IF NOT EXISTS readmodel.incident_access_mode (
    incident_id uuid NOT NULL PRIMARY KEY,
    mode        text NOT NULL
);

CREATE TABLE IF NOT EXISTS readmodel.access_group (
    id          uuid        NOT NULL PRIMARY KEY,
    name        text        NOT NULL,
    description text        NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS readmodel.access_group_member (
    group_id   uuid        NOT NULL,
    subject    text        NOT NULL,
    added_at   timestamptz NOT NULL,
    removed_at timestamptz,
    added_by   text        NOT NULL,
    removed_by text,
    PRIMARY KEY (group_id, subject)
);

CREATE TABLE IF NOT EXISTS readmodel.global_access (
    subject    text        NOT NULL,
    role       text        NOT NULL,
    granted_at timestamptz NOT NULL,
    revoked_at timestamptz,
    granted_by text        NOT NULL,
    revoked_by text,
    PRIMARY KEY (subject, role)
);

CREATE TABLE IF NOT EXISTS readmodel.access_policy (
    subject text NOT NULL,
    domain  text NOT NULL,
    object  text NOT NULL,
    action  text NOT NULL,
    PRIMARY KEY (subject, domain, object, action)
);

CREATE INDEX IF NOT EXISTS incident_access_principal_idx
    ON readmodel.incident_access (principal_kind, principal_id, incident_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS access_group_member_subject_idx
    ON readmodel.access_group_member (subject, group_id)
    WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS access_policy_subject_domain_idx
    ON readmodel.access_policy (subject, domain);
CREATE INDEX IF NOT EXISTS access_policy_domain_object_action_idx
    ON readmodel.access_policy (domain, object, action);

-- +goose Down
DROP TABLE IF EXISTS readmodel.access_policy;
DROP TABLE IF EXISTS readmodel.global_access;
DROP TABLE IF EXISTS readmodel.access_group_member;
DROP TABLE IF EXISTS readmodel.access_group;
DROP TABLE IF EXISTS readmodel.incident_access_mode;
DROP TABLE IF EXISTS readmodel.incident_access;
