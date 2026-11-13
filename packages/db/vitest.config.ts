import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages resolve to their TypeScript source in tests, so no build step is needed.
  // Tests run in Vite's server-side environment, which reads only ssr.resolve.conditions.
  resolve: { conditions: ['wms-source'] },
  ssr: { resolve: { conditions: ['wms-source'] } },
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Covers pulling and starting a Postgres container on a cold machine.
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
