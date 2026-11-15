import type { EditUserBody, InviteUserBody, User } from '@wms/contracts';
import type { ActorScope, Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import { databaseError, UNIQUE_VIOLATION } from '../../platform/db-errors.js';
import {
  created,
  ok,
  type IdempotencyRequest,
  type MutationOutcome,
  type Mutations,
} from '../../platform/mutations.js';
import type { AuthTokens } from '../auth/auth-tokens.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import type { UsersRepository } from './users.repository.js';

const LIST_LIMIT = 500;
const NOT_FOUND = new AppError(404, 'user_not_found', 'That person does not exist');

function emailTaken(error: unknown): never {
  const failure = databaseError(error);
  if (failure?.code === UNIQUE_VIOLATION && failure.constraint === 'users_email_key') {
    throw new AppError(409, 'email_taken', 'Someone already has an account with that email');
  }
  throw error;
}

function actorOf(scope: ActorScope): string {
  if (scope.kind === 'system') throw new Error('A user change needs a person as the actor.');
  return scope.userId;
}

/**
 * Staff accounts (foundation spec sections 5 and 15). People are invited, never given a
 * password; turning someone off revokes their sessions in the same transaction; there is
 * always at least one active administrator.
 */
export class UsersService {
  constructor(
    private readonly db: Database,
    private readonly mutations: Mutations,
    private readonly repository: UsersRepository,
    private readonly auth: AuthRepository,
    private readonly tokens: AuthTokens,
    private readonly audit: AuditWriter,
  ) {}

  list(scope: ActorScope): Promise<User[]> {
    return this.db.transaction(scope, (tx) => this.repository.listStaff(tx, LIST_LIMIT));
  }

  invite(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: InviteUserBody,
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const id = await this.repository.insertInvited(tx, input);
        await this.tokens.issue(
          tx,
          context,
          { id, email: input.email, fullName: input.fullName },
          'invite',
          await this.repository.nameOf(tx, actorOf(scope)),
        );
        await this.audit.record(tx, context, {
          action: 'user.created',
          targetType: 'user',
          targetId: id,
          fields: { role: input.role, email: input.email, fullName: input.fullName },
        });
        return created(await this.view(tx, id));
      })
      .catch(emailTaken);
  }

  edit(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    patch: EditUserBody,
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const user = await this.repository.byId(tx, id, true);
        if (!user) throw NOT_FOUND;
        if (user.role === 'admin' && patch.role && patch.role !== 'admin') {
          await this.keepOneAdmin(tx, id);
        }
        await this.repository.update(tx, id, patch);
        await this.audit.record(tx, context, {
          action: 'user.updated',
          targetType: 'user',
          targetId: id,
          fields: patch,
        });
        return ok(await this.view(tx, id));
      })
      .catch(emailTaken);
  }

  setActive(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    active: boolean,
  ): Promise<MutationOutcome> {
    const actor = actorOf(scope);
    return this.mutations.run(scope, idempotency, async (tx) => {
      const user = await this.repository.byId(tx, id, true);
      if (!user) throw NOT_FOUND;
      if (!active) {
        if (id === actor) {
          throw new AppError(
            409,
            'cannot_deactivate_self',
            'You cannot deactivate your own account',
          );
        }
        if (user.role === 'admin') await this.keepOneAdmin(tx, id);
        await this.repository.update(tx, id, { status: 'deactivated' });
        // Takes effect now: every session of this person ends in the same transaction.
        await this.auth.revokeUserSessions(tx, id);
      } else if (user.status === 'deactivated') {
        // Someone who never set a password goes back to waiting on their invitation.
        await this.repository.update(tx, id, { status: user.hasPassword ? 'active' : 'invited' });
      }
      await this.audit.record(tx, context, {
        action: active ? 'user.reactivated' : 'user.deactivated',
        targetType: 'user',
        targetId: id,
        fields: { status: active ? 'active' : 'deactivated' },
      });
      return ok(await this.view(tx, id));
    });
  }

  /** Sends a fresh invitation link; the previous one stops working. */
  resendInvite(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
  ): Promise<MutationOutcome> {
    return this.mutations.run(scope, idempotency, async (tx) => {
      const user = await this.repository.byId(tx, id, true);
      if (!user) throw NOT_FOUND;
      if (user.status !== 'invited') {
        throw new AppError(409, 'not_invited', `${user.fullName} has already set a password`);
      }
      await this.tokens.issue(
        tx,
        context,
        { id, email: user.email, fullName: user.fullName },
        'invite',
        await this.repository.nameOf(tx, actorOf(scope)),
      );
      return ok(await this.view(tx, id));
    });
  }

  private async keepOneAdmin(tx: Tx, id: string): Promise<void> {
    if ((await this.repository.otherActiveAdmins(tx, id)) === 0) {
      throw new AppError(
        409,
        'last_admin',
        'There must always be one active administrator. Make someone else an administrator first.',
      );
    }
  }

  private async view(tx: Tx, id: string): Promise<User> {
    const user = await this.repository.byId(tx, id);
    if (!user) throw NOT_FOUND;
    const { hasPassword: _, ...view } = user;
    return view;
  }
}
