/// <reference types="vitest" />

import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import eslint from 'vite-plugin-eslint';
import svgrPlugin from 'vite-plugin-svgr';
import viteTsconfigPaths from 'vite-tsconfig-paths';


// https://vitejs.dev/config/
export default defineConfig({
    base: "/",
    build: {
        outDir: 'build',
    },
    define: {
        global: 'window'
    },
    plugins: [
        react(),
        viteTsconfigPaths(),
        svgrPlugin(),
        eslint(),
        checker({
            typescript: true
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),


        }
    },
    server: {
        // this ensures that the browser opens upon server start
        open: true,
        port: 3000,
        proxy: {
            '/v1/graphql': {
                target: "http://localhost:4180",
                changeOrigin: true,
            },
            '/oauth2': {
                target: "http://localhost:4180",
                changeOrigin: true,
            }
        }
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        globals: true
    },
    css: {
        preprocessorOptions: {
            scss: {}
        }
    }
});