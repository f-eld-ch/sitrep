import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import react from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    ...tseslint.configs.strict,
    prettierConfig,
  ),
  {
    files: ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"],
    ignores: ["**/*.config.js", "!**/eslint.config.js"],

    plugins: {
      react,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
      },

      ecmaVersion: 12,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    rules: {},
  },
];
