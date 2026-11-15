import type { Database, Tx } from '@wms/db';
import { sql } from 'drizzle-orm';

export interface Job {
  name: string;
  /** Runs inside one transaction that already holds the job's advisory lock. */
  run(tx: Tx): Promise<number>;
}

// Records are kept a week past their end so a support question about yesterday can be answered.
const KEEP_DAYS = 7;

export const CLEANUP_JOBS: Job[] = [
  {
    name: 'sessions.cleanup',
    run: async (tx) =>
      (
        await tx.execute(sql`
          DELETE FROM sessions
           WHERE absolute_expires_at < now() - make_interval(days => ${KEEP_DAYS})
              OR revoked_at < now() - make_interval(days => ${KEEP_DAYS})`)
      ).rowCount ?? 0,
  },
  {
    name: 'auth_tokens.cleanup',
    run: async (tx) =>
      (
        await tx.execute(sql`
          DELETE FROM auth_tokens
           WHERE expires_at < now() - make_interval(days => ${KEEP_DAYS})
              OR used_at < now() - make_interval(days => ${KEEP_DAYS})`)
      ).rowCount ?? 0,
  },
  {
    name: 'idempotency_keys.cleanup',
    run: async (tx) =>
      (await tx.execute(sql`DELETE FROM idempotency_keys WHERE expires_at < now()`)).rowCount ?? 0,
  },
];

/**
 * Runs a job once across every worker (foundation spec section 8). The advisory lock is
 * transaction-scoped, so it cannot outlive the job or leak onto a pooled connection, and a
 * second worker that finds it taken skips the run instead of waiting.
 */
export async function runExclusive(db: Database, job: Job): Promise<number | null> {
  return db.transaction({ kind: 'system' }, async (tx) => {
    const result = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`wms.job.${job.name}`}, 0)) AS locked`,
    );
    if (!result.rows[0]?.locked) return null;
    return job.run(tx);
  });
}

export async function beat(db: Database, workerName: string): Promise<void> {
  await db.transaction({ kind: 'system' }, (tx) =>
    tx.execute(sql`
      INSERT INTO worker_heartbeats (worker_name, beat_at) VALUES (${workerName}, now())
      ON CONFLICT (worker_name) DO UPDATE SET beat_at = now()`),
  );
}
