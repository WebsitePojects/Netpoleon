import type { SessionUser, UpdateProfileBody } from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { iso } from '../../platform/dates.js';
import { maybeOne, one } from '../../platform/sql.js';

export interface LoginCandidate {
  id: string;
  kind: 'staff' | 'partner';
  status: 'invited' | 'active' | 'deactivated';
  passwordHash: string | null;
  locked: boolean;
}

const PROFILE_COLUMNS = sql`
  u.id, u.username::text AS username, u.full_name AS name, u.email::text AS email, u.phone, u.title,
  u.role, u.last_login_at AS "lastLoginAt"`;

type ProfileRow = Omit<SessionUser, 'lastLoginAt'> & { lastLoginAt: Date | null };

function toProfile(row: ProfileRow): SessionUser {
  return { ...row, lastLoginAt: iso(row.lastLoginAt) };
}

export class AuthRepository {
  /** By username or email; both columns are citext, so the match ignores case. */
  findForLogin(tx: Tx, identifier: string): Promise<LoginCandidate | null> {
    return maybeOne(
      tx,
      sql`SELECT id, kind, status, password_hash AS "passwordHash",
                 (locked_until IS NOT NULL AND locked_until > now()) AS locked
            FROM users
           WHERE username = ${identifier} OR email = ${identifier}
           LIMIT 1`,
    );
  }

  /** One atomic increment; the lock starts when the counter reaches the limit. */
  async recordFailure(
    tx: Tx,
    userId: string,
    lockAfter: number,
    lockMinutes: number,
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE users
         SET failed_login_count = CASE WHEN failed_login_count + 1 >= ${lockAfter} THEN 0
                                       ELSE failed_login_count + 1 END,
             locked_until = CASE WHEN failed_login_count + 1 >= ${lockAfter}
                                 THEN now() + make_interval(mins => ${lockMinutes}) ELSE locked_until END
       WHERE id = ${userId}`);
  }

  async recordSuccess(tx: Tx, userId: string): Promise<void> {
    await tx.execute(sql`
      UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
       WHERE id = ${userId}`);
  }

  async profile(tx: Tx, userId: string): Promise<SessionUser> {
    return toProfile(
      await one<ProfileRow>(tx, sql`SELECT ${PROFILE_COLUMNS} FROM users u WHERE u.id = ${userId}`),
    );
  }

  async updateProfile(tx: Tx, userId: string, patch: UpdateProfileBody): Promise<SessionUser> {
    const row = await one<ProfileRow>(
      tx,
      sql`UPDATE users u
             SET full_name = COALESCE(${patch.name ?? null}, u.full_name),
                 phone = CASE WHEN ${'phone' in patch}::boolean THEN ${patch.phone ?? null} ELSE u.phone END,
                 title = CASE WHEN ${'title' in patch}::boolean THEN ${patch.title ?? null} ELSE u.title END
           WHERE u.id = ${userId}
       RETURNING ${PROFILE_COLUMNS}`,
    );
    return toProfile(row);
  }

  async passwordHash(tx: Tx, userId: string): Promise<string | null> {
    const row = await maybeOne<{ hash: string | null }>(
      tx,
      sql`SELECT password_hash AS hash FROM users WHERE id = ${userId} FOR UPDATE`,
    );
    return row?.hash ?? null;
  }

  /** Setting a password also activates an invited user; a deactivated one stays deactivated. */
  async setPassword(tx: Tx, userId: string, hash: string): Promise<boolean> {
    const row = await maybeOne<{ id: string }>(
      tx,
      sql`UPDATE users
             SET password_hash = ${hash}, failed_login_count = 0, locked_until = NULL,
                 status = CASE WHEN status = 'invited' THEN 'active'::user_status ELSE status END
           WHERE id = ${userId} AND status <> 'deactivated'
       RETURNING id`,
    );
    return row !== null;
  }
}
