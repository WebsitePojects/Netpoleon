import { Database } from '@wms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestDb, withClient } from '../../../packages/db/test/helpers.js';
import { createLogger } from '../src/logging.js';
import { SettingsService } from '../src/platform/settings.js';
import {
  backoffMinutes,
  MAX_ATTEMPTS,
  OutboxDispatcher,
  type ClaimedJob,
  type Handler,
} from '../src/worker/dispatcher.js';
import { runJob, scheduledJobs } from '../src/worker/jobs.js';
import { configFor } from './harness.js';
import { unique } from './support.js';

let db: Database;
const logger = createLogger('silent');

beforeAll(() => {
  const { staffUrl, partnerUrl } = getTestDb();
  db = new Database(configFor({ staffUrl, partnerUrl }).db, () => undefined);
});
afterAll(() => db.close());

/** Inserts an outbox row under a topic only this test uses, so parallel files never collide. */
async function enqueue(topic: string): Promise<string> {
  return withClient(getTestDb().superuserUrl, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO outbox (topic, payload) VALUES ($1, '{}') RETURNING id`,
      [topic],
    );
    return rows[0]?.id as string;
  });
}

async function rowOf(id: string) {
  return withClient(getTestDb().superuserUrl, async (client) => {
    const { rows } = await client.query<{
      status: string;
      attempts: number;
      last_error: string | null;
    }>('SELECT status, attempts, last_error FROM outbox WHERE id = $1', [id]);
    return rows[0];
  });
}

function dispatcherFor(topic: string, handler: Handler) {
  // Only this test's topic has a handler; every other row in the shared database is skipped
  // because its handler is missing — so restrict the claim to our rows by draining ours only.
  return new OutboxDispatcher(db, { [topic]: handler } as never, logger);
}

describe('outbox dispatcher', () => {
  it('delivers a row once and marks it done', async () => {
    const topic = unique('t.ok.');
    const id = await enqueue(topic);
    const seen: ClaimedJob[] = [];
    const dispatcher = dispatcherFor(topic, (job) => {
      seen.push(job);
      return Promise.resolve();
    });
    for (let pass = 0; pass < 20 && (await rowOf(id))?.status !== 'done'; pass++)
      await dispatcher.runOnce();
    expect(await rowOf(id)).toMatchObject({ status: 'done', attempts: 1 });
    expect(seen.filter((job) => job.id === id)).toHaveLength(1);
  });

  it('two dispatchers running together never deliver the same row twice', async () => {
    const topic = unique('t.race.');
    const ids = await Promise.all(Array.from({ length: 6 }, () => enqueue(topic)));
    const delivered: string[] = [];
    const handler: Handler = (job) => {
      delivered.push(job.id);
      return Promise.resolve();
    };
    const a = dispatcherFor(topic, handler);
    const b = dispatcherFor(topic, handler);
    for (let pass = 0; pass < 20; pass++) await Promise.all([a.runOnce(), b.runOnce()]);
    const ours = delivered.filter((id) => ids.includes(id));
    expect(new Set(ours).size).toBe(ids.length);
    expect(ours).toHaveLength(ids.length);
  });

  it('a failing row goes back to pending with a backoff, and is parked after the last attempt', async () => {
    const topic = unique('t.fail.');
    const id = await enqueue(topic);
    const dispatcher = dispatcherFor(topic, () => Promise.reject(new Error('smtp refused')));
    for (let pass = 0; pass < 20 && (await rowOf(id))?.attempts !== 1; pass++)
      await dispatcher.runOnce();
    expect(await rowOf(id)).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error: 'Error: smtp refused',
    });

    // Fast-forward: the row has used every attempt but one and is due now.
    await withClient(getTestDb().superuserUrl, (client) =>
      client.query(`UPDATE outbox SET attempts = $2, next_attempt_at = now() WHERE id = $1`, [
        id,
        MAX_ATTEMPTS - 1,
      ]),
    );
    for (let pass = 0; pass < 20 && (await rowOf(id))?.status !== 'failed'; pass++)
      await dispatcher.runOnce();
    expect(await rowOf(id)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('backs off exponentially and caps the wait', () => {
    expect([1, 2, 3, 4].map(backoffMinutes)).toEqual([1, 2, 4, 8]);
    expect(backoffMinutes(20)).toBe(360);
  });
});

describe('scheduled jobs', () => {
  it('two workers running one job at once execute it once', async () => {
    const job = {
      name: unique('job'),
      everyMs: 1,
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { ran: 1 };
      },
    };
    const results = await Promise.all([runJob(db, job), runJob(db, job)]);
    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it('every built-in job runs against the real schema', async () => {
    for (const job of scheduledJobs(new SettingsService(db))) {
      const result = await runJob(db, job);
      expect(result, job.name).not.toBeNull();
    }
  });
});
