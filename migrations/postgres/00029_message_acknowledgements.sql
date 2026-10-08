-- +goose Up
-- +goose StatementBegin
-- Divisions that have dealt with the message: [{"divisionId": uuid, "at": rfc3339, "by": text}].
ALTER TABLE readmodel.message
  ADD COLUMN acknowledgements jsonb NOT NULL DEFAULT '[]';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE readmodel.message
  DROP COLUMN IF EXISTS acknowledgements;
-- +goose StatementEnd
