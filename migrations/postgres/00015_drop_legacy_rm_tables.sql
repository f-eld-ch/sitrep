-- +goose Up
-- +goose StatementBegin

-- Drop legacy read model tables from public schema. All services now project
-- into the readmodel schema (introduced in 00011_readmodel_schema.sql).
DROP TABLE IF EXISTS public.rm_layer_features;
DROP TABLE IF EXISTS public.rm_message;
DROP TABLE IF EXISTS public.rm_incident_division;
DROP TABLE IF EXISTS public.rm_incident;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restore legacy read model tables (empty — data was projected into readmodel schema).
CREATE TABLE IF NOT EXISTS public.rm_incident (LIKE readmodel.incident INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.rm_incident_division (LIKE readmodel.incident_division INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.rm_message (LIKE readmodel.message INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.rm_layer_features (LIKE readmodel.layer_features INCLUDING ALL);

-- +goose StatementEnd
