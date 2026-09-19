-- +goose Up
CREATE TABLE readmodel_message_casualties (
    message_id       TEXT NOT NULL,
    schadenplatz_id  TEXT NOT NULL,
    vermisste        INTEGER NOT NULL DEFAULT 0,
    tote             INTEGER NOT NULL DEFAULT 0,
    verletzte        INTEGER NOT NULL DEFAULT 0,
    obdachlose       INTEGER NOT NULL DEFAULT 0,
    eingeschlossene  INTEGER NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (message_id, schadenplatz_id)
);
CREATE INDEX idx_readmodel_message_casualties_message_id ON readmodel_message_casualties(message_id);

-- +goose Down
DROP INDEX IF EXISTS idx_readmodel_message_casualties_message_id;
DROP TABLE IF EXISTS readmodel_message_casualties;
