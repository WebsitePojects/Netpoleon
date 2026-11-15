import type { StaffRole, User } from '@wms/contracts';
import { schema, type Tx } from '@wms/db';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

const { users } = schema;

const userColumns = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  jobTitle: users.jobTitle,
  phone: users.phone,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

type Raw = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  role: string;
  status: User['status'];
  lastLoginAt: Date | null;
  createdAt: Date;
};

function toUser(row: Raw): User {
  return {
    ...row,
    role: row.role as StaffRole,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** SQL for staff accounts. Partner accounts are managed from their company (slice 3 portal). */
export class UsersRepository {
  /** Staff are a few dozen people; the list is capped well above that and ordered by name. */
  async listStaff(tx: Tx, limit: number): Promise<User[]> {
    const rows = await tx
      .select(userColumns)
      .from(users)
      .where(eq(users.kind, 'staff'))
      .orderBy(asc(users.fullName), asc(users.id))
      .limit(limit);
    return rows.map(toUser);
  }

  async byId(tx: Tx, id: string, lock = false): Promise<(User & { hasPassword: boolean }) | null> {
    const query = tx
      .select({ ...userColumns, hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL` })
      .from(users)
      .where(and(eq(users.id, id), eq(users.kind, 'staff')));
    const [row] = lock ? await query.for('update') : await query;
    return row ? { ...toUser(row), hasPassword: row.hasPassword } : null;
  }

  async insertInvited(
    tx: Tx,
    values: {
      email: string;
      fullName: string;
      role: StaffRole;
      jobTitle: string | null;
      phone: string | null;
    },
  ): Promise<string> {
    const [row] = await tx
      .insert(users)
      .values({ ...values, kind: 'staff', status: 'invited' })
      .returning({ id: users.id });
    if (!row) throw new Error('User insert returned no row.');
    return row.id;
  }

  async update(
    tx: Tx,
    id: string,
    patch: {
      email?: string | undefined;
      fullName?: string | undefined;
      role?: StaffRole | undefined;
      jobTitle?: string | null | undefined;
      phone?: string | null | undefined;
      status?: User['status'] | undefined;
    },
  ): Promise<void> {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) return;
    await tx.update(users).set(changes).where(eq(users.id, id));
  }

  /**
   * Counts the other active administrators, locking their rows. Two people demoting the last
   * two admins at once therefore run one after the other, and the second sees no one left.
   */
  async otherActiveAdmins(tx: Tx, exceptId: string): Promise<number> {
    const rows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, exceptId)))
      .for('update');
    return rows.length;
  }

  async nameOf(tx: Tx, id: string): Promise<string | null> {
    const [row] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, id));
    return row?.fullName ?? null;
  }
}
