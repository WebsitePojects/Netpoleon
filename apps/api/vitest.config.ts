import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages resolve to their TypeScript source in tests, so no build step is needed.
  resolve: { conditions: ['wms-source'] },
  test: {
    // The API tests share the throwaway Postgres that the db package provisions.
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    passWithNoTests: true,
  },
});
