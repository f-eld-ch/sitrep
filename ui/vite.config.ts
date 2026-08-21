/// <reference types="vitest" />

import { babsSprites } from "@f-eld-ch/babs-sprites/vite";
import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import * as git from "git-rev-sync";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import { VitePWA } from "vite-plugin-pwa";
import svgrPlugin from "vite-plugin-svgr";

const buildSha = process.env.VITE_SHA_VERSION || git.long("../") || "dev";

/**
 * `git describe` output, e.g. `v26.8.0` on a tag or `v26.8.0-64-g136b9bf0` past one.
 *
 * The same command the Ko Build step runs, deliberately: the backend serves its version on
 * /version and the update prompt shows it, so any difference in scheme would have the app
 * displaying two different version strings at once.
 *
 * git-rev-sync has no equivalent — its `tag()` passes --abbrev=0 (nearest tag, no count)
 * and its `count()` is total commits, not commits since the tag — so this shells out.
 * Falls back to the nearest tag when git or the tags are unavailable, e.g. a build from a
 * shallow clone or an exported tree.
 */
function describeVersion(): string {
  try {
    return execSync("git describe --tags --always", {
      cwd: "..",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const buildVersion = process.env.VITE_VERSION || describeVersion() || git.tag(false) || "dev";

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
              // The inline-SVG icon definitions, reached only through the dynamic import
              // in useBabsIcons. MUST stay in a chunk of its own: grouping it with the
              // eagerly-imported babs-core/babs-sprites below drags several MB of SVG
              // into the initial load, because a chunk is only as lazy as its most
              // eagerly-referenced module. The stable name also lets the service worker
              // exclude it from precaching (see workbox.globIgnores).
              // Matches ONLY the icon definitions (dist/all.js and dist/icons/*), not
              // babs-react's 4 kB main entry, which is imported eagerly for BabsIcon and
              // registerBabsIcons. Including the entry here merges the eager and lazy
              // graphs and makes the whole chunk eager again.
              name: "babs-catalogue",
              test: /node_modules[\\/]@f-eld-ch[\\/]babs-react[\\/]dist[\\/](?:all\.js|icons\.js|icons[\\/])/,
              priority: 18,
            },
            {
              // Small, eagerly imported: catalogue metadata and the sprite helpers.
              name: "babs-icons",
              test: /node_modules[\\/]@f-eld-ch[\\/]babs-(?:core|sprites)/,
              priority: 17,
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
    // `globalThis`, not `window`: this define is injected into Vite's dev client, which
    // also runs inside web workers. maplibre spawns six of them (setWorkerCount(6)), and
    // each threw an uncaught "window is not defined" on startup. In the main thread
    // globalThis *is* window, so nothing changes there.
    global: "globalThis",
    // Inject VITE_VERSION and VITE_SHA_VERSION at build time so import.meta.env is reliable
    "import.meta.env.VITE_SHA_VERSION": JSON.stringify(buildSha),
    "import.meta.env.VITE_VERSION": JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    svgrPlugin(),
    // Serves the BABS sprite atlases from node_modules in dev, and emits them at build
    // with exact unhashed filenames. Defaults to "map/sprites", which is where the
    // existing basemap/imagery sheets already live, so those are unaffected.
    babsSprites(),
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
        // The BABS atlases vary by UI language, so precaching them would pin whichever
        // language happened to be built and serve it stale after a switch. Deliberately
        // scoped to `babs-*` rather than all of map/sprites: basemap/imagery are
        // language-invariant and are precached today for offline use.
        globIgnores: [
          "map/sprites/babs-*",
          // The icon catalogue is several MB of inline SVG, fetched on demand when the
          // picker first opens. Precaching it would put that cost on every install, and
          // it exceeds maximumFileSizeToCacheInBytes anyway, which fails the build.
          "assets/babs-catalogue-*.js",
        ],
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
      // Served by the Go backend, and read by the update prompt to name the version it is
      // offering. Proxied so `yarn start` behaves like production instead of silently
      // exercising the fallback path.
      "/version": {
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
      // Served by the Go backend, and read by the update prompt to name the version it is
      // offering. Proxied so `yarn start` behaves like production instead of silently
      // exercising the fallback path.
      "/version": {
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
