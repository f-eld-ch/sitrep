-- +goose Up
ALTER TABLE readmodel_incident_division
  ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE readmodel_layer_features
  ADD COLUMN kind TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite does not support DROP COLUMN on older versions; handled by recreation in tests.
