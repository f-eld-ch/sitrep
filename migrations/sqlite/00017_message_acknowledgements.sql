-- +goose Up
-- Divisions that have dealt with the message: [{"divisionId": text, "at": rfc3339, "by": text}].
ALTER TABLE readmodel_message
  ADD COLUMN acknowledgements TEXT NOT NULL DEFAULT '[]';

-- +goose Down
-- SQLite does not support DROP COLUMN on older versions; handled by recreation in tests.
