/// <reference types="vitest" />

import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { analyzer } from "vite-bundle-analyzer";
import biomePlugin from "vite-plugin-biome";
import { VitePWA } from "vite-plugin-pwa";
import svgrPlugin from "vite-plugin-svgr";
import viteTsconfigPaths from "vite-tsconfig-paths";

// https://vitejs.dev/config/
export default defineConfig({
	base: "/",
	build: {
		outDir: "build",
		sourcemap: true,
		minify: "esbuild",
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
			treeshake: {
				preset: "recommended",
			},
			output: {
				minifyInternalExports: true,
				manualChunks: {
					maplibregl: [
						"maplibre-gl",
					],
					maplibreDeps: [
						"@watergis/maplibre-gl-export",
						"@mapbox/mapbox-gl-draw",
					],
					apollo: ["@apollo/client"],
					utils: [
						"@fortawesome/fontawesome-svg-core",
						"@fortawesome/free-solid-svg-icons",
						"@fortawesome/free-regular-svg-icons",
						"@fortawesome/free-brands-svg-icons",
						"@fortawesome/react-fontawesome",
						"lodash",
					],
					flipt: [
						"@flipt-io/flipt-client-browser",
					]
				},
				assetFileNames: "assets/[name]-[hash][extname]",
				chunkFileNames: "assets/[name]-[hash].js",
				entryFileNames: "assets/[name]-[hash].js",
			},
		},
	},
	define: {
		global: "window",
	},
	plugins: [
		react({ devTarget: "es2022" }),
		viteTsconfigPaths(),
		svgrPlugin(),
		biomePlugin(),
		analyzer({ analyzerMode: "static", enabled: false}),
		VitePWA({
			registerType: "autoUpdate",
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
			"@": path.resolve(__dirname, "./src"),
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
	test: {
		environment: "jsdom",
		setupFiles: ["./src/setupTests.ts"],
		globals: true,
	},
	css: {
		preprocessorOptions: {
			scss: {},
		},
	},
});
