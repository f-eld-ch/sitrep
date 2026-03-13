/// <reference types="vitest" />

import react from "@vitejs/plugin-react-swc";
import * as git from "git-rev-sync";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { VitePWA } from "vite-plugin-pwa";
import svgrPlugin from "vite-plugin-svgr";

process.env.VITE_SHA_VERSION = git.long("../");
process.env.VITE_VERSION = git.tag(false);

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  build: {
    sourcemap: true,
    outDir: "build",
    rolldownOptions: {
      treeshake: true,
      tsconfig: true,
      output: {
        cleanDir: true,
        format: "esm",
        codeSplitting: true,
        minify: true,
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  worker: {
    rolldownOptions: {
      output: {
        format: "iife",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  define: {
    global: "window",
  },
  plugins: [
    react({ devTarget: "es2022" }),
    svgrPlugin(),
    analyzer({ analyzerMode: "static", enabled: false }),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      injectRegister: "auto",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,pbf,json}"],
        navigateFallbackDenylist: [/^\/oauth2/, /^\/api/],
        maximumFileSizeToCacheInBytes: 3145728, // 3MB
      },
      manifest: {
        short_name: "SitRep",
        name: "SitRep - Crisis Management Tool",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        start_url: ".",
        theme_color: "#000000",
        background_color: "#ffffff",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  server: {
    // this ensures that the browser opens upon server start
    open: true,
    port: 3000,
    proxy: {
      "/v1/graphql": {
        target: "http://localhost:4180",
        changeOrigin: true,
      },
      "/oauth2": {
        target: "http://localhost:4180",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    proxy: {
      "/v1/graphql": {
        target: "http://localhost:4180",
        changeOrigin: true,
      },
      "/oauth2": {
        target: "http://localhost:4180",
        changeOrigin: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ["if-function"],
      },
    },
  },
});
