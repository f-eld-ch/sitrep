-- +goose Up
ALTER TABLE readmodel_resource ADD COLUMN alerted_at    TEXT;
ALTER TABLE readmodel_resource ADD COLUMN ready_at      TEXT;
ALTER TABLE readmodel_resource ADD COLUMN deployed_at   TEXT;
ALTER TABLE readmodel_resource ADD COLUMN stood_down_at TEXT;
ALTER TABLE readmodel_resource ADD COLUMN relieved_at   TEXT;

-- +goose Down
-- SQLite does not support DROP COLUMN reliably; handled by recreation in tests.
