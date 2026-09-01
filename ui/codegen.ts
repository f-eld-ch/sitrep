/**
 * graphql-codegen config for the gqlgen schema.
 *
 * Pointed at api/schema.graphql — the shared SDL contract.
 * Run: yarn codegen
 *
 * Output goes to src/gql/next/ and is imported by the app.
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
