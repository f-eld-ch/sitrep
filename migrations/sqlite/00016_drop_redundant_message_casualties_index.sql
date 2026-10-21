-- +goose Up
-- The primary key (message_id, schadenplatz_id) already serves every lookup by message_id, so this index
-- only costs writes and space.
DROP INDEX IF EXISTS idx_readmodel_message_casualties_message_id;

-- +goose Down
CREATE INDEX IF NOT EXISTS idx_readmodel_message_casualties_message_id ON readmodel_message_casualties(message_id);
