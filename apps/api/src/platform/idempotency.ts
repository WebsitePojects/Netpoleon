import { createHash } from 'node:crypto';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { AppError } from '../errors.js';
import type { RequestContext } from './context.js';
import { maybeOne } from './sql.js';

/** Keys are kept a day: long enough for any retry after a dropped connection. */
const KEY_TTL_MS = 24 * 3_600_000;

export interface Outcome<T> {
  status: number;
  body: T;
  /** True when this is a stored answer to an earlier identical request. */
  replayed: boolean;
}

/** Stable JSON: object keys sorted at every level, so `{a,b}` and `{b,a}` hash the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Duplicate protection for every signed-in mutation (spec section 15, rule 5a). Runs INSIDE the
 * service's transaction:
 *
 *  1. Insert the key row first. A concurrent twin blocks on the unique index until this
 *     transaction ends, then finds the committed row and replays it.
 *  2. Run the change and store its response in the same transaction, so a crash rolls back the
 *     key together with the change: there is never a key without its effect.
 *
 * Same key, different body (or route): 422, because the client is reusing a key for a new intent.
 */
export async function idempotent<T>(
  tx: Tx,
  ctx: RequestContext,
  body: unknown,
  fn: () => Promise<{ status: number; body: T }>,
  options: { store: boolean } = { store: true },
): Promise<Outcome<T>> {
  const key = ctx.idempotencyKey;
  if (!key) {
    throw new Error('idempotent() called for a request without an Idempotency-Key');
  }
  const hash = createHash('sha256')
    .update(`${ctx.route}\n${canonical(body)}`)
    .digest();
  const inserted = await maybeOne<{ id: string }>(
    tx,
    sql`INSERT INTO idempotency_keys (user_id, key, route, request_hash, expires_at)
        VALUES (${ctx.actor.userId}, ${key}, ${ctx.route}, ${hash}, ${new Date(Date.now() + KEY_TTL_MS)})
        ON CONFLICT (user_id, key) DO NOTHING
        RETURNING id`,
  );
  if (!inserted) {
    const prior = await maybeOne<{
      request_hash: Buffer;
      response_status: number | null;
      response_body: T | null;
    }>(
      tx,
      sql`SELECT request_hash, response_status, response_body FROM idempotency_keys
           WHERE user_id = ${ctx.actor.userId} AND key = ${key}`,
    );
    if (!prior || !prior.request_hash.equals(hash)) {
      throw new AppError(
        422,
        'idempotency_key_reused',
        'This Idempotency-Key was already used for a different request',
      );
    }
    if (prior.response_status === null) {
      // Committed without a stored response: the route opted out of storing (it returns a
      // secret). The original request already took effect; the client must start over.
      throw new AppError(409, 'already_processed', 'This request was already processed');
    }
    return { status: prior.response_status, body: prior.response_body as T, replayed: true };
  }

  const result = await fn();
  if (options.store) {
    await tx.execute(sql`
      UPDATE idempotency_keys
         SET response_status = ${result.status}, response_body = ${JSON.stringify(result.body)}::jsonb
       WHERE id = ${inserted.id}`);
  }
  return { ...result, replayed: false };
}
