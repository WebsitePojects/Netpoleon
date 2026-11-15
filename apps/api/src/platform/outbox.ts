import { schema, type Tx } from '@wms/db';

/** Every side effect the worker knows how to perform. A topic it does not know is parked. */
export type OutboxMessage =
  | {
      topic: 'email.invite';
      payload: { to: string; fullName: string; link: string; invitedBy: string | null };
    }
  | { topic: 'email.password_reset'; payload: { to: string; fullName: string; link: string } };

export type OutboxTopic = OutboxMessage['topic'];

/**
 * Queues a side effect in the caller's transaction. It is sent by the worker only if that
 * transaction commits, so a rolled-back change never emails anyone, and a crash after commit
 * still delivers.
 */
export class Outbox {
  async enqueue(tx: Tx, message: OutboxMessage): Promise<void> {
    await tx.insert(schema.outbox).values({ topic: message.topic, payload: message.payload });
  }
}
