import { defineConfig } from 'vitest/config';

// Each workspace package owns its own test setup (containers, conditions); the root only
// fans out so that a single `pnpm test` covers everything.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
