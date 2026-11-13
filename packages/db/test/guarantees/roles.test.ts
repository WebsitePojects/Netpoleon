import { describe, expect, it } from 'vitest';
import { RoleBootstrapper } from '../../src/migrate/bootstrap-roles.js';
import {
  bootstrapperFor,
  createScratchDatabase,
  getTestDb,
  passwordOf,
  sqlState,
  withClient,
  withRoleBootstrapLock,
} from '../helpers.js';

const INSUFFICIENT_PRIVILEGE = '42501';

describe('database roles', () => {
  it.each(['wms_migrator', 'wms_staff', 'wms_partner'])(
    '%s can log in but is no superuser and cannot bypass row-level security',
    async (role) => {
      const { rows } = await withClient(getTestDb().superuserUrl, (admin) =>
        admin.query<Record<string, boolean>>(
          `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
             FROM pg_roles WHERE rolname = $1`,
          [role],
        ),
      );

      expect(rows[0]).toEqual({
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      });
    },
  );

  it.each(['staffUrl', 'partnerUrl'] as const)(
    '%s sessions start with statement, lock and idle-transaction limits',
    async (key) => {
      const limits = await withClient(getTestDb()[key], async (client) => {
        const { rows } = await client.query<{ name: string; setting: string }>(
          `SELECT name, setting FROM pg_settings
          WHERE name IN ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout')`,
        );
        return Object.fromEntries(rows.map((row) => [row.name, row.setting]));
      });

      // pg_settings reports these in milliseconds.
      expect(limits).toEqual({
        statement_timeout: '5000',
        lock_timeout: '3000',
        idle_in_transaction_session_timeout: '15000',
      });
    },
  );

  it('keeps the migrator free of those limits, since a migration may run long', async () => {
    const setting = await withClient(getTestDb().migratorUrl, async (client) => {
      const { rows } = await client.query<{ setting: string }>(
        "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
      );
      return rows[0]?.setting;
    });

    expect(setting).toBe('0');
  });

  it.each(['staffUrl', 'partnerUrl'] as const)(
    'the %s role cannot create objects in the schema or temporary tables',
    async (key) => {
      await withClient(getTestDb()[key], async (client) => {
        expect(await sqlState(() => client.query('CREATE TABLE public.intruder (id int)'))).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
        expect(await sqlState(() => client.query('CREATE TEMP TABLE intruder (id int)'))).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      });
    },
  );

  it('can be run again on a bootstrapped database without error', async () => {
    const scratch = await createScratchDatabase();
    const name = new URL(scratch.superuserUrl).pathname.slice(1);

    const rerun = withRoleBootstrapLock(() => bootstrapperFor(scratch.superuserUrl, name).run());

    await expect(rerun).resolves.toBeUndefined();
  });

  it('refuses a short password and never echoes it', async () => {
    const db = getTestDb();
    const attempt = new RoleBootstrapper({
      superuserUrl: db.superuserUrl,
      database: 'wms',
      passwords: {
        migrator: 'short-secret',
        staff: passwordOf(db.staffUrl),
        partner: 'x'.repeat(32),
      },
    }).run();

    const error = await attempt.then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('migrator');
    expect((error as Error).message).not.toContain('short-secret');
  });
});
