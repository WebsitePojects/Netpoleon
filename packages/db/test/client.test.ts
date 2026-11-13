import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import type { DbConfig } from '@wms/config';
import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { Database } from '../src/client.js';
import { InvalidScopeError } from '../src/scope.js';
import { categories } from '../src/schema/index.js';
import { getTestDb, sqlState } from './helpers.js';

const STATEMENT_TIMEOUT = '57014';
// Nothing listens on port 1, so connecting is refused immediately.
const CLOSED_PORT_URL = 'postgres://nobody:nothing@127.0.0.1:1/none';

const POOL_DEFAULTS = { staffPoolMax: 2, partnerPoolMax: 2, statementTimeoutMs: 5_000 };

function configFor(overrides: Partial<DbConfig> = {}): DbConfig {
  const { staffUrl, partnerUrl } = getTestDb();
  return { staffUrl, partnerUrl, ...POOL_DEFAULTS, ...overrides };
}

// Does not touch the shared test database, so these cases never wait on the container.
const unreachable = (url: string): DbConfig => ({
  staffUrl: url,
  partnerUrl: url,
  ...POOL_DEFAULTS,
});

/** Drizzle wraps driver failures; the SQLSTATE sits on the original error. */
async function stateOfQuery(fn: () => Promise<unknown>): Promise<string | null> {
  return sqlState(async () => {
    try {
      await fn();
    } catch (error) {
      throw error instanceof Error && error.cause ? error.cause : error;
    }
  });
}

