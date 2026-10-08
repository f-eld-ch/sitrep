-- +goose Up
-- One row per feature event, keyed by the event's position in the feature stream.
-- effective_at is the time the change takes effect on the map (the connected message's
-- time); recorded_at is when it was drawn. Timestamps use the fixed-width TimeLayout so
-- text ordering is chronological. Rebuilt by the layer_features projection.
CREATE TABLE readmodel_feature_change (
    feature_id   TEXT NOT NULL,
    version      INTEGER NOT NULL,
    incident_id  TEXT NOT NULL,
    layer_id     TEXT NOT NULL,
    change       TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    recorded_at  TEXT NOT NULL,
    message_id   TEXT,
    geometry     TEXT,
    properties   TEXT,
    actor        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (feature_id, version)
) STRICT;

CREATE INDEX readmodel_feature_change_incident_idx
    ON readmodel_feature_change (incident_id, effective_at);
CREATE INDEX readmodel_feature_change_message_idx
    ON readmodel_feature_change (message_id) WHERE message_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS readmodel_feature_change;
