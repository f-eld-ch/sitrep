-- +goose Up
-- +goose StatementBegin

-- Separate schema for blob storage so a readmodel projection Reset cannot
-- truncate attachment bytes (readmodel.Reset only TRUNCATEs readmodel.* tables).
CREATE SCHEMA IF NOT EXISTS blobstore;

-- Filesystem/Postgres blob metadata table.
-- incident_id is indexed so DeletePrefix can use an indexed equality scan
-- rather than a LIKE on the key column.
CREATE TABLE IF NOT EXISTS blobstore.blob (
    key          text        PRIMARY KEY,
    incident_id  uuid        NOT NULL,
    content_type text        NOT NULL,
    size         bigint      NOT NULL,
    data         bytea       NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Avoid compression overhead on already-compressed data (JPEG, PNG, PDF, zip).
ALTER TABLE blobstore.blob ALTER COLUMN data SET STORAGE EXTERNAL;

CREATE INDEX IF NOT EXISTS blobstore_blob_incident_id_idx ON blobstore.blob (incident_id);

-- Attachment read-model table.
-- No foreign keys: read-model tables carry none (00006 dropped them).
-- A rebuild TRUNCATE would fail if FKs referenced eventsourcing tables.
CREATE TABLE IF NOT EXISTS readmodel.message_attachment (
    id           uuid        PRIMARY KEY,
    message_id   uuid        NOT NULL,
    incident_id  uuid        NOT NULL,
    filename     text        NOT NULL,
    content_type text        NOT NULL,
    size         bigint      NOT NULL,
    checksum     text        NOT NULL,
    storage_key  text        NOT NULL,
    uploader_sub text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS readmodel_message_attachment_message_id_idx  ON readmodel.message_attachment (message_id);
CREATE INDEX IF NOT EXISTS readmodel_message_attachment_incident_id_idx ON readmodel.message_attachment (incident_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS readmodel.message_attachment;
DROP INDEX IF EXISTS readmodel_message_attachment_message_id_idx;
DROP INDEX IF EXISTS readmodel_message_attachment_incident_id_idx;

DROP TABLE IF EXISTS blobstore.blob;
DROP SCHEMA IF EXISTS blobstore;

-- +goose StatementEnd
