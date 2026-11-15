import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Client, escapeIdentifier } from 'pg';
import type { TestProject } from 'vitest/node';
import { RoleBootstrapper } from '../src/migrate/bootstrap-roles.js';
import { MigrationRunner } from '../src/migrate/runner.js';
import type { TestDb } from './helpers.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// Generated per run, so no password exists in the repository or in any fixture file.
const secret = () => randomBytes(24).toString('hex');

interface Server {
  /** Superuser URL of the database the run uses. */
  superuserUrl: string;
  database: string;
  stop: () => Promise<void>;
}

/** The default: one throwaway PostgreSQL container for the whole run. CI always uses this. */
async function startContainer(superuserPassword: string): Promise<Server> {
  const database = 'wms';
  const container = await new PostgreSqlContainer('postgres:18')
    .withDatabase(database)
    .withUsername('postgres')
    .withPassword(superuserPassword)
    .start();
  return {
    superuserUrl: `postgres://postgres:${superuserPassword}@${container.getHost()}:${container.getPort()}/${database}`,
    database,
    stop: async () => {
      await container.stop();
    },
  };
}

/** Serialises role setup across suites sharing one external server; returns the release. */
async function serverLock(url: string): Promise<() => Promise<void>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`SELECT pg_advisory_lock(hashtextextended('wms.test.global-setup', 0))`);
  return async () => {
    await client.end();
  };
}

async function onServer(url: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Opt-in for machines without Docker: `WMS_TEST_PG_URL` names the superuser of a DISPOSABLE
 * PostgreSQL 18 server (never a shared one: the run creates cluster-wide roles there). Each
 * run gets a fresh database, and every database the run created is dropped at the end.
 */
async function useExternalServer(serverUrl: string): Promise<Server> {
  const database = `wms_test_${randomBytes(6).toString('hex')}`;
  await onServer(serverUrl, `CREATE DATABASE ${escapeIdentifier(database)}`);
  const runUrl = new URL(serverUrl);
  runUrl.pathname = `/${database}`;
  return {
    superuserUrl: runUrl.toString(),
    database,
    stop: async () => {
      const client = new Client({ connectionString: serverUrl });
      await client.connect();
      try {
        const { rows } = await client.query<{ datname: string }>(
          `SELECT datname FROM pg_database WHERE datname = $1 OR datname LIKE 'wms\\_scratch\\_%'`,
          [database],
        );
        for (const { datname } of rows) {
          await client.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(datname)} WITH (FORCE)`);
        }
      } finally {
        await client.end();
      }
    },
  };
}

/**
 * Provides one migrated PostgreSQL with the three roles for the whole test run and hands
 * every test file the four connection URLs.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const external = process.env['WMS_TEST_PG_URL'];
  // Roles are cluster-wide. On a shared external server, the db and api suites run at the same
  // time, so they must set the same role passwords or each would lock the other out.
  const derived = (role: string) =>
    createHash('sha256')
      .update(`${external ?? ''}:${role}`)
      .digest('hex')
      .slice(0, 48);
  const passwords = external
    ? {
        superuser: '',
        migrator: derived('migrator'),
        staff: derived('staff'),
        partner: derived('partner'),
      }
    : { superuser: secret(), migrator: secret(), staff: secret(), partner: secret() };
  const server = external
    ? await useExternalServer(external)
    : await startContainer(passwords.superuser);

  const urlFor = (user: string, password: string): string => {
    const url = new URL(server.superuserUrl);
    url.username = user;
    url.password = password;
    return url.toString();
  };

  const testDb: TestDb = {
    superuserUrl: server.superuserUrl,
    migratorUrl: urlFor('wms_migrator', passwords.migrator),
    staffUrl: urlFor('wms_staff', passwords.staff),
    partnerUrl: urlFor('wms_partner', passwords.partner),
  };

  const releaseLock = external ? await serverLock(external) : () => Promise.resolve();
  try {
    await new RoleBootstrapper({
      superuserUrl: testDb.superuserUrl,
      database: server.database,
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
    // the container or the database.
    await server.stop();
    throw error;
  } finally {
    await releaseLock();
  }

  project.provide('testDb', testDb);
  return server.stop;
}
