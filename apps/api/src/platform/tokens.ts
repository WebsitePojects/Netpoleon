import { randomBytes } from 'node:crypto';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { hashToken } from './session.js';
import { maybeOne, one } from './sql.js';

export type TokenPurpose = 'invite' | 'password_reset';

/** An invitation is given a week; a reset link an hour, because it grants access on its own. */
export const TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = {
  invite: 7 * 86_400_000,
  password_reset: 3_600_000,
};

export interface IssuedToken {
  id: string;
  token: string;
  expiresAt: Date;
}

/**
 * Issues a single-use token, first retiring any unused one of the same purpose for the user,
 * so only the newest link works (plan R9). Only the SHA-256 is stored.
 */
export async function issueToken(
  tx: Tx,
  userId: string,
  purpose: TokenPurpose,
): Promise<IssuedToken> {
  await tx.execute(sql`
    UPDATE auth_tokens SET used_at = now()
     WHERE user_id = ${userId} AND purpose = ${purpose} AND used_at IS NULL`);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[purpose]);
  const row = await one<{ id: string }>(
    tx,
    sql`INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at)
        VALUES (${hashToken(token)}, ${userId}, ${purpose}, ${expiresAt}) RETURNING id`,
  );
  return { id: row.id, token, expiresAt };
}

/**
 * Spends a token: a conditional update that succeeds exactly once, so a double-submitted form
 * sets the password once and the second attempt finds the token used. Lookup is by hash, an
 * equality on a unique index, so no timing difference reveals how much of a guess was right.
 */
export async function consumeToken(
  tx: Tx,
  token: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const row = await maybeOne<{ user_id: string }>(
    tx,
    sql`UPDATE auth_tokens SET used_at = now()
         WHERE token_hash = ${hashToken(token)} AND purpose = ${purpose}
           AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
  );
  return row?.user_id ?? null;
}
