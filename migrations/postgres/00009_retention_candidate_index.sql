-- +goose Up
CREATE INDEX IF NOT EXISTS rm_incident_closed_at_idx
    ON rm_incident (closed_at)
    WHERE is_closed = true AND is_deleted = false;

-- +goose Down
DROP INDEX IF EXISTS rm_incident_closed_at_idx;