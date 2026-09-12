-- +goose Up
-- +goose StatementBegin

-- Drop the Hasura metadata catalog schema. Hasura has been fully removed;
-- this schema is no longer referenced by any service.
DROP SCHEMA IF EXISTS hdb_catalog CASCADE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- hdb_catalog is Hasura-managed and cannot be meaningfully restored here.
-- Re-install Hasura against this database to recreate the catalog if needed.

-- +goose StatementEnd
