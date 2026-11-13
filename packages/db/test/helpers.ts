import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, DatabaseError, escapeIdentifier } from 'pg';
import { inject } from 'vitest';
import { RoleBootstrapper } from '../src/migrate/bootstrap-roles.js';

export interface TestDb {
  superuserUrl: string;
  migratorUrl: string;
  staffUrl: string;
  partnerUrl: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDb: TestDb;
  }
}

/** The URLs global-setup provided: one throwaway PostgreSQL, migrated, with the three roles. */
export function getTestDb(): TestDb {
  return inject('testDb');
}

/**
 * Runs `fn` and returns the SQLSTATE it failed with, or null when it succeeded. Anything that
 * is not a database error (a typo, a dropped connection) is rethrown so it cannot pass for the
 * guarantee under test.
 */
export async function sqlState(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof DatabaseError && error.code) {
      return error.code;
    }
    throw error;
  }
}

export async function connect(url: string, applicationName?: string): Promise<Client> {
  const client = new Client({
    connectionString: url,
    ...(applicationName ? { application_name: applicationName } : {}),
  });
  await client.connect();
  return client;
}

export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(url);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Opens a transaction, applies `settings` the way the API's transaction wrapper does
 * (set_config with is_local = true), runs `fn`, and always rolls back. Attack tests use it so
 * a statement that fails, or one that unexpectedly succeeds, leaves nothing behind.
 */
export async function inRolledBackTransaction<T>(
  url: string,
  settings: Record<string, string>,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await connect(url);
  try {
    await client.query('BEGIN');
    for (const [name, value] of Object.entries(settings)) {
      await client.query('SELECT set_config($1, $2, true)', [name, value]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

/** Resolves once a backend with this application_name is waiting on a lock. */
export async function waitUntilBlocked(applicationName: string, timeoutMs = 5_000): Promise<void> {
  await withClient(getTestDb().superuserUrl, async (admin) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { rowCount } = await admin.query(
        "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'",
        [applicationName],
      );
      if (rowCount) {
        return;
      }
      await delay(25);
    }
    throw new Error(`No backend named ${applicationName} became blocked on a lock.`);
  });
}

export interface ScratchDatabase {
  superuserUrl: string;
  migratorUrl: string;
}

/**
 * Roles are cluster-wide, so two bootstraps at once would collide on the same catalog rows.
 * The lock lives in the base database that every test file connects to and is released when
 * the connection closes, so a crashed test cannot leave it held.
 */
export async function withRoleBootstrapLock<T>(fn: () => Promise<T>): Promise<T> {
  return withClient(getTestDb().superuserUrl, async (admin) => {
    await admin.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', ['wms.test.bootstrap']);
    return fn();
  });
}

export function bootstrapperFor(superuserUrl: string, database: string): RoleBootstrapper {
  const db = getTestDb();
  return new RoleBootstrapper({
    superuserUrl,
    database,
    passwords: {
      migrator: passwordOf(db.migratorUrl),
      staff: passwordOf(db.staffUrl),
      partner: passwordOf(db.partnerUrl),
    },
  });
}

/**
 * An empty database in the same server, with the roles' database-level fencing applied, for
 * tests that run the migrations themselves.
 */
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const db = getTestDb();
  const name = `wms_scratch_${randomBytes(6).toString('hex')}`;
  await withRoleBootstrapLock(async () => {
    await withClient(db.superuserUrl, (admin) =>
      admin.query(`CREATE DATABASE ${escapeIdentifier(name)}`),
    );
    await bootstrapperFor(withDatabase(db.superuserUrl, name), name).run();
  });
  return {
    superuserUrl: withDatabase(db.superuserUrl, name),
    migratorUrl: withDatabase(db.migratorUrl, name),
  };
}

export function withDatabase(url: string, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

export function passwordOf(url: string): string {
  return decodeURIComponent(new URL(url).password);
}
