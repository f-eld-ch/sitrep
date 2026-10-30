-- +goose Up
-- The headline of an incident's review (how fast its messages were triaged and drawn, and how many got
-- that far), kept when it is closed, to compare incidents with each other. NULL while the incident is
-- open and until it is worked out for one that was closed before it was kept.
ALTER TABLE readmodel.incident ADD COLUMN IF NOT EXISTS review_summary jsonb;

-- +goose Down
ALTER TABLE readmodel.incident DROP COLUMN IF EXISTS review_summary;
