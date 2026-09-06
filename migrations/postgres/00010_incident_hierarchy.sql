-- +goose Up
ALTER TABLE rm_incident
    ADD COLUMN parent_id uuid,
    ADD CONSTRAINT rm_incident_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX rm_incident_parent_id_created_at_idx
    ON rm_incident (parent_id, created_at DESC)
    WHERE parent_id IS NOT NULL AND is_deleted = false;

-- +goose Down
DROP INDEX IF EXISTS rm_incident_parent_id_created_at_idx;

ALTER TABLE rm_incident
    DROP CONSTRAINT IF EXISTS rm_incident_parent_not_self,
    DROP COLUMN IF EXISTS parent_id;