import { createHash } from 'node:crypto';
import type { ActorScope, Database, Tx } from '@wms/db';
import { schema } from '@wms/db';
import { and, eq, sql } from 'drizzle-orm';
import { AppError } from '../errors.js';

/** The response a mutation produced, exactly as it will be (re)sent to the client. */
export interface MutationResult {
  status: number;
  body: unknown;
}

export const ok = (body: unknown): MutationResult => ({ status: 200, body });
export const created = (body: unknown): MutationResult => ({ status: 201, body });

/** One user intent, identified by the client's `Idempotency-Key`. */
export interface IdempotencyRequest {
  key: string;
  /** Method and route pattern, so one key cannot be replayed against another endpoint. */
  route: string;
  /** SHA-256 of the request body, so a different body under the same key is refused. */
  requestHash: Buffer;
}

export interface MutationOutcome extends MutationResult {
  /** True when the stored response of an earlier identical request was returned. */
  replayed: boolean;
}

const KEY_TTL_HOURS = 24;

export function hashRequestBody(body: unknown): Buffer {
  return createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest();
}

/**
 * Runs a state change in one transaction, together with its idempotency key when the client
 * sent one. The key row is inserted first: a second request with the same key waits on the
 * unique index until the first commits, then finds the stored response and returns it. A
 * failure rolls back both the change and the key, so a key never exists without its effect.
 * Stored responses must never contain a secret; the pre-login endpoints do not come here.
 */
export class Mutations {
  constructor(private readonly db: Database) {}

  async run(
    scope: ActorScope,
    idempotency: IdempotencyRequest | null,
    change: (tx: Tx) => Promise<MutationResult>,
  ): Promise<MutationOutcome> {
    return this.db.transaction(scope, async (tx) => {
      if (!idempotency) return { ...(await change(tx)), replayed: false };
      if (scope.kind === 'system') {
        throw new Error('Idempotency keys belong to a user; a system scope cannot carry one.');
      }

      const claimed = await tx
        .insert(schema.idempotencyKeys)
        .values({
          userId: scope.userId,
          key: idempotency.key,
          route: idempotency.route,
          requestHash: idempotency.requestHash,
          expiresAt: sql`now() + make_interval(hours => ${KEY_TTL_HOURS})`,
        })
        .onConflictDoNothing()
        .returning({ id: schema.idempotencyKeys.id });

      const row = claimed[0];
      if (!row) return this.replay(tx, scope.userId, idempotency);

      const result = await change(tx);
      await tx
        .update(schema.idempotencyKeys)
        .set({ responseStatus: result.status, responseBody: result.body })
        .where(eq(schema.idempotencyKeys.id, row.id));
      return { ...result, replayed: false };
    });
  }

  private async replay(
    tx: Tx,
    userId: string,
    idempotency: IdempotencyRequest,
  ): Promise<MutationOutcome> {
    const [stored] = await tx
      .select({
        route: schema.idempotencyKeys.route,
        requestHash: schema.idempotencyKeys.requestHash,
        responseStatus: schema.idempotencyKeys.responseStatus,
        responseBody: schema.idempotencyKeys.responseBody,
      })
      .from(schema.idempotencyKeys)
      .where(
        and(
          eq(schema.idempotencyKeys.userId, userId),
          eq(schema.idempotencyKeys.key, idempotency.key),
        ),
      );
    if (
      !stored ||
      stored.route !== idempotency.route ||
      !stored.requestHash.equals(idempotency.requestHash)
    ) {
      throw new AppError(
        422,
        'idempotency_key_reused',
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (stored.responseStatus === null) {
      // Unreachable while the key and its response are written in one transaction; kept so
      // a future change that splits them fails loudly instead of replaying nothing.
      throw new AppError(409, 'request_in_progress', 'The original request has not finished');
    }
    return { status: stored.responseStatus, body: stored.responseBody, replayed: true };
  }
}
