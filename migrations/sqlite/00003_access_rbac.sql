-- +goose Up

CREATE TABLE readmodel_incident_access (
    incident_id    TEXT NOT NULL,
    principal_kind TEXT NOT NULL,
    principal_id   TEXT NOT NULL,
    role           TEXT NOT NULL,
    granted_at     TEXT NOT NULL,
    revoked_at     TEXT,
    granted_by     TEXT NOT NULL,
    revoked_by     TEXT,
    PRIMARY KEY (incident_id, principal_kind, principal_id, role)
) STRICT;

CREATE INDEX readmodel_incident_access_principal_idx
    ON readmodel_incident_access (principal_kind, principal_id, incident_id)
    WHERE revoked_at IS NULL;

CREATE TABLE readmodel_incident_access_mode (
    incident_id TEXT NOT NULL PRIMARY KEY,
    mode        TEXT NOT NULL
) WITHOUT ROWID, STRICT;

CREATE TABLE readmodel_access_group (
    id          TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    archived_at TEXT
) STRICT;

CREATE TABLE readmodel_access_group_member (
    group_id   TEXT NOT NULL,
    subject    TEXT NOT NULL,
    added_at   TEXT NOT NULL,
    removed_at TEXT,
    added_by   TEXT NOT NULL,
    removed_by TEXT,
    PRIMARY KEY (group_id, subject)
) STRICT;

CREATE INDEX readmodel_access_group_member_subject_idx
    ON readmodel_access_group_member (subject, group_id)
    WHERE removed_at IS NULL;

CREATE TABLE readmodel_global_access (
    subject    TEXT NOT NULL,
    role       TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    revoked_at TEXT,
    granted_by TEXT NOT NULL,
    revoked_by TEXT,
    PRIMARY KEY (subject, role)
) STRICT;

CREATE TABLE readmodel_access_policy (
    subject TEXT NOT NULL,
    domain  TEXT NOT NULL,
    object  TEXT NOT NULL,
    action  TEXT NOT NULL,
    PRIMARY KEY (subject, domain, object, action)
) STRICT;

CREATE INDEX readmodel_access_policy_subject_domain_idx
    ON readmodel_access_policy (subject, domain);
CREATE INDEX readmodel_access_policy_domain_object_action_idx
    ON readmodel_access_policy (domain, object, action);

-- +goose Down
DROP TABLE IF EXISTS readmodel_access_policy;
DROP TABLE IF EXISTS readmodel_global_access;
DROP TABLE IF EXISTS readmodel_access_group_member;
DROP TABLE IF EXISTS readmodel_access_group;
DROP TABLE IF EXISTS readmodel_incident_access_mode;
DROP TABLE IF EXISTS readmodel_incident_access;
