import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages resolve to their TypeScript source in tests, so no build step is needed.
  // Tests run in Vite's server-side environment, which reads only ssr.resolve.conditions;
  // the top-level setting alone passes locally whenever a stale dist/ exists and fails in CI.
  resolve: { conditions: ['wms-source'] },
  ssr: { resolve: { conditions: ['wms-source'] } },
  test: {
    // The API tests share the throwaway Postgres that the db package provisions.
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
