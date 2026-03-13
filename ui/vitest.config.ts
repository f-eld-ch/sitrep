import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/setupTests.ts"],
      globals: true,
      reporters: process.env.GITHUB_ACTIONS ? ["github-actions", "default"] : ["verbose"],
    },
  }),
);
