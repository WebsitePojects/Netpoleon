import type {
  AuditEntry,
  CreateUserBody,
  ListUsersQuery,
  UpdateUserBody,
  User,
} from '@wms/contracts';
import type { Tx } from '@wms/db';
import { sql, type SQL } from 'drizzle-orm';
import { iso } from '../../platform/dates.js';
import { maybeOne, one, rows } from '../../platform/sql.js';
import { containsPattern } from '../units/units.repository.js';

const USER_SELECT = sql`
  SELECT u.id, u.username::text AS username, u.full_name AS name, u.email::text AS email, u.phone, u.title,
         u.role, u.status, u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt"
    FROM users u`;

type UserRow = Omit<User, 'lastLoginAt' | 'createdAt'> & {
  lastLoginAt: Date | null;
  createdAt: Date;
};

function toUser(row: UserRow): User {
  return { ...row, lastLoginAt: iso(row.lastLoginAt), createdAt: iso(row.createdAt) as string };
}

const SORTS: Record<NonNullable<ListUsersQuery['sort']>, SQL> = {
  name: sql`u.full_name`,
  username: sql`u.username`,
  role: sql`u.role`,
  lastLoginAt: sql`u.last_login_at`,
};

export interface UserState {
  id: string;
  role: User['role'];
  status: User['status'];
  kind: 'staff' | 'partner';
}

export class UsersRepository {
  async list(
    tx: Tx,
    query: ListUsersQuery,
    offset: number,
  ): Promise<{ items: User[]; total: number }> {
    const parts: SQL[] = [sql`u.kind = 'staff'`];
    if (query.q) {
      const pattern = containsPattern(query.q);
      parts.push(
        sql`(u.full_name ILIKE ${pattern} OR u.username::text ILIKE ${pattern} OR u.email::text ILIKE ${pattern})`,
      );
    }
    if (query.role) parts.push(sql`u.role IN ${query.role}`);
    if (query.status) parts.push(sql`u.status IN ${query.status}`);
    const filter = sql.join(parts, sql` AND `);
    const direction = query.order === 'desc' ? sql`DESC` : sql`ASC`;
    const order = query.sort
      ? sql`${SORTS[query.sort]} ${direction} NULLS LAST, u.id`
      : sql`u.full_name, u.id`;
    const found = await rows<UserRow>(
      tx,
      sql`${USER_SELECT} WHERE ${filter} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}`,
    );
    const { total } = await one<{ total: number }>(
      tx,
      sql`SELECT count(*)::int AS total FROM users u WHERE ${filter}`,
    );
    return { items: found.map(toUser), total };
  }

  async byId(tx: Tx, id: string): Promise<User | null> {
    const row = await maybeOne<UserRow>(tx, sql`${USER_SELECT} WHERE u.id = ${id}`);
    return row ? toUser(row) : null;
  }

  lock(tx: Tx, id: string): Promise<UserState | null> {
    return maybeOne(tx, sql`SELECT id, role, status, kind FROM users WHERE id = ${id} FOR UPDATE`);
  }

  /**
   * Locks every active admin row before an admin is demoted or deactivated, so two admins
   * demoting each other at the same moment queue up and the second sees one admin left (R7).
   */
  async lockActiveAdmins(tx: Tx): Promise<string[]> {
    const found = await rows<{ id: string }>(
      tx,
      sql`SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND kind = 'staff' ORDER BY id FOR UPDATE`,
    );
    return found.map((row) => row.id);
  }

  create(tx: Tx, body: CreateUserBody): Promise<{ id: string }> {
    return one(
      tx,
      sql`INSERT INTO users (username, email, full_name, phone, title, kind, role, status)
          VALUES (${body.username}, ${body.email}, ${body.name}, ${body.phone}, ${body.title}, 'staff',
                  ${body.role}::user_role, 'invited')
          RETURNING id`,
    );
  }

  async update(tx: Tx, id: string, patch: UpdateUserBody): Promise<void> {
    const has = (key: keyof UpdateUserBody) => sql`${key in patch}::boolean`;
    await tx.execute(sql`
      UPDATE users SET
        username = CASE WHEN ${has('username')} THEN ${patch.username ?? null} ELSE username END,
        email = CASE WHEN ${has('email')} THEN ${patch.email ?? null} ELSE email END,
        full_name = CASE WHEN ${has('name')} THEN ${patch.name ?? null} ELSE full_name END,
        phone = CASE WHEN ${has('phone')} THEN ${patch.phone ?? null} ELSE phone END,
        title = CASE WHEN ${has('title')} THEN ${patch.title ?? null} ELSE title END,
        role = CASE WHEN ${has('role')} THEN ${patch.role ?? null}::user_role ELSE role END
      WHERE id = ${id}`);
  }

  async setStatus(tx: Tx, id: string, status: 'active' | 'deactivated'): Promise<void> {
    await tx.execute(sql`UPDATE users SET status = ${status}::user_status WHERE id = ${id}`);
  }

  async audit(
    tx: Tx,
    filters: {
      actorId?: string;
      targetType?: string;
      targetId?: string;
      before?: [string, string];
    },
    limit: number,
  ): Promise<AuditEntry[]> {
    const parts: SQL[] = [sql`TRUE`];
    if (filters.actorId) parts.push(sql`l.actor_user_id = ${filters.actorId}`);
    if (filters.targetType) parts.push(sql`l.target_type = ${filters.targetType}`);
    if (filters.targetId) parts.push(sql`l.target_id = ${filters.targetId}`);
    if (filters.before) {
      parts.push(
        sql`(l.occurred_at, l.id) < (${filters.before[0]}::timestamptz, ${filters.before[1]}::uuid)`,
      );
    }
    const found = await rows<Omit<AuditEntry, 'at'> & { at: Date }>(
      tx,
      sql`SELECT l.id, l.occurred_at AS at,
                 CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.full_name,
                   'username', u.username, 'title', u.title) END AS actor,
                 l.action, l.target_type AS "targetType", l.target_id AS "targetId", l.changed_fields AS fields
            FROM audit_log l
            LEFT JOIN users u ON u.id = l.actor_user_id
           WHERE ${sql.join(parts, sql` AND `)}
           ORDER BY l.occurred_at DESC, l.id DESC
           LIMIT ${limit}`,
    );
    return found.map((row) => ({ ...row, at: iso(row.at) as string }));
  }
}
