-- +goose Up
-- Read-model tables are projections — FK constraints between them couple handler
-- resets and cause truncate-cascade to silently empty sibling projections whose
-- checkpoints are not reset, leaving them permanently empty. Drop the FKs; the
-- write side (event store) is the authoritative integrity boundary.
ALTER TABLE rm_incident_division DROP CONSTRAINT IF EXISTS rm_incident_division_incident_id_fkey;
ALTER TABLE rm_message            DROP CONSTRAINT IF EXISTS rm_message_incident_id_fkey;
ALTER TABLE rm_layer_features     DROP CONSTRAINT IF EXISTS rm_layer_features_incident_id_fkey;

-- +goose Down
ALTER TABLE rm_incident_division ADD CONSTRAINT rm_incident_division_incident_id_fkey
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE;
ALTER TABLE rm_message ADD CONSTRAINT rm_message_incident_id_fkey
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE;
ALTER TABLE rm_layer_features ADD CONSTRAINT rm_layer_features_incident_id_fkey
    FOREIGN KEY (incident_id) REFERENCES rm_incident (id) ON DELETE CASCADE;
