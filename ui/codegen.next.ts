/**
 * graphql-codegen config for the FUTURE gqlgen schema.
 *
 * Pointed at api/schema.graphql — the shared SDL contract.
 * Run: yarn codegen:next
 *
 * Purpose: validate that GraphQL documents written for the future gqlgen schema
 * are compatible with api/schema.graphql WHILE Hasura is still serving
 * production. Any document the Go server cannot answer fails at codegen time,
 * not at runtime after cutover.
 *
 * Documents convention: name them *.next.ts alongside the current *.documents.ts.
 * The current Hasura documents use Hasura-specific vocabulary (byPk, _eq, uuid,
 * affectedRows, …) that does not exist in the future schema and must never be
 * included here. As each aggregate is ported (Phases 3–6), its future documents
 * are added as a *.next.ts file and the corresponding error count in this check
 * drops to zero — a measurable burn-down.
 *
 * Output goes to src/gql/next/ — not imported by the app yet, just validated.
 * When cutover is complete, this config becomes the primary codegen.ts.
 */

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../api/schema.graphql",
  documents: ["src/api/**/*.next.ts"],
  generates: {
    "./src/gql/next/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        useTypeImports: true,
        strictScalars: true,
        scalars: {
          DateTime: "string",
          Geometry: "GeoJSON.Geometry | null",
          JSONObject: "Record<string, unknown>",
        },
        avoidOptionals: {
          field: true,
          object: true,
          inputValue: false,
        },
        enumsAsTypes: false,
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
