import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// The API in development. The web app always calls `/api` on its own origin, so in production
// the reverse proxy routes it and no cross-origin request (or CORS policy) is ever needed.
const API_TARGET = process.env['WMS_API_TARGET'] ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  // Workspace packages (@wms/contracts) resolve to their TypeScript source, as in the API.
  resolve: { conditions: ['wms-source', ...defaultClientConditions] },
  server: {
    port: Number(process.env['WMS_WEB_PORT'] ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
});
