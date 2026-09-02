-- +goose Up
ALTER TABLE rm_incident ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS rm_incident_deleted_at_idx ON rm_incident (deleted_at) WHERE is_deleted = true;

-- +goose Down
DROP INDEX IF EXISTS rm_incident_deleted_at_idx;
ALTER TABLE rm_incident DROP COLUMN IF EXISTS deleted_at;