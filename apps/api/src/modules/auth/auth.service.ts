import {
  FIXED_SETTINGS,
  permissionsFor,
  type Bootstrap,
  type ChangePasswordBody,
  type LoginBody,
  type SessionUser,
  type SetPasswordWithTokenBody,
  type UpdateProfileBody,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditOrigin, AuditWriter } from '../../platform/audit.js';
import type { Actor, RequestContext } from '../../platform/context.js';
import { manilaToday } from '../../platform/dates.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import { enqueue } from '../../platform/outbox.js';
import { hashPassword, verifyAgainstNothing, verifyPassword } from '../../platform/password.js';
import type { NewSession, SessionService } from '../../platform/session.js';
import type { SettingsService } from '../../platform/settings.js';
import { consumeToken, issueToken, type TokenPurpose } from '../../platform/tokens.js';
import type { CatalogRepository } from '../catalog/catalog.repository.js';
import type { AuthRepository } from './auth.repository.js';

/** How long an account stays locked after too many failed sign-ins. */
const LOCK_MINUTES = 15;

const WRONG_CREDENTIALS = () =>
  new AppError(401, 'invalid_credentials', 'Wrong username or password');

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
  requestId: string;
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly repo: AuthRepository,
    private readonly catalog: CatalogRepository,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * One error and roughly one duration for every failure — unknown name, wrong password,
   * locked, invited, deactivated, partner account — so the form cannot be used to learn
   * which accounts exist (spec section 9). The argon2 check runs outside any transaction so
   * a burst of sign-ins does not hold database connections while hashing.
   */
  async login(
    body: LoginBody,
    client: ClientInfo,
  ): Promise<{ bootstrap: Bootstrap; session: NewSession }> {
    const settings = await this.settings.get();
    const candidate = await this.db.transaction({ kind: 'system' }, (tx) =>
      this.repo.findForLogin(tx, body.identifier),
    );
    const usable =
      candidate !== null &&
      candidate.kind === 'staff' &&
      candidate.status === 'active' &&
      !candidate.locked &&
      candidate.passwordHash !== null;
    const matches = usable
      ? await verifyPassword(candidate.passwordHash as string, body.password)
      : await verifyAgainstNothing(body.password);

    if (!matches || !candidate) {
      if (usable && candidate) {
        await this.db.transaction({ kind: 'system' }, (tx) =>
          this.repo.recordFailure(tx, candidate.id, settings.lockAfterFailedAttempts, LOCK_MINUTES),
        );
      }
      throw WRONG_CREDENTIALS();
    }

    const limits = await this.settings.sessionLimits();
    return this.db.transaction({ kind: 'system' }, async (tx) => {
      await this.repo.recordSuccess(tx, candidate.id);
      const session = await this.sessions.create(tx, candidate, limits, body.remember, client);
      const profile = await this.repo.profile(tx, candidate.id);
      await this.audit.record(tx, origin(candidate.id, client), {
        action: 'auth.login',
        targetType: 'user',
        targetId: candidate.id,
      });
      return { bootstrap: await this.bootstrapIn(tx, profile), session };
    });
  }

  async logout(actor: Actor | null): Promise<void> {
    if (!actor) return;
    await this.db.transaction({ kind: 'system' }, (tx) =>
      this.sessions.revoke(tx, actor.sessionId),
    );
  }

  bootstrap(ctx: RequestContext): Promise<Bootstrap> {
    return this.db.transaction(ctx.scope, async (tx) =>
      this.bootstrapIn(tx, await this.repo.profile(tx, ctx.actor.userId)),
    );
  }

  updateProfile(ctx: RequestContext, body: UpdateProfileBody): Promise<Outcome<SessionUser>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const profile = await this.repo.updateProfile(tx, ctx.actor.userId, body);
        await this.audit.record(tx, ctx, {
          action: 'profile.update',
          targetType: 'user',
          targetId: ctx.actor.userId,
          fields: body,
        });
        return { status: 200, body: profile };
      }),
    );
  }

  /** Revokes every other session: whoever might have the old password is signed out now. */
  async changePassword(
    ctx: RequestContext,
    body: ChangePasswordBody,
  ): Promise<Outcome<{ ok: true }>> {
    const newHash = await hashPassword(body.newPassword);
    return this.db.transaction(ctx.scope, (tx) =>
      // The hashed body must never contain a password: the request hash is a fast digest.
      idempotent(tx, ctx, { intent: 'change-password' }, async () => {
        const current = await this.repo.passwordHash(tx, ctx.actor.userId);
        if (!current || !(await verifyPassword(current, body.currentPassword))) {
          throw new AppError(422, 'wrong_password', 'The current password is not correct');
        }
        if (await verifyPassword(current, body.newPassword)) {
          throw new AppError(422, 'same_password', 'Choose a password you have not used here');
        }
        await this.repo.setPassword(tx, ctx.actor.userId, newHash);
        await this.sessions.revokeAll(tx, ctx.actor.userId, ctx.actor.sessionId);
        await this.audit.record(tx, ctx, {
          action: 'auth.password_change',
          targetType: 'user',
          targetId: ctx.actor.userId,
          fields: { password: true },
        });
        return { status: 200, body: { ok: true as const } };
      }),
    );
  }

  /** Queues a reset mail when the account exists and is active; silent otherwise. */
  async forgotPassword(identifier: string, client: ClientInfo): Promise<void> {
    await this.db.transaction({ kind: 'system' }, async (tx) => {
      const candidate = await this.repo.findForLogin(tx, identifier);
      if (!candidate || candidate.status !== 'active' || candidate.kind !== 'staff') return;
      const issued = await issueToken(tx, candidate.id, 'password_reset');
      await enqueue(tx, 'mail.password_reset', { userId: candidate.id, tokenId: issued.id });
      await this.audit.record(tx, origin(null, client), {
        action: 'auth.password_reset_requested',
        targetType: 'user',
        targetId: candidate.id,
      });
    });
  }

  /** Invitation acceptance and password reset: the token is spent once, then sessions revoked. */
  async setPasswordWithToken(
    purpose: TokenPurpose,
    body: SetPasswordWithTokenBody,
    client: ClientInfo,
  ): Promise<void> {
    const hash = await hashPassword(body.password);
    await this.db.transaction({ kind: 'system' }, async (tx) => {
      const userId = await consumeToken(tx, body.token, purpose);
      if (!userId || !(await this.repo.setPassword(tx, userId, hash))) {
        throw new AppError(400, 'invalid_token', 'This link is invalid or has expired');
      }
      await this.sessions.revokeAll(tx, userId);
      await this.audit.record(tx, origin(userId, client), {
        action: purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset',
        targetType: 'user',
        targetId: userId,
        fields: { password: true },
      });
    });
  }

  private async bootstrapIn(tx: Tx, user: SessionUser): Promise<Bootstrap> {
    // One transaction is one connection, which runs one query at a time: awaiting in turn is
    // as fast, and pg 9 rejects overlapping queries on a client.
    const settings = await this.settings.get();
    const categories = await this.catalog.listCategories(tx);
    const locations = await this.catalog.listLocations(tx);
    const models = await this.catalog.listModels(tx);
    return {
      user,
      permissions: permissionsFor(user.role),
      settings: { ...settings, ...FIXED_SETTINGS },
      categories,
      locations,
      models,
      serverDate: manilaToday(),
    };
  }
}

function origin(userId: string | null, client: ClientInfo): AuditOrigin {
  return { userId, requestId: client.requestId, ip: client.ip };
}
