-- +goose Up
-- +goose StatementBegin

-- Drop legacy Hasura tables from the public schema. These were the original
-- Hasura-managed tables, superseded by the event-sourced readmodel schema.
-- public.goose_db_version and public.users are intentionally preserved.
DROP TABLE IF EXISTS public.message_division;
DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.journals;
DROP TABLE IF EXISTS public.features;
DROP TABLE IF EXISTS public.layers;
DROP TABLE IF EXISTS public.divisions;
DROP TABLE IF EXISTS public.incidents;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.medium;
DROP TABLE IF EXISTS public.priority_status;
DROP TABLE IF EXISTS public.triage_status;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restoration of these tables is not supported — data was migrated to the
-- event-sourced model and these tables were empty at drop time.
-- Re-run the original Hasura baseline migration to recreate the schema if needed.

-- +goose StatementEnd
