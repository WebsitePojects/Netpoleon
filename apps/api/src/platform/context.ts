import type { Role } from '@wms/contracts';
import type { ActorScope } from '@wms/db';

/** The signed-in person behind a request, as resolved from the session cookie. */
export interface Actor {
  sessionId: string;
  userId: string;
  username: string | null;
  name: string;
  role: Role;
  kind: 'staff' | 'partner';
  partnerOrgId: string | null;
}

/**
 * Everything a service needs to know about who is asking and how to record it. Built by the
 * guard, so a service can never be called for a request that skipped authentication.
 */
export interface RequestContext {
  actor: Actor;
  scope: ActorScope;
  requestId: string;
  ip: string;
  /** Present on every mutating request (the idempotency pre-handler rejects one without). */
  idempotencyKey: string | null;
  /** Method and route pattern, e.g. `POST /api/v1/units`; part of the idempotency record. */
  route: string;
}

export function scopeOf(actor: Actor): ActorScope {
  return actor.kind === 'partner' && actor.partnerOrgId
    ? { kind: 'partner', userId: actor.userId, partnerOrgId: actor.partnerOrgId }
    : { kind: 'staff', userId: actor.userId };
}
