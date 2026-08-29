/**
 * graphql-codegen config for the FUTURE gqlgen schema.
 *
 * Pointed at api/schema.graphql — the shared SDL contract.
 * Run: yarn codegen:next
 *
 * Purpose: validate that all GraphQL documents in src/api/ are compatible
 * with the future schema WHILE Hasura is still serving production. Any
 * document that the Go server cannot answer fails at codegen time, not at
 * runtime after cutover.
 *
 * Output goes to src/gql/next/ — not imported by the app yet, just validated.
 * When cutover is complete, this config becomes the primary codegen.ts.
 */

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../api/schema.graphql",
  documents: ["src/api/**/*.ts"],
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
