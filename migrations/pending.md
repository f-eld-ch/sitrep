# Pending Migration Cleanup Tasks

This document tracks schema cleanup tasks to be executed in future migrations after rolling deployments and deprecation phases are complete.

## 1. Drop Legacy Read Model Tables (`public.rm_*`)

Once all services and nodes have been fully updated to query and project into the `readmodel` schema (`00011_readmodel_schema.sql`), drop the legacy read model tables from `public`:

- `public.rm_incident`
- `public.rm_incident_division`
- `public.rm_message`
- `public.rm_layer_features`

## 2. Drop Legacy Hasura Tables in `public`

Drop the legacy Hasura tables in the `public` schema that are no longer used:

- `public.divisions`
- `public.features`
- `public.incidents`
- `public.journals`
- `public.layers`
- `public.locations`
- `public.medium`
- `public.message_division`
- `public.messages`
- `public.priority_status`
- `public.triage_status`

*Note: Do NOT drop `public.goose_db_version` (goose migration tracker) or `public.users` (active user repository).*

## 3. Drop Hasura Schema (`hdb_catalog`)

Drop the Hasura-specific metadata catalog schema:

- `DROP SCHEMA IF EXISTS hdb_catalog CASCADE;`
