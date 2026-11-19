import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// The API runs beside the dev server; proxying keeps the browser on one origin, exactly as in
// production where the web container forwards /api, so cookies and CSRF behave the same.
const API_TARGET = process.env.WMS_API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  // Workspace packages resolve to their TypeScript source, so no build step is needed.
  resolve: { conditions: ['wms-source', ...defaultClientConditions] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  build: {
    // One chunk per route plus a shared vendor chunk keeps first paint small and revisits instant.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
});
