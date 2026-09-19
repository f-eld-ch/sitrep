-- +goose Up
ALTER TABLE readmodel_message
  ADD COLUMN linked_resource_ids TEXT NOT NULL DEFAULT '[]';

-- +goose Down
-- SQLite does not support DROP COLUMN on older versions; handled by recreation in tests.
