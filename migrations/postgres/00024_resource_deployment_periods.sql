-- +goose Up
ALTER TABLE readmodel.resource
  ADD COLUMN deployment_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE readmodel.resource DROP COLUMN IF EXISTS deployment_history;
