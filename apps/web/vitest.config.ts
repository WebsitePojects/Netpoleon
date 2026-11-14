import { defineConfig } from 'vitest/config';

// The store is plain TypeScript with no DOM, so the default node environment is enough.
export default defineConfig({
  test: { name: 'web', include: ['test/**/*.test.ts'] },
});