describe('Database', () => {
  const opened: Database[] = [];
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  const open = (config: DbConfig, onPoolError: (err: Error) => void = () => undefined) => {
    const db = new Database(config, onPoolError);
    opened.push(db);
    return db;
  };

  afterEach(async () => {
    // Sockets first: a pool that is still connecting cannot end until its socket dies.
    sockets.splice(0).forEach((socket) => socket.destroy());
    await Promise.all(opened.splice(0).map((db) => db.close()));
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });

  const currentIdentity = (db: Database, scope: Parameters<Database['transaction']>[0]) =>
    db.transaction(scope, async (tx) => {
      const { rows } = await tx.execute<{ role: string; org: string | null; app: string }>(
        sql`SELECT current_user AS role,
                   current_setting('app.partner_org_id', true) AS org,
                   current_setting('application_name') AS app`,
      );
      return rows[0];
    });

  it('(a) runs a partner scope as wms_partner with its organisation set', async () => {
    const partnerOrgId = randomUUID();
    const identity = await currentIdentity(open(configFor()), {
      kind: 'partner',
      userId: randomUUID(),
      partnerOrgId,
    });

    expect(identity).toEqual({ role: 'wms_partner', org: partnerOrgId, app: 'wms-partner' });
  });

  it('(b) runs staff and system scopes as wms_staff with no organisation', async () => {
    const db = open(configFor());

    const staff = await currentIdentity(db, { kind: 'staff', userId: randomUUID() });
    const system = await currentIdentity(db, { kind: 'system' });

    expect(staff?.role).toBe('wms_staff');
    expect(system?.role).toBe('wms_staff');
    expect(staff?.app).toBe('wms-staff');
    expect(staff?.org ?? '').toBe('');
    expect(system?.org ?? '').toBe('');
  });

  it('(c) never leaks a scope to the next user of the same pooled connection', async () => {
    const db = open(configFor({ partnerPoolMax: 1 }));
    const pidOf = (scope: Parameters<Database['transaction']>[0]) =>
      db.transaction(scope, async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        return rows[0]?.pid;
      });
    const orgA = randomUUID();
    const orgB = randomUUID();

    const first = await currentIdentity(db, {
      kind: 'partner',
      userId: randomUUID(),
      partnerOrgId: orgA,
    });
    const pidA = await pidOf({ kind: 'partner', userId: randomUUID(), partnerOrgId: orgA });
    const second = await currentIdentity(db, {
      kind: 'partner',
      userId: randomUUID(),
      partnerOrgId: orgB,
    });
    const pidB = await pidOf({ kind: 'partner', userId: randomUUID(), partnerOrgId: orgB });

    expect(first?.org).toBe(orgA);
    expect(second?.org).toBe(orgB);
    // With a single-connection pool, equal backend pids prove the connection was reused.
    expect(pidA).toBe(pidB);

    // The test reaches into the private pool to look at the connection outside any transaction.
    const { rows } = await db['partnerPool'].query<{ org: string | null }>(
      "SELECT current_setting('app.partner_org_id', true) AS org",
    );
    expect(rows[0]?.org ?? '').toBe('');
  });

  it('(d) rolls back when the callback throws', async () => {
    const db = open(configFor());
    const code = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    let insertedId: string | undefined;

    await expect(
      db.transaction({ kind: 'system' }, async (tx) => {
        const [row] = await tx
          .insert(categories)
          .values({ name: `rollback-${code}`, code })
          .returning({ id: categories.id });
        insertedId = row?.id;
        throw new Error('abort after insert');
      }),
    ).rejects.toThrow('abort after insert');

    expect(insertedId).toBeDefined();
    const remaining = await db.transaction({ kind: 'system' }, (tx) =>
      tx.select().from(categories).where(eq(categories.code, code)),
    );
    expect(remaining).toEqual([]);
  });

  it('(e) rejects a partner scope that is not a UUID before touching the database', async () => {
    const db = open(configFor());

    await expect(
      db.transaction({ kind: 'partner', userId: randomUUID(), partnerOrgId: 'not-a-uuid' }, () =>
        Promise.resolve(),
      ),
    ).rejects.toBeInstanceOf(InvalidScopeError);
    await expect(
      db.transaction({ kind: 'staff', userId: "'; DROP TABLE users; --" }, () => Promise.resolve()),
    ).rejects.toBeInstanceOf(InvalidScopeError);

    // No connection was ever opened, so no query can have run.
    expect(db['partnerPool'].totalCount).toBe(0);
    expect(db['staffPool'].totalCount).toBe(0);
  });

  it('(f) ping answers false within its timeout against a closed port, without throwing', async () => {
    const db = open(unreachable(CLOSED_PORT_URL));

    const startedAt = Date.now();
    await expect(db.ping(500)).resolves.toBe(false);

    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it('(f) ping answers false within its timeout when the server accepts but never replies', async () => {
    const server = createServer((socket) => sockets.push(socket));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const url = `postgres://nobody:nothing@127.0.0.1:${port}/none`;
    const db = open(unreachable(url));

    const startedAt = Date.now();
    await expect(db.ping(300)).resolves.toBe(false);

    expect(Date.now() - startedAt).toBeLessThan(1_500);
  });

  it('reports the database as reachable and migrated when it is', async () => {
    const db = open(configFor());

    await expect(db.ping(2_000)).resolves.toBe(true);
    await expect(db.migrationsCurrent(10)).resolves.toBe(true);
    await expect(db.migrationsCurrent(9)).resolves.toBe(false);
    await expect(db.migrationsCurrent(11)).resolves.toBe(false);
  });

  it('migrationsCurrent returns false instead of throwing when the database is down', async () => {
    const db = open(unreachable(CLOSED_PORT_URL));

    await expect(db.migrationsCurrent(10)).resolves.toBe(false);
  });

  it('sends pool errors to the injected handler instead of crashing', () => {
    const received: Error[] = [];
    const db = open(configFor(), (err) => received.push(err));
    const error = new Error('idle connection lost');

    db['staffPool'].emit('error', error);

    expect(received).toEqual([error]);
  });

  it('(g) cancels a statement that outlives statementTimeoutMs with SQLSTATE 57014', async () => {
    const db = open(configFor({ statementTimeoutMs: 200 }));

    const state = await stateOfQuery(() =>
      db.transaction({ kind: 'system' }, (tx) => tx.execute(sql`SELECT pg_sleep(3)`)),
    );

    expect(state).toBe(STATEMENT_TIMEOUT);
  });
});
