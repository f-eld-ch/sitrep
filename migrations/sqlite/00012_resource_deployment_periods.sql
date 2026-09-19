-- +goose Up
ALTER TABLE readmodel_resource ADD COLUMN deployment_history TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(deployment_history));

-- +goose Down
-- SQLite cannot drop columns portably; rebuild is handled by fresh/squashed schemas.
