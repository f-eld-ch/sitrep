/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import * as git from "git-rev-sync";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { VitePWA } from "vite-plugin-pwa";
import svgrPlugin from "vite-plugin-svgr";

const buildSha = git.long("../") || "dev";
const buildVersion = git.tag(false) || "dev";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  build: {
    sourcemap: true,
    outDir: "build",
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      treeshake: true,
      tsconfig: true,
      output: {
        cleanDir: true,
        format: "esm",
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/]react/,
              priority: 20,
            },
            {
              name: "maplibre",
              test: /node_modules[\\/]maplibre-gl/,
              priority: 19,
            },
            {
              name: "maplibre-deps",
              test: /node_modules[\\/](?:@watergis[\\/]maplibre-gl-export|@mapbox[\\/]mapbox-gl-draw|@turf)/,
              priority: 18,
            },
            {
              name: "apollo",
              test: /node_modules[\\/]@apollo/,
              priority: 18,
            },
            {
              name: "utils",
              test: /node_modules[\\/](?:@fortawesome[\\/](?:fontawesome-svg-core|free-solid-svg-icons|free-regular-svg-icons|free-brands-svg-icons|react-fontawesome)|lodash)/,
              priority: 17,
            },
            {
              name: "flipt",
              test: /node_modules[\\/](?:@flipt-io|@openfeature)/,
            },
            {
              name: "common",
              minShareCount: 2,
              minSize: 10000,
              priority: 5,
            },
          ],
        },
        minify: true,
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  define: {
    global: "window",
    // Inject VITE_VERSION and VITE_SHA_VERSION at build time so import.meta.env is reliable
    "import.meta.env.VITE_SHA_VERSION": JSON.stringify(buildSha),
    "import.meta.env.VITE_VERSION": JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    svgrPlugin(),
    analyzer({ analyzerMode: "static", enabled: false }),
    VitePWA({
      registerType: "prompt",
      strategies: "generateSW",
      injectRegister: "auto",
      workbox: {
        // ensure the SW stays in `waiting` so clients can decide when to apply
        skipWaiting: false,
        clientsClaim: false,
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
    tsconfigPaths: true,
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
