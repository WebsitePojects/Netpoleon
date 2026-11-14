// Typed table definitions for queries only. The hand-written SQL in packages/db/migrations is
// the source of truth: it alone owns CHECK constraints, the reservations exclusion constraint,
// unique and partial indexes, triggers, grants and row-level-security policies. Do not
// "complete" these definitions to match, and never generate migrations from them; the drift
// test (test/drift.test.ts) compares columns and tables against the real database instead.
export * from './enums.js';
export * from './identity.js';
export * from './catalog.js';
export * from './lending.js';
export * from './inspection.js';
export * from './accountability.js';
export * from './plumbing.js';
export * from './views.js';
