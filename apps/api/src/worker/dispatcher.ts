import type { Database } from '@wms/db';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { rows } from '../platform/sql.js';
import type { OutboxTopic, OutboxTopics } from '../platform/outbox.js';

/** A claimed row is this worker's for this long; past it, another worker may take it over. */
const LEASE_SECONDS = 60;
/** After this many attempts a row is parked as `failed` for an admin to look at. */
export const MAX_ATTEMPTS = 8;
const BATCH = 10;

export interface ClaimedJob {
  id: string;
  topic: OutboxTopic;
  payload: OutboxTopics[OutboxTopic];
  attempts: number;
}

export type Handler = (job: ClaimedJob) => Promise<void>;

/** Minutes to wait before attempt n+1: 1, 2, 4, 8 … capped at 6 hours. */
export function backoffMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(0, attempts - 1), 360);
}

/**
 * Delivers queued side effects (spec section 8). Rows are claimed with FOR UPDATE SKIP LOCKED
 * under a lease, so two workers never take the same row and a crashed worker's rows come back
 * when the lease runs out. Each claim is its own short transaction; the handler runs outside
 * any transaction, and the outcome is written back conditionally on the lease still being ours.
 */
export class OutboxDispatcher {
  constructor(
    private readonly db: Database,
    private readonly handlers: Readonly<Record<OutboxTopic, Handler>>,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /** Processes one batch; resolves to how many rows it handled. */
  async runOnce(): Promise<number> {
    const claimed = await this.db.transaction({ kind: 'system' }, (tx) =>
      rows<ClaimedJob>(
        tx,
        sql`UPDATE outbox o
               SET status = 'processing', attempts = o.attempts + 1,
                   locked_until = now() + make_interval(secs => ${LEASE_SECONDS})
             WHERE o.id IN (
               SELECT id FROM outbox
                WHERE (status = 'pending' AND next_attempt_at <= now())
                   OR (status = 'processing' AND locked_until < now())
                ORDER BY next_attempt_at
                LIMIT ${BATCH}
                FOR UPDATE SKIP LOCKED)
          RETURNING o.id, o.topic, o.payload, o.attempts`,
      ),
    );
    for (const job of claimed) {
      await this.process(job);
    }
    return claimed.length;
  }

  private async process(job: ClaimedJob): Promise<void> {
    try {
      const handler = this.handlers[job.topic];
      // An unknown topic fails closed: it is retried and then parked, never silently dropped.
      if (!handler) throw new Error(`No handler for topic ${String(job.topic)}`);
      await handler(job);
      await this.finish(job, sql`status = 'done', locked_until = NULL, last_error = NULL`);
    } catch (error) {
      // Only the error's class and a short message are kept: a provider error can echo an address.
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : 'Unknown error';
      const parked = job.attempts >= MAX_ATTEMPTS;
      this.logger.warn(
        { outboxId: job.id, topic: job.topic, attempts: job.attempts, parked },
        'outbox job failed',
      );
      await this.finish(
        job,
        parked
          ? sql`status = 'failed', locked_until = NULL, last_error = ${reason}`
          : sql`status = 'pending', locked_until = NULL, last_error = ${reason},
                next_attempt_at = now() + make_interval(mins => ${backoffMinutes(job.attempts)})`,
      );
    }
  }

  private async finish(job: ClaimedJob, set: ReturnType<typeof sql>): Promise<void> {
    await this.db.transaction({ kind: 'system' }, (tx) =>
      tx.execute(
        sql`UPDATE outbox SET ${set} WHERE id = ${job.id} AND status = 'processing' AND attempts = ${job.attempts}`,
      ),
    );
  }
}
