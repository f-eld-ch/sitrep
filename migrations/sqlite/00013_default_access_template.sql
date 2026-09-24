-- +goose Up
ALTER TABLE readmodel_incident_access_mode ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- +goose Down
-- SQLite does not support DROP COLUMN in older versions; recreate is required.
-- For simplicity, this migration is intentionally left without a down path.
SELECT 1;
