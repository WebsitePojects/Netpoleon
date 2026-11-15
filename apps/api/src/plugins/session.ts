import { can, SESSION_COOKIE, type Action, type SessionUser } from '@wms/contracts';
import type { ActorScope } from '@wms/db';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../errors.js';
import type { RequestContext } from '../platform/audit.js';
import { readCookie } from '../platform/cookies.js';
import { hashRequestBody, type IdempotencyRequest } from '../platform/mutations.js';

/** A signed-in person for the length of one request. */
export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
  /** The database scope every query of this request runs under. */
  scope: ActorScope;
}

declare module 'fastify' {
  interface FastifyRequest {
    session: ActiveSession | null;
  }
}

export interface SessionResolver {
  /** Returns the session for a raw cookie value, or null when it is unknown, expired or revoked. */
  resolve(token: string): Promise<ActiveSession | null>;
}

/** Reads the session cookie once per request and attaches the session, or null. */
export const sessionPlugin = fp<{ resolver: SessionResolver }>(
  (app, { resolver }, done) => {
    app.decorateRequest('session', null);
    app.addHook('onRequest', async (request) => {
      if (!request.url.startsWith('/api/')) return;
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      request.session = token ? await resolver.resolve(token) : null;
    });
    done();
  },
  { name: 'session' },
);

export function requireSession(request: FastifyRequest): ActiveSession {
  if (!request.session) {
    throw new AppError(401, 'not_signed_in', 'Sign in to continue');
  }
  return request.session;
}

/** Route guard: signed in, and the role may perform `action`. An unlisted pair is denied. */
export function requirePermission(action: Action): preHandlerHookHandler {
  return (request: FastifyRequest, _reply: FastifyReply, done) => {
    const session = request.session;
    if (!session) return done(new AppError(401, 'not_signed_in', 'Sign in to continue'));
    if (!can(session.user.role, action)) {
      return done(new AppError(403, 'forbidden', 'Your role does not allow this action'));
    }
    done();
  };
}

export const requireSignedIn: preHandlerHookHandler = (request, _reply, done) => {
  done(request.session ? undefined : new AppError(401, 'not_signed_in', 'Sign in to continue'));
};

export function contextOf(request: FastifyRequest): RequestContext {
  const agent = request.headers['user-agent'];
  return {
    actorUserId: request.session?.user.id ?? null,
    ip: request.ip,
    requestId: request.id,
    userAgent: typeof agent === 'string' ? agent.slice(0, 300) : null,
  };
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The client's intent key for a mutating request (foundation spec section 8). Required: a
 * retry after a timeout must reuse the key, so the web app creates one per intent.
 */
export function idempotencyOf(request: FastifyRequest): IdempotencyRequest {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new AppError(
      400,
      'idempotency_key_required',
      'Send an Idempotency-Key header: 8 to 128 letters, digits, - or _',
    );
  }
  return {
    key,
    route: `${request.method} ${request.routeOptions.url ?? request.url}`,
    requestHash: hashRequestBody({ params: request.params, body: request.body }),
  };
}
