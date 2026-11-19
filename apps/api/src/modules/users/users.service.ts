import {
  can,
  FIXED_SETTINGS,
  type AccessLink,
  type AuditEntry,
  type CreateUserBody,
  type ListAuditQuery,
  type ListUsersQuery,
  type Settings,
  type SettingsResponse,
  type UpdateSettingsBody,
  type UpdateUserBody,
  type User,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { offsetOf } from '../../platform/http.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import { enqueue } from '../../platform/outbox.js';
import type { SessionService } from '../../platform/session.js';
import type { SettingsService } from '../../platform/settings.js';
import { issueToken } from '../../platform/tokens.js';
import type { UsersRepository, UserState } from './users.repository.js';

const notFound = () => new AppError(404, 'user_not_found', 'No user has that id');

/** Where the console opens the two kinds of link (web routes). */
const LINK_PATH = { invite: '/accept-invite/', password_reset: '/reset-password/' } as const;

export class UsersService {
  constructor(
    private readonly db: Database,
    private readonly repo: UsersRepository,
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly audit: AuditWriter,
    private readonly appOrigin: string,
  ) {}

  async list(ctx: RequestContext, query: ListUsersQuery) {
    const { items, total } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.list(tx, query, offsetOf(query.page, query.pageSize)),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** The person is created invited; the invitation mail is queued in the same transaction. */
  create(ctx: RequestContext, body: CreateUserBody): Promise<Outcome<User>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const created = await this.repo.create(tx, body);
        const token = await issueToken(tx, created.id, 'invite');
        await enqueue(tx, 'mail.invite', { userId: created.id, tokenId: token.id });
        await this.audit.record(tx, ctx, {
          action: 'user.create',
          targetType: 'user',
          targetId: created.id,
          fields: { label: body.username, role: body.role, title: body.title, email: true },
        });
        return { status: 201, body: await this.reload(tx, created.id) };
      }),
    );
  }

  update(ctx: RequestContext, id: string, body: UpdateUserBody): Promise<Outcome<User>> {
    return this.change(ctx, id, body, async (tx, user) => {
      if (body.role !== undefined && body.role !== user.role) {
        if (id === ctx.actor.userId) {
          throw new AppError(409, 'own_role', 'You cannot change your own role');
        }
        if (user.role === 'admin') await this.assertAnotherAdmin(tx, id);
      }
      await this.repo.update(tx, id, body);
      // A role change takes effect on the next request; revoking makes it take effect now.
      if (body.role !== undefined && body.role !== user.role) await this.sessions.revokeAll(tx, id);
      await this.audit.record(tx, ctx, {
        action: 'user.update',
        targetType: 'user',
        targetId: id,
        fields: body,
      });
    });
  }

  /** Revokes every session in the same transaction: deactivation takes effect on the next click. */
  setActive(ctx: RequestContext, id: string, active: boolean): Promise<Outcome<User>> {
    return this.change(ctx, id, { active }, async (tx, user) => {
      if (!active) {
        if (id === ctx.actor.userId)
          throw new AppError(409, 'own_account', 'You cannot deactivate your own account');
        if (user.status === 'deactivated') return;
        if (user.role === 'admin') await this.assertAnotherAdmin(tx, id);
        await this.repo.setStatus(tx, id, 'deactivated');
        await this.sessions.revokeAll(tx, id);
      } else {
        if (user.status !== 'deactivated') return;
        await this.repo.setStatus(tx, id, 'active');
      }
      await this.audit.record(tx, ctx, {
        action: active ? 'user.reactivate' : 'user.deactivate',
        targetType: 'user',
        targetId: id,
        fields: { status: active ? 'active' : 'deactivated' },
      });
    });
  }

  /**
   * A one-time link for the admin to hand over (plan R9). It grants access by itself, so it is
   * never stored in the idempotency record, never logged, and answered `no-store`.
   */
  accessLink(ctx: RequestContext, id: string): Promise<Outcome<AccessLink>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(
        tx,
        ctx,
        { id },
        async () => {
          const user = await this.repo.lock(tx, id);
          if (!user || user.kind !== 'staff') throw notFound();
          if (user.status === 'deactivated') {
            throw new AppError(409, 'deactivated', 'Reactivate the account before sending a link');
          }
          const purpose = user.status === 'invited' ? 'invite' : 'password_reset';
          const issued = await issueToken(tx, id, purpose);
          await this.audit.record(tx, ctx, {
            action: 'user.access_link',
            targetType: 'user',
            targetId: id,
            fields: { kind: purpose },
          });
          return {
            status: 200,
            body: {
              url: `${this.appOrigin}${LINK_PATH[purpose]}${issued.token}`,
              purpose,
              expiresAt: issued.expiresAt.toISOString(),
            },
          };
        },
        { store: false },
      ),
    );
  }

  /** `actor=me` is anyone's own activity; anything wider needs `audit.read`. */
  async auditTrail(ctx: RequestContext, query: ListAuditQuery) {
    const own = query.actor === 'me';
    if (!own && !can(ctx.actor.role, 'audit.read')) {
      throw new AppError(403, 'forbidden', 'You do not have permission to do that');
    }
    let before: [string, string] | undefined;
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (!decoded) throw new AppError(400, 'invalid_cursor', 'The page cursor is not valid');
      before = decoded;
    }
    const found = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.audit(
        tx,
        {
          ...(own ? { actorId: ctx.actor.userId } : query.actor ? { actorId: query.actor } : {}),
          ...(query.targetType ? { targetType: query.targetType } : {}),
          ...(query.targetId ? { targetId: query.targetId } : {}),
          ...(before ? { before } : {}),
        },
        query.limit + 1,
      ),
    );
    const items = found.slice(0, query.limit);
    const last = items[items.length - 1];
    return { items, nextCursor: found.length > query.limit && last ? encodeCursor(last) : null };
  }

  async getSettings(): Promise<SettingsResponse> {
    return { ...(await this.settings.get()), ...FIXED_SETTINGS };
  }

  updateSettings(
    ctx: RequestContext,
    body: UpdateSettingsBody,
  ): Promise<Outcome<SettingsResponse>> {
    return this.db
      .transaction(ctx.scope, (tx) =>
        idempotent(tx, ctx, body, async () => {
          const current = await this.settings.get();
          const merged: Settings = { ...current };
          for (const key of Object.keys(body) as (keyof Settings)[]) {
            const value = body[key];
            if (value !== undefined) (merged as Record<keyof Settings, unknown>)[key] = value;
          }
          if (merged.defaultLoanDays > merged.maxLoanDays) {
            throw new AppError(
              422,
              'default_exceeds_max',
              'The default loan length cannot exceed the maximum',
            );
          }
          const changed = await this.settings.update(tx, body, ctx.actor.userId);
          await this.audit.record(tx, ctx, {
            action: 'settings.update',
            targetType: 'settings',
            targetId: null,
            fields: { settings: body, changed },
          });
          return { status: 200, body: { ...merged, ...FIXED_SETTINGS } };
        }),
      )
      .finally(() => this.settings.invalidate());
  }

  private async assertAnotherAdmin(tx: Tx, leavingId: string): Promise<void> {
    const admins = await this.repo.lockActiveAdmins(tx);
    if (admins.filter((id) => id !== leavingId).length === 0) {
      throw new AppError(409, 'last_admin', 'At least one active administrator must remain');
    }
  }

  private change(
    ctx: RequestContext,
    id: string,
    body: unknown,
    apply: (tx: Tx, user: UserState) => Promise<void>,
  ): Promise<Outcome<User>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { id, body }, async () => {
        const user = await this.repo.lock(tx, id);
        if (!user || user.kind !== 'staff') throw notFound();
        await apply(tx, user);
        return { status: 200, body: await this.reload(tx, id) };
      }),
    );
  }

  private async reload(tx: Tx, id: string): Promise<User> {
    const user = await this.repo.byId(tx, id);
    if (!user) throw notFound();
    return user;
  }
}

function encodeCursor(entry: AuditEntry): string {
  return Buffer.from(JSON.stringify([entry.at, entry.id])).toString('base64url');
}

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      !Number.isNaN(Date.parse(value[0])) &&
      typeof value[1] === 'string' &&
      /^[0-9a-f-]{36}$/i.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // A malformed cursor is reported by the caller.
  }
  return null;
}
