import { defineConfig } from 'vitest/config';

// The store is plain TypeScript with no DOM, so the default node environment is enough.
export default defineConfig({
  resolve: { conditions: ['wms-source'] },
  ssr: { resolve: { conditions: ['wms-source'] } },
  test: { name: 'web', include: ['test/**/*.test.ts'] },
});
