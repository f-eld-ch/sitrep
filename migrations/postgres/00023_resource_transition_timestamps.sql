-- +goose Up
ALTER TABLE readmodel.resource
  ADD COLUMN alerted_at    TIMESTAMPTZ,
  ADD COLUMN ready_at      TIMESTAMPTZ,
  ADD COLUMN deployed_at   TIMESTAMPTZ,
  ADD COLUMN stood_down_at TIMESTAMPTZ,
  ADD COLUMN relieved_at   TIMESTAMPTZ;

-- Backfill alerted_at from created_at for existing rows
UPDATE readmodel.resource SET alerted_at = created_at;

-- +goose Down
ALTER TABLE readmodel.resource
  DROP COLUMN IF EXISTS alerted_at,
  DROP COLUMN IF EXISTS ready_at,
  DROP COLUMN IF EXISTS deployed_at,
  DROP COLUMN IF EXISTS stood_down_at,
  DROP COLUMN IF EXISTS relieved_at;
