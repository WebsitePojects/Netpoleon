import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { RoleBootstrapper } from '../src/migrate/bootstrap-roles.js';
import { MigrationRunner } from '../src/migrate/runner.js';
import type { TestDb } from './helpers.js';

const DATABASE = 'wms';
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// Generated per run, so no password exists in the repository or in any fixture file.
const secret = () => randomBytes(24).toString('hex');

/**
 * Starts one throwaway PostgreSQL for the whole test run, creates the three roles, applies the
 * migrations as the migrator and hands every test file the four connection URLs.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const passwords = { superuser: secret(), migrator: secret(), staff: secret(), partner: secret() };

  const container = await new PostgreSqlContainer('postgres:18')
    .withDatabase(DATABASE)
    .withUsername('postgres')
    .withPassword(passwords.superuser)
    .start();

  const urlFor = (user: string, password: string): string =>
    `postgres://${user}:${password}@${container.getHost()}:${container.getPort()}/${DATABASE}`;

  const testDb: TestDb = {
    superuserUrl: urlFor('postgres', passwords.superuser),
    migratorUrl: urlFor('wms_migrator', passwords.migrator),
    staffUrl: urlFor('wms_staff', passwords.staff),
    partnerUrl: urlFor('wms_partner', passwords.partner),
  };

  try {
    await new RoleBootstrapper({
      superuserUrl: testDb.superuserUrl,
      database: DATABASE,
      passwords: {
        migrator: passwords.migrator,
        staff: passwords.staff,
        partner: passwords.partner,
      },
    }).run();
    await new MigrationRunner({
      connectionString: testDb.migratorUrl,
      dir: MIGRATIONS_DIR,
    }).run();
  } catch (error) {
    // Vitest only runs the teardown after a successful setup, so a failure here would leak
    // the container.
    await container.stop();
    throw error;
  }

  project.provide('testDb', testDb);
  return async () => {
    await container.stop();
  };
}
