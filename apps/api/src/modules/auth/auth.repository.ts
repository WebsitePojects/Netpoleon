import type { TokenPurpose } from '@wms/contracts';
import { schema, type Tx } from '@wms/db';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';

const { users, sessions, authTokens, partnerOrgs } = schema;

export interface LoginCandidate {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string | null;
  kind: 'staff' | 'partner';
  role: (typeof schema.userRole.enumValues)[number];
  partnerOrgId: string | null;
  status: 'invited' | 'active' | 'deactivated';
  lockedUntil: Date | null;
  orgActive: boolean;
}

export interface SessionRow {
  sessionId: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  idleSeconds: number;
  userId: string;
  email: string;
  fullName: string;
  kind: 'staff' | 'partner';
  role: (typeof schema.userRole.enumValues)[number];
  partnerOrgId: string | null;
}

const userColumns = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  kind: users.kind,
  role: users.role,
  partnerOrgId: users.partnerOrgId,
};

/** SQL for sign-in, sessions and single-use links. Runs on the staff pool, before scope exists. */
export class AuthRepository {
  /** Locks the user row so concurrent attempts count failures one at a time. */
  async findLoginCandidate(tx: Tx, email: string): Promise<LoginCandidate | null> {
    const [row] = await tx
      .select({
        ...userColumns,
        passwordHash: users.passwordHash,
        status: users.status,
        lockedUntil: users.lockedUntil,
        orgActive: sql<boolean>`coalesce(${partnerOrgs.status} = 'active', true)`,
      })
      .from(users)
      .leftJoin(partnerOrgs, eq(partnerOrgs.id, users.partnerOrgId))
      .where(eq(users.email, email))
      .for('update', { of: users });
    return row ?? null;
  }

  /** Counts a failure; at `lockAfter` failures the account locks and the counter restarts. */
  async recordFailedLogin(
    tx: Tx,
    userId: string,
    lockAfter: number,
    lockMinutes: number,
  ): Promise<void> {
    await tx
      .update(users)
      .set({
        failedLoginCount: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${lockAfter} THEN 0 ELSE ${users.failedLoginCount} + 1 END`,
        lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${lockAfter} THEN now() + make_interval(mins => ${lockMinutes}) ELSE ${users.lockedUntil} END`,
      })
      .where(eq(users.id, userId));
  }

  async recordSuccessfulLogin(tx: Tx, userId: string): Promise<void> {
    await tx
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  async insertSession(
    tx: Tx,
    values: {
      tokenHash: Buffer;
      userId: string;
      idleSeconds: number;
      absoluteSeconds: number;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<string> {
    const [row] = await tx
      .insert(sessions)
      .values({
        tokenHash: values.tokenHash,
        userId: values.userId,
        idleSeconds: values.idleSeconds,
        idleExpiresAt: sql`now() + make_interval(secs => ${values.idleSeconds})`,
        absoluteExpiresAt: sql`now() + make_interval(secs => ${values.absoluteSeconds})`,
        ip: values.ip,
        userAgent: values.userAgent,
      })
      .returning({ id: sessions.id });
    if (!row) throw new Error('Session insert returned no row.');
    return row.id;
  }

  /** A live session of an active user whose company, if any, is not archived. */
  async findLiveSession(tx: Tx, tokenHash: Buffer): Promise<SessionRow | null> {
    const [row] = await tx
      .select({
        sessionId: sessions.id,
        idleExpiresAt: sessions.idleExpiresAt,
        absoluteExpiresAt: sessions.absoluteExpiresAt,
        idleSeconds: sessions.idleSeconds,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        kind: users.kind,
        role: users.role,
        partnerOrgId: users.partnerOrgId,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(partnerOrgs, eq(partnerOrgs.id, users.partnerOrgId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.idleExpiresAt, sql`now()`),
          gt(sessions.absoluteExpiresAt, sql`now()`),
          eq(users.status, 'active'),
          sql`(${users.partnerOrgId} IS NULL OR ${partnerOrgs.status} = 'active')`,
        ),
      );
    return row ?? null;
  }

  /** Moves the idle expiry forward, never past the absolute one. */
  async slideSession(tx: Tx, sessionId: string): Promise<void> {
    await tx
      .update(sessions)
      .set({
        idleExpiresAt: sql`least(now() + make_interval(secs => ${sessions.idleSeconds}), ${sessions.absoluteExpiresAt})`,
      })
      .where(eq(sessions.id, sessionId));
  }

  async revokeSession(tx: Tx, tokenHash: Buffer): Promise<string | null> {
    const [row] = await tx
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .returning({ userId: sessions.userId });
    return row?.userId ?? null;
  }

  /** Signs the user out everywhere, except the session given (the one changing a password). */
  async revokeUserSessions(tx: Tx, userId: string, exceptSessionId?: string): Promise<number> {
    const rows = await tx
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  async findActiveUserByEmail(
    tx: Tx,
    email: string,
  ): Promise<{ id: string; email: string; fullName: string } | null> {
    const [row] = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, 'active')));
    return row ?? null;
  }

  async userById(tx: Tx, userId: string) {
    const [row] = await tx
      .select({ ...userColumns, status: users.status, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }

  /** Spends every open link of this purpose, so only the newest one works. */
  async voidOpenTokens(tx: Tx, userId: string, purpose: TokenPurpose): Promise<void> {
    await tx
      .update(authTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
        ),
      );
  }

  async insertToken(
    tx: Tx,
    values: { tokenHash: Buffer; userId: string; purpose: TokenPurpose; ttlHours: number },
  ): Promise<void> {
    await tx.insert(authTokens).values({
      tokenHash: values.tokenHash,
      userId: values.userId,
      purpose: values.purpose,
      expiresAt: sql`now() + make_interval(hours => ${values.ttlHours})`,
    });
  }

  async findTokenOwner(
    tx: Tx,
    tokenHash: Buffer,
    purpose: TokenPurpose,
  ): Promise<{ fullName: string; email: string } | null> {
    const [row] = await tx
      .select({ fullName: users.fullName, email: users.email })
      .from(authTokens)
      .innerJoin(users, eq(users.id, authTokens.userId))
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, sql`now()`),
        ),
      );
    return row ?? null;
  }

  /**
   * Spends a link. The conditional update succeeds for exactly one caller: a second request
   * with the same token waits on the row lock, then finds it used and gets no row.
   */
  async consumeToken(tx: Tx, tokenHash: Buffer, purpose: TokenPurpose): Promise<string | null> {
    const [row] = await tx
      .update(authTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: authTokens.userId });
    return row?.userId ?? null;
  }

  async setPassword(
    tx: Tx,
    userId: string,
    passwordHash: string,
    activate: boolean,
  ): Promise<void> {
    await tx
      .update(users)
      .set({
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        ...(activate ? { status: 'active' as const } : {}),
      })
      .where(eq(users.id, userId));
  }
}
