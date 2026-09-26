-- +goose Up
-- +goose StatementBegin
ALTER TABLE readmodel.message
  ADD COLUMN linked_resource_ids uuid[] NOT NULL DEFAULT '{}';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE readmodel.message
  DROP COLUMN IF EXISTS linked_resource_ids;
-- +goose StatementEnd
