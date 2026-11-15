export { Database, EXPECTED_MIGRATION_COUNT, type DatabaseOptions, type Tx } from './client.js';
export type { ActorScope } from './scope.js';
export * as schema from './schema/index.js';
export { MigrationRunner } from './migrate/runner.js';
export { RoleBootstrapper } from './migrate/bootstrap-roles.js';
