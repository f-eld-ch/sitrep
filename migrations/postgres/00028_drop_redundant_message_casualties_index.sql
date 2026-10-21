-- +goose Up
-- The primary key (message_id, schadenplatz_id) already serves every lookup by message_id (checked with
-- EXPLAIN: ListMessageCasualties uses message_casualties_pkey), so this index only costs writes and space.
DROP INDEX IF EXISTS readmodel.idx_rm_message_casualties_message_id;

-- +goose Down
CREATE INDEX IF NOT EXISTS idx_rm_message_casualties_message_id ON readmodel.message_casualties(message_id);
