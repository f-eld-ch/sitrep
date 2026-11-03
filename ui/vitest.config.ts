import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/setupTests.ts"],
      globals: true,
      // @uiw/react-md-editor's ESM build has a bare `import "./index.css"`, which Node cannot
      // load when the package is externalised; inline it so Vite handles the CSS.
      server: { deps: { inline: [/@uiw\/react-md-editor/, /@uiw\/react-markdown-preview/] } },
      // The first render in a file is slow when every file runs at once in its own jsdom: a test
      // that takes well under a second alone can take over five when the machine is busy.
      testTimeout: 15_000,
      reporters: process.env.GITHUB_ACTIONS ? ["github-actions", "default"] : ["verbose"],
      coverage: {
        provider: "v8",
        reporter: ["cobertura"],
        reportsDirectory: "./coverage",
      },
    },
  }),
);
