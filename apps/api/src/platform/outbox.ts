import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';

/**
 * Side effects that must survive a crash, written in the same transaction as the change that
 * caused them and delivered by the worker (spec section 8). Payloads carry ids only: the
 * handler looks up what it needs at send time, so no address, name or token sits in the queue.
 */
export interface OutboxTopics {
  'mail.invite': { userId: string; tokenId: string };
  'mail.password_reset': { userId: string; tokenId: string };
  'mail.request_decided': { requestId: string; decision: 'approved' | 'rejected' };
  'mail.overdue_reminder': { loanId: string; dueDate: string };
}

export type OutboxTopic = keyof OutboxTopics;

export async function enqueue<K extends OutboxTopic>(
  tx: Tx,
  topic: K,
  payload: OutboxTopics[K],
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO outbox (topic, payload) VALUES (${topic}, ${JSON.stringify(payload)}::jsonb)`,
  );
}
