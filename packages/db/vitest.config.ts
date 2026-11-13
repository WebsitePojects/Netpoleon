import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages resolve to their TypeScript source in tests, so no build step is needed.
  resolve: { conditions: ['wms-source'] },
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Covers pulling and starting a Postgres container on a cold machine.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});
