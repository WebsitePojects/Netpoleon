import { randomBytes } from 'node:crypto';
import { schema } from '@wms/db';
import { eq, inArray, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getTestDb, withClient } from '../../../packages/db/test/helpers.js';
import { createLogger } from '../src/logging.js';
import { redactFields } from '../src/platform/audit.js';
import { created, Mutations } from '../src/platform/mutations.js';
import { idempotencyOf, requireSession, requireSignedIn } from '../src/plugins/session.js';
import { backoffSeconds, MAX_ATTEMPTS, OutboxDispatcher } from '../src/worker/dispatcher.js';
import { runExclusive, type Job } from '../src/worker/jobs.js';
import type { Email, Mailer } from '../src/worker/mailer.js';
import { createUser, login, openDb, send } from './fixtures.js';
import { TestApps } from './harness.js';

const apps = new TestApps();
const db = openDb();
afterEach(() => apps.closeAll());
afterAll(() => db.close());

const urls = () => {
  const { staffUrl, partnerUrl } = getTestDb();
  return { staffUrl, partnerUrl };
};

/** Two to four random capital letters: a category code nobody else in the run uses. */
const code = () =>
  Array.from(randomBytes(4), (byte) => String.fromCharCode(65 + (byte % 26))).join('');

/** An app with one real mutation behind the idempotency layer: creating a category. */
async function appWithProbe() {
  return apps.create({
    urls: urls(),
    registerRoutes: (app, appDb) => {
      const mutations = new Mutations(appDb);
      app.withTypeProvider<ZodTypeProvider>().post(
        '/api/v1/probe/categories',
        {
          preHandler: requireSignedIn,
          schema: { body: z.strictObject({ name: z.string(), code: z.string() }) },
        },
        async (request, reply) => {
          const outcome = await mutations.run(
            requireSession(request).scope,
            idempotencyOf(request),
            async (tx) => {
              const [row] = await tx
                .insert(schema.categories)
                .values(request.body)
                .returning({ id: schema.categories.id, code: schema.categories.code });
              return created(row);
            },
          );
          if (outcome.replayed) reply.header('idempotent-replayed', 'true');
          return reply.status(outcome.status).send(outcome.body);
        },
      );
    },
  });
}

async function categoriesWithCode(categoryCode: string): Promise<number> {
  const rows = await db.transaction({ kind: 'system' }, (tx) =>
    tx.select().from(schema.categories).where(eq(schema.categories.code, categoryCode)),
  );
  return rows.length;
}

describe('idempotency keys', () => {
  it('requires a key on a mutating request', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, await createUser(db));
    const response = await send(app, 'POST', '/api/v1/probe/categories', {
      cookie,
      body: { name: `No key ${code()}`, code: code() },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'idempotency_key_required' });
  });

  it('replays the stored response for a sequential repeat, with one effect', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, await createUser(db));
    const body = { name: `Repeat ${code()}`, code: code() };
    const headers = { 'idempotency-key': `intent-${randomBytes(6).toString('hex')}` };

    const first = await send(app, 'POST', '/api/v1/probe/categories', { cookie, body, headers });
    const second = await send(app, 'POST', '/api/v1/probe/categories', { cookie, body, headers });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(await categoriesWithCode(body.code)).toBe(1);
  });

  it('has one effect when two identical requests arrive together', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, await createUser(db));
    const body = { name: `Concurrent ${code()}`, code: code() };
    const headers = { 'idempotency-key': `intent-${randomBytes(6).toString('hex')}` };

    const results = await Promise.all([
      send(app, 'POST', '/api/v1/probe/categories', { cookie, body, headers }),
      send(app, 'POST', '/api/v1/probe/categories', { cookie, body, headers }),
    ]);

    expect(results.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(results[0]?.json()).toEqual(results[1]?.json());
    expect(await categoriesWithCode(body.code)).toBe(1);
  });

  it('refuses the same key with a different body', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, await createUser(db));
    const headers = { 'idempotency-key': `intent-${randomBytes(6).toString('hex')}` };
    const firstCode = code();

    await send(app, 'POST', '/api/v1/probe/categories', {
      cookie,
      headers,
      body: { name: `First ${firstCode}`, code: firstCode },
    });
    const reused = await send(app, 'POST', '/api/v1/probe/categories', {
      cookie,
      headers,
      body: { name: `Other ${code()}`, code: code() },
    });

    expect(reused.statusCode).toBe(422);
    expect(reused.json()).toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('keeps no key when the change fails, so a corrected retry can reuse it', async () => {
    const { app } = await appWithProbe();
    const cookie = await login(app, await createUser(db));
    const headers = { 'idempotency-key': `intent-${randomBytes(6).toString('hex')}` };

    // An invalid code violates the table's CHECK and rolls the transaction back.
    const failed = await send(app, 'POST', '/api/v1/probe/categories', {
      cookie,
      headers,
      body: { name: `Bad ${code()}`, code: 'lowercase' },
    });
    expect(failed.statusCode).toBe(500);

    const retried = await send(app, 'POST', '/api/v1/probe/categories', {
      cookie,
      headers,
      body: { name: `Good ${code()}`, code: code() },
    });
    expect(retried.statusCode).toBe(201);
  });
});

