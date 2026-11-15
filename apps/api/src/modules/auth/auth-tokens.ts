import type { TokenPurpose } from '@wms/contracts';
import type { Tx } from '@wms/db';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import { randomToken, sha256 } from '../../platform/crypto.js';
import type { Outbox } from '../../platform/outbox.js';
import type { AuthRepository } from './auth.repository.js';

/** How long a link works. A reset is short because whoever holds it can take the account. */
export const TOKEN_TTL_HOURS: Record<TokenPurpose, number> = { invite: 72, password_reset: 1 };

const PATHS: Record<TokenPurpose, string> = {
  invite: '/accept-invite/',
  password_reset: '/reset-password/',
};

/**
 * Issues single-use links. Only the SHA-256 of the token is stored; the raw token leaves the
 * process once, inside the email queued in the same transaction. The users module (invites)
 * and the first-admin command use this too, so there is one way to make a link.
 */
export class AuthTokens {
  constructor(
    private readonly repository: AuthRepository,
    private readonly outbox: Outbox,
    private readonly audit: AuditWriter,
    private readonly appOrigin: string,
  ) {}

  /** Returns the link. Callers must never put it in an HTTP response. */
  async issue(
    tx: Tx,
    context: RequestContext,
    user: { id: string; email: string; fullName: string },
    purpose: TokenPurpose,
    invitedBy: string | null = null,
  ): Promise<string> {
    const token = randomToken();
    await this.repository.voidOpenTokens(tx, user.id, purpose);
    await this.repository.insertToken(tx, {
      tokenHash: sha256(token),
      userId: user.id,
      purpose,
      ttlHours: TOKEN_TTL_HOURS[purpose],
    });
    const link = `${this.appOrigin}${PATHS[purpose]}${token}`;
    await this.outbox.enqueue(
      tx,
      purpose === 'invite'
        ? {
            topic: 'email.invite',
            payload: { to: user.email, fullName: user.fullName, link, invitedBy },
          }
        : {
            topic: 'email.password_reset',
            payload: { to: user.email, fullName: user.fullName, link },
          },
    );
    await this.audit.record(tx, context, {
      action: purpose === 'invite' ? 'user.invited' : 'user.password_reset_requested',
      targetType: 'user',
      targetId: user.id,
    });
    return link;
  }
}
