import type { Database } from '@wms/db';
import { schema } from '@wms/db';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { OutboxMessage, OutboxTopic } from '../platform/outbox.js';
import { renderEmail } from './emails.js';
import type { Mailer } from './mailer.js';

const KNOWN_TOPICS: ReadonlySet<string> = new Set<OutboxTopic>([
  'email.invite',
  'email.password_reset',
]);
export const MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 120;
const MAX_ERROR_LENGTH = 300;

type Claimed = {
  id: string;
  topic: string;
  payload: unknown;
  attempts: number;
};

/** Seconds to wait before the next try: 30 s, 1 min, 2 min … capped at one hour. */
export function backoffSeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

/**
 * Delivers queued side effects (foundation spec section 8). Rows are claimed with
 * FOR UPDATE SKIP LOCKED under a lease, so two workers never take the same row and a worker
 * that dies leaves a lease that expires and is picked up again. Failures retry with backoff
 * up to MAX_ATTEMPTS, then park as `failed`. Once a row is finished its link is removed from
 * the payload, so a sent or abandoned token does not sit in the database.
 */
export class OutboxDispatcher {
  constructor(
    private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /** Claims and processes up to `batch` due rows; returns how many it processed. */
  async runOnce(batch = 10): Promise<number> {
    const claimed = await this.claim(batch);
    for (const row of claimed) await this.process(row);
    return claimed.length;
  }

  private async claim(batch: number): Promise<Claimed[]> {
    return this.db.transaction({ kind: 'system' }, async (tx) => {
      const result = await tx.execute<Claimed>(sql`
        UPDATE outbox
           SET status = 'processing',
               attempts = attempts + 1,
               locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
         WHERE id IN (
           SELECT id FROM outbox
            WHERE (status = 'pending' AND next_attempt_at <= now())
               OR (status = 'processing' AND locked_until < now())
            ORDER BY next_attempt_at
            LIMIT ${batch}
            FOR UPDATE SKIP LOCKED
         )
        RETURNING id, topic, payload, attempts`);
      return result.rows;
    });
  }

  private async process(row: Claimed): Promise<void> {
    if (!KNOWN_TOPICS.has(row.topic)) {
      await this.finish(row, 'failed', `Unknown topic ${row.topic}`);
      return;
    }
    try {
      await this.mailer.send(
        renderEmail({ topic: row.topic, payload: row.payload } as OutboxMessage),
        row.id,
      );
      await this.finish(row, 'done', null);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(
        0,
        MAX_ERROR_LENGTH,
      );
      if (row.attempts >= MAX_ATTEMPTS) {
        this.logger.error({ outboxId: row.id, topic: row.topic }, 'outbox row parked as failed');
        await this.finish(row, 'failed', message);
      } else {
        this.logger.warn(
          { outboxId: row.id, topic: row.topic, attempts: row.attempts },
          'outbox delivery failed; will retry',
        );
        await this.retryLater(row, message);
      }
    }
  }

  /** Ends the row. Only a row this worker still holds is changed. */
  private async finish(
    row: Claimed,
    status: 'done' | 'failed',
    error: string | null,
  ): Promise<void> {
    await this.db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.outbox)
        .set({
          status,
          lockedUntil: null,
          lastError: error,
          payload: sql`${schema.outbox.payload} - 'link'`,
        })
        .where(and(eq(schema.outbox.id, row.id), eq(schema.outbox.status, 'processing'))),
    );
  }

  private async retryLater(row: Claimed, error: string): Promise<void> {
    await this.db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.outbox)
        .set({
          status: 'pending',
          lockedUntil: null,
          lastError: error,
          nextAttemptAt: sql`now() + make_interval(secs => ${backoffSeconds(row.attempts)})`,
        })
        .where(and(eq(schema.outbox.id, row.id), eq(schema.outbox.status, 'processing'))),
    );
  }
}
