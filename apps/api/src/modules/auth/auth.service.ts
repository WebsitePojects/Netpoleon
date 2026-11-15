import {
  isStaffRole,
  passwordProblem,
  type LoginBody,
  type SessionUser,
  type TokenOwner,
  type TokenPurpose,
} from '@wms/contracts';
import type { Database } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import {
  decoyHash,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../../platform/crypto.js';
import type { RateLimiter } from '../../platform/rate-limit.js';
import type { SettingsReader } from '../../platform/settings.js';
import type { ActiveSession, SessionResolver } from '../../plugins/session.js';
import type { AuthTokens } from './auth-tokens.js';
import type { AuthRepository, SessionRow } from './auth.repository.js';

const SYSTEM_SCOPE = { kind: 'system' } as const;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
// The idle expiry is moved forward at most this often, so a busy session is not a write per request.
const SLIDE_EVERY_MS = 5 * 60_000;
const MINUTE = 60_000;
const HOUR_S = 3600;
const DAY_S = 86_400;

const LIMITS = {
  loginPerIp: { max: 30, windowMs: 15 * MINUTE },
  loginPerEmail: { max: 10, windowMs: 15 * MINUTE },
  forgotPerIp: { max: 10, windowMs: 15 * MINUTE },
  forgotPerEmail: { max: 3, windowMs: 60 * MINUTE },
  linkPerIp: { max: 20, windowMs: 15 * MINUTE },
  changePerUser: { max: 10, windowMs: 15 * MINUTE },
};

/** One message for every failed sign-in, so the form never reveals which emails exist. */
const INVALID_LOGIN = new AppError(
  401,
  'invalid_credentials',
  'Email or password is incorrect. After repeated failures an account is locked for 15 minutes.',
);
const LINK_INVALID = new AppError(
  410,
  'link_invalid',
  'This link has expired or was already used. Ask for a new one.',
);

export interface LoginResult {
  token: string;
  user: SessionUser;
  /** Cookie lifetime: the remember-me length, or null for a browser-session cookie. */
  maxAgeSeconds: number | null;
}

function toSessionUser(row: {
  id: string;
  email: string;
  fullName: string;
  kind: 'staff' | 'partner';
  role: SessionUser['role'];
  partnerOrgId: string | null;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    kind: row.kind,
    role: row.role,
    partnerOrgId: row.partnerOrgId,
  };
}

/**
 * Sign-in, sessions and single-use links (foundation spec section 9). Everything here runs
 * on the staff pool under the system scope, because it happens before a scope exists.
 */
export class AuthService implements SessionResolver {
  constructor(
    private readonly db: Database,
    private readonly repository: AuthRepository,
    private readonly tokens: AuthTokens,
    private readonly settings: SettingsReader,
    private readonly audit: AuditWriter,
    private readonly limiter: RateLimiter,
  ) {}

  async login(input: LoginBody, context: RequestContext): Promise<LoginResult> {
    this.limiter.consume(`login:ip:${context.ip ?? '?'}`, LIMITS.loginPerIp);
    this.limiter.consume(`login:email:${input.email}`, LIMITS.loginPerEmail);

    const outcome = await this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const user = await this.repository.findLoginCandidate(tx, input.email);
      // Verified even when there is no user, so a missing account takes as long as a wrong password.
      const passwordOk = await verifyPassword(
        input.password,
        user?.passwordHash ?? (await decoyHash()),
      );
      const locked = user?.lockedUntil ? user.lockedUntil > new Date() : false;
      if (!user || user.status !== 'active' || !user.orgActive || locked || !passwordOk) {
        if (user && !locked && !passwordOk) {
          await this.repository.recordFailedLogin(tx, user.id, LOCK_AFTER_FAILURES, LOCK_MINUTES);
        }
        await this.audit.record(tx, context, {
          action: 'auth.login_failed',
          targetType: 'user',
          targetId: user?.id ?? null,
        });
        // Returned, not thrown, so the failure counter and the audit row commit.
        return null;
      }

      const lengths = await this.settings.numbers(tx, [
        'session.idle_hours',
        'session.remember_days_staff',
        'session.remember_days_partner',
      ]);
      const rememberSeconds =
        (isStaffRole(user.role)
          ? lengths['session.remember_days_staff']
          : lengths['session.remember_days_partner']) * DAY_S;
      const idleSeconds = input.remember ? rememberSeconds : lengths['session.idle_hours'] * HOUR_S;
      const token = randomToken();
      await this.repository.recordSuccessfulLogin(tx, user.id);
      const sessionId = await this.repository.insertSession(tx, {
        tokenHash: sha256(token),
        userId: user.id,
        idleSeconds,
        // No session outlives the remember-me length, however active it is.
        absoluteSeconds: rememberSeconds,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      await this.audit.record(
        tx,
        { ...context, actorUserId: user.id },
        {
          action: 'auth.login',
          targetType: 'session',
          targetId: sessionId,
          fields: { remember: input.remember },
        },
      );
      return {
        token,
        user: toSessionUser(user),
        maxAgeSeconds: input.remember ? rememberSeconds : null,
      };
    });
    if (!outcome) throw INVALID_LOGIN;
    return outcome;
  }

  async resolve(token: string): Promise<ActiveSession | null> {
    return this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const row = await this.repository.findLiveSession(tx, sha256(token));
      if (!row) return null;
      if (this.shouldSlide(row)) await this.repository.slideSession(tx, row.sessionId);
      return this.toActiveSession(row);
    });
  }

  async logout(token: string, context: RequestContext): Promise<void> {
    await this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const userId = await this.repository.revokeSession(tx, sha256(token));
      if (userId) {
        await this.audit.record(
          tx,
          { ...context, actorUserId: userId },
          { action: 'auth.logout', targetType: 'user', targetId: userId },
        );
      }
    });
  }

  /** Always succeeds from the caller's view: whether the address has an account is not revealed. */
  async forgotPassword(email: string, context: RequestContext): Promise<void> {
    this.limiter.consume(`forgot:ip:${context.ip ?? '?'}`, LIMITS.forgotPerIp);
    this.limiter.consume(`forgot:email:${email}`, LIMITS.forgotPerEmail);
    await this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const user = await this.repository.findActiveUserByEmail(tx, email);
      if (user) {
        await this.tokens.issue(tx, { ...context, actorUserId: user.id }, user, 'password_reset');
      }
    });
  }

  async tokenOwner(
    purpose: TokenPurpose,
    token: string,
    context: RequestContext,
  ): Promise<TokenOwner> {
    this.limiter.consume(`link:ip:${context.ip ?? '?'}`, LIMITS.linkPerIp);
    const owner = await this.db.transaction(SYSTEM_SCOPE, (tx) =>
      this.repository.findTokenOwner(tx, sha256(token), purpose),
    );
    if (!owner) throw LINK_INVALID;
    return owner;
  }

  /**
   * Accepts an invitation or completes a reset: spends the link once, sets the password and
   * signs the account out everywhere. Hashing happens before the transaction so no row lock
   * is held while argon2 runs.
   */
  async completeToken(
    purpose: TokenPurpose,
    token: string,
    password: string,
    context: RequestContext,
  ): Promise<void> {
    this.limiter.consume(`link:ip:${context.ip ?? '?'}`, LIMITS.linkPerIp);
    const problem = passwordProblem(password);
    if (problem) throw new AppError(400, 'weak_password', problem);
    const passwordHash = await hashPassword(password);

    await this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const userId = await this.repository.consumeToken(tx, sha256(token), purpose);
      if (!userId) throw LINK_INVALID;
      const user = await this.repository.userById(tx, userId);
      const expected = purpose === 'invite' ? 'invited' : 'active';
      // Throwing rolls the transaction back, which also gives the link back unspent.
      if (!user || user.status !== expected) throw LINK_INVALID;
      await this.repository.setPassword(tx, userId, passwordHash, purpose === 'invite');
      await this.repository.revokeUserSessions(tx, userId);
      await this.audit.record(
        tx,
        { ...context, actorUserId: userId },
        {
          action: purpose === 'invite' ? 'user.invite_accepted' : 'user.password_reset',
          targetType: 'user',
          targetId: userId,
          fields: { passwordHash: true, ...(purpose === 'invite' ? { status: 'active' } : {}) },
        },
      );
    });
  }

  /** Changes the signed-in user's password and signs every other session out. */
  async changePassword(
    session: ActiveSession,
    currentPassword: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    this.limiter.consume(`change:user:${session.user.id}`, LIMITS.changePerUser);
    const problem = passwordProblem(newPassword);
    if (problem) throw new AppError(400, 'weak_password', problem);
    const newHash = await hashPassword(newPassword);

    const changed = await this.db.transaction(SYSTEM_SCOPE, async (tx) => {
      const user = await this.repository.userById(tx, session.user.id);
      if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
        return false;
      }
      await this.repository.setPassword(tx, user.id, newHash, false);
      await this.repository.revokeUserSessions(tx, user.id, session.sessionId);
      await this.audit.record(tx, context, {
        action: 'user.password_changed',
        targetType: 'user',
        targetId: user.id,
        fields: { passwordHash: true },
      });
      return true;
    });
    if (!changed) {
      throw new AppError(400, 'wrong_password', 'The current password is not right');
    }
  }

  private shouldSlide(row: SessionRow): boolean {
    const fresh = Date.now() + row.idleSeconds * 1000;
    return (
      row.idleExpiresAt.getTime() < row.absoluteExpiresAt.getTime() &&
      fresh - row.idleExpiresAt.getTime() > SLIDE_EVERY_MS
    );
  }

  private toActiveSession(row: SessionRow): ActiveSession {
    const user = toSessionUser({
      id: row.userId,
      email: row.email,
      fullName: row.fullName,
      kind: row.kind,
      role: row.role,
      partnerOrgId: row.partnerOrgId,
    });
    const scope =
      row.kind === 'partner' && row.partnerOrgId
        ? { kind: 'partner' as const, userId: row.userId, partnerOrgId: row.partnerOrgId }
        : { kind: 'staff' as const, userId: row.userId };
    return { sessionId: row.sessionId, user, scope };
  }
}
