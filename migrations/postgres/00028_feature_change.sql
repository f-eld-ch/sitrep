-- +goose Up
-- +goose StatementBegin
-- One row per feature event, keyed by the event's position in the feature stream.
-- effective_at is the time the change takes effect on the map (the connected message's
-- time); recorded_at is when it was drawn. Rebuilt by the layer_features projection.
CREATE TABLE readmodel.feature_change (
    feature_id   uuid        NOT NULL,
    version      int         NOT NULL,
    incident_id  uuid        NOT NULL,
    layer_id     uuid        NOT NULL,
    change       text        NOT NULL,
    effective_at timestamptz NOT NULL,
    recorded_at  timestamptz NOT NULL,
    message_id   uuid,
    geometry     jsonb,
    properties   jsonb,
    actor        text        NOT NULL DEFAULT '',
    PRIMARY KEY (feature_id, version)
);

CREATE INDEX ON readmodel.feature_change (incident_id, effective_at);
CREATE INDEX ON readmodel.feature_change (message_id) WHERE message_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS readmodel.feature_change;
-- +goose StatementEnd