describe('audit redaction', () => {
  it('keeps values only for listed fields and names everything else', () => {
    expect(redactFields('user', { role: 'manager', email: 'a@b.c', phone: '0917' })).toEqual({
      role: 'manager',
      email: '[changed]',
      phone: '[changed]',
    });
    expect(redactFields('unknown_thing', { role: 'x' })).toEqual({ role: '[changed]' });
  });
});

class FakeMailer implements Mailer {
  readonly sent: { email: Email; key: string }[] = [];
  failWith: Error | null = null;
  async send(email: Email, key: string): Promise<void> {
    await Promise.resolve();
    if (this.failWith) throw this.failWith;
    this.sent.push({ email, key });
  }
}

async function queue(count: number, topic = 'email.password_reset'): Promise<string[]> {
  const marker = randomBytes(4).toString('hex');
  const rows = await db.transaction({ kind: 'system' }, (tx) =>
    tx
      .insert(schema.outbox)
      .values(
        Array.from({ length: count }, (_, index) => ({
          topic,
          payload: {
            to: `person-${marker}-${index}@wms.test`,
            fullName: 'Test Person',
            link: `http://localhost:5173/reset-password/${marker}${index}`,
          },
        })),
      )
      .returning({ id: schema.outbox.id }),
  );
  return rows.map((row) => row.id);
}

async function outboxRows(ids: string[]) {
  return db.transaction({ kind: 'system' }, (tx) =>
    tx
      .select({
        id: schema.outbox.id,
        status: schema.outbox.status,
        attempts: schema.outbox.attempts,
        payload: schema.outbox.payload,
        due: sql<boolean>`${schema.outbox.nextAttemptAt} > now()`,
      })
      .from(schema.outbox)
      .where(inArray(schema.outbox.id, ids)),
  );
}

/** Other test files queue emails too; drain everything due so each test starts clean. */
async function drain() {
  const mailer = new FakeMailer();
  const dispatcher = new OutboxDispatcher(db, mailer, createLogger('silent'));
  while ((await dispatcher.runOnce(100)) > 0);
}

describe('outbox dispatcher', () => {
  it('sends each due row once and removes the link when done', async () => {
    await drain();
    const ids = await queue(3);
    const mailer = new FakeMailer();
    const dispatcher = new OutboxDispatcher(db, mailer, createLogger('silent'));

    await dispatcher.runOnce(10);

    const mine = mailer.sent.filter((entry) => ids.includes(entry.key));
    expect(mine).toHaveLength(3);
    expect(mine[0]?.email.subject).toBe('Reset your Netpoleon WMS password');
    for (const row of await outboxRows(ids)) {
      expect(row.status).toBe('done');
      expect(row.payload).not.toHaveProperty('link');
    }
  });

  it('never hands one row to two workers running at once', async () => {
    await drain();
    const ids = await queue(20);
    const mailer = new FakeMailer();
    const workers = [1, 2, 3].map(() => new OutboxDispatcher(db, mailer, createLogger('silent')));

    await Promise.all(workers.map((worker) => worker.runOnce(20)));

    const keys = mailer.sent.map((entry) => entry.key).filter((key) => ids.includes(key));
    expect(keys).toHaveLength(20);
    expect(new Set(keys).size).toBe(20);
  });

  it('retries a failure later and parks the row after the last attempt', async () => {
    await drain();
    const [id] = await queue(1);
    if (!id) throw new Error('queue returned no id');
    const mailer = new FakeMailer();
    mailer.failWith = new Error('provider down');
    const dispatcher = new OutboxDispatcher(db, mailer, createLogger('silent'));

    await dispatcher.runOnce();
    let [row] = await outboxRows([id]);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, due: true });

    // Jump to the last attempt, made due now.
    await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.outbox)
        .set({ attempts: MAX_ATTEMPTS - 1, nextAttemptAt: sql`now()` })
        .where(eq(schema.outbox.id, id)),
    );
    await dispatcher.runOnce();
    [row] = await outboxRows([id]);
    expect(row).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(row?.payload).not.toHaveProperty('link');
  });

  it('parks a row whose topic it does not know', async () => {
    await drain();
    const [id] = await queue(1, 'email.mystery');
    if (!id) throw new Error('queue returned no id');
    await new OutboxDispatcher(db, new FakeMailer(), createLogger('silent')).runOnce();
    const [row] = await outboxRows([id]);
    expect(row?.status).toBe('failed');
  });

  it('backs off exponentially and stops at one hour', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
    expect(backoffSeconds(20)).toBe(3600);
  });
});

describe('scheduled jobs', () => {
  it('skips a run while another worker holds the job', async () => {
    let ran = 0;
    const job: Job = {
      name: `probe-${randomBytes(3).toString('hex')}`,
      run: () => {
        ran += 1;
        return Promise.resolve(1);
      },
    };
    await withClient(getTestDb().superuserUrl, async (other) => {
      await other.query('BEGIN');
      await other.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `wms.job.${job.name}`,
      ]);
      expect(await runExclusive(db, job)).toBeNull();
      await other.query('COMMIT');
    });
    expect(await runExclusive(db, job)).toBe(1);
    expect(ran).toBe(1);
  });
});
