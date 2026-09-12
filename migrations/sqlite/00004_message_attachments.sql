-- +goose Up

-- Attachment read-model only. The blobstore (raw bytes) uses the filesystem
-- adapter for SQLite deployments; no blobstore table is created here.
CREATE TABLE readmodel_message_attachment (
    id           TEXT    NOT NULL PRIMARY KEY,
    message_id   TEXT    NOT NULL,
    incident_id  TEXT    NOT NULL,
    filename     TEXT    NOT NULL,
    content_type TEXT    NOT NULL,
    size         INTEGER NOT NULL,
    checksum     TEXT    NOT NULL,
    storage_key  TEXT    NOT NULL,
    uploader_sub TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL
) STRICT;

CREATE INDEX readmodel_message_attachment_message_id_idx
    ON readmodel_message_attachment (message_id);
CREATE INDEX readmodel_message_attachment_incident_id_idx
    ON readmodel_message_attachment (incident_id);

-- +goose Down
DROP TABLE IF EXISTS readmodel_message_attachment;
