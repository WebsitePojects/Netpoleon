import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import type { Actor } from './context.js';
import { maybeOne, rowCount } from './sql.js';

/** 32 random bytes: unguessable, and only its SHA-256 is ever stored. */
const TOKEN_BYTES = 32;

/**
 * Sliding expiry is written back only when it has gone this stale, so an active user costs
 * one indexed read per request instead of a read and a write.
 */
const IDLE_REFRESH_SLACK_MS = 5 * 60_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface SessionLimits {
  idleHours: number;
  rememberDaysStaff: number;
  rememberDaysPartner: number;
}

export interface NewSession {
  token: string;
  /** Seconds the cookie should live; null makes it a browser-session cookie. */
  cookieMaxAgeSeconds: number | null;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

interface SessionRow {
  session_id: string;
  user_id: string;
  username: string | null;
  full_name: string;
  role: Role;
  kind: 'staff' | 'partner';
  partner_org_id: string | null;
  idle_expires_at: Date;
  absolute_expires_at: Date;
}

/**
 * Opaque, revocable sessions (spec section 9). A session is valid while it is not revoked, not
 * past either expiry, and its user is still active — checked on every request, so deactivating
 * a user locks them out on their very next click.
 *
 * Without "remember me" a session slides on `idleHours` of inactivity and is capped at the
 * remember limit; with it, the session lasts the remember limit outright. Nothing outlives
 * that limit however active it is.
 */
export class SessionService {
  constructor(private readonly db: Database) {}

  async create(
    tx: Tx,
    user: { id: string; kind: 'staff' | 'partner' },
    limits: SessionLimits,
    remember: boolean,
    client: { ip: string; userAgent: string | null },
  ): Promise<NewSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = Date.now();
    const rememberDays =
      user.kind === 'staff' ? limits.rememberDaysStaff : limits.rememberDaysPartner;
    const absolute = new Date(now + rememberDays * DAY_MS);
    const idle = remember ? absolute : new Date(now + limits.idleHours * HOUR_MS);
    await tx.execute(sql`
      INSERT INTO sessions (token_hash, user_id, idle_expires_at, absolute_expires_at, ip, user_agent)
      VALUES (${hashToken(token)}, ${user.id}, ${idle}, ${absolute}, ${client.ip}::inet,
              ${client.userAgent ? client.userAgent.slice(0, 300) : null})`);
    return { token, cookieMaxAgeSeconds: remember ? rememberDays * 86_400 : null };
  }

  /** The actor for a cookie token, or null for anything unknown, expired, revoked or inactive. */
  async resolve(token: string, idleHours: number): Promise<Actor | null> {
    if (token.length < 20 || token.length > 100) {
      return null;
    }
    return this.db.transaction({ kind: 'system' }, async (tx) => {
      const row = await maybeOne<SessionRow>(
        tx,
        sql`
          SELECT s.id AS session_id, s.idle_expires_at, s.absolute_expires_at,
                 u.id AS user_id, u.username::text AS username, u.full_name, u.role, u.kind,
                 u.partner_org_id
            FROM sessions s
            JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ${hashToken(token)}
             AND s.revoked_at IS NULL
             AND s.idle_expires_at > now()
             AND s.absolute_expires_at > now()
             AND u.status = 'active'`,
      );
      if (!row) {
        return null;
      }
      const slidTo = Math.min(Date.now() + idleHours * HOUR_MS, row.absolute_expires_at.getTime());
      if (slidTo - row.idle_expires_at.getTime() > IDLE_REFRESH_SLACK_MS) {
        await tx.execute(
          sql`UPDATE sessions SET idle_expires_at = ${new Date(slidTo)} WHERE id = ${row.session_id}`,
        );
      }
      return {
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        name: row.full_name,
        role: row.role,
        kind: row.kind,
        partnerOrgId: row.partner_org_id,
      };
    });
  }

  async revoke(tx: Tx, sessionId: string): Promise<void> {
    await tx.execute(
      sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL`,
    );
  }

  /** Every live session of a user, optionally sparing one (the one changing its password). */
  async revokeAll(tx: Tx, userId: string, except: string | null = null): Promise<number> {
    return rowCount(
      tx,
      sql`UPDATE sessions SET revoked_at = now()
           WHERE user_id = ${userId} AND revoked_at IS NULL
             AND (${except}::uuid IS NULL OR id <> ${except}::uuid)`,
    );
  }
}
