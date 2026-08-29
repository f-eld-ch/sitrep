/**
 * Introspects the running local Hasura instance (as role "editor") and writes
 * the SDL snapshot to hasura/schema/hasura.graphql.
 *
 * This file is NOT used by CI — it's a developer tool for refreshing the
 * committed snapshot when the Hasura schema changes.
 *
 * Prerequisites: Hasura must be running locally (docker compose up hasura).
 * The HASURA_GRAPHQL_ADMIN_SECRET env var must be set, or set it inline:
 *
 *   HASURA_GRAPHQL_ADMIN_SECRET=myadminsecretkey yarn codegen:schema
 *
 * Introspect as "editor" (not admin) so the snapshot only contains fields
 * that runtime documents can actually use.
 */

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: {
    "http://localhost:8080/v1/graphql": {
      headers: {
        "x-hasura-admin-secret": process.env["HASURA_GRAPHQL_ADMIN_SECRET"] ?? "",
        "x-hasura-role": "editor",
      },
    },
  },
  generates: {
    "../hasura/schema/hasura.graphql": {
      plugins: ["schema-ast"],
      config: {
        includeDirectives: false,
        sort: true,
      },
    },
  },
};

export default config;
