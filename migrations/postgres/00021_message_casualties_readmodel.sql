-- +goose Up
-- +goose StatementBegin
CREATE TABLE readmodel.message_casualties (
    message_id       uuid        NOT NULL,
    schadenplatz_id  uuid        NOT NULL,
    vermisste        int         NOT NULL DEFAULT 0,
    tote             int         NOT NULL DEFAULT 0,
    verletzte        int         NOT NULL DEFAULT 0,
    obdachlose       int         NOT NULL DEFAULT 0,
    eingeschlossene  int         NOT NULL DEFAULT 0,
    updated_at       timestamptz NOT NULL,
    PRIMARY KEY (message_id, schadenplatz_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX idx_rm_message_casualties_message_id ON readmodel.message_casualties(message_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_rm_message_casualties_message_id;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS readmodel.message_casualties;
-- +goose StatementEnd
