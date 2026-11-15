import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// The browser only ever talks to /api on its own origin; Vite proxies to the local API.
// This avoids wide-open CORS while still supporting dev and preview servers.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';
const contractsSource = fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@guihua/contracts': contractsSource },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Never drift to the next free port: a different process on 5173 must not be
    // mistaken for this run's dev server.
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    // Smoke asserts the port is free first; failing here is safer than silently
    // serving on another port or attaching to someone else's service.
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
});
