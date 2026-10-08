-- +goose Up
-- +goose StatementBegin
ALTER TABLE readmodel.incident_division
  ADD COLUMN kind text NOT NULL DEFAULT '';
ALTER TABLE readmodel.layer_features
  ADD COLUMN kind text NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE readmodel.layer_features
  DROP COLUMN IF EXISTS kind;
ALTER TABLE readmodel.incident_division
  DROP COLUMN IF EXISTS kind;
-- +goose StatementEnd
