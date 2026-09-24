-- +goose Up
ALTER TABLE readmodel.incident_access_mode ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE readmodel.incident_access_mode DROP COLUMN IF EXISTS is_default;
