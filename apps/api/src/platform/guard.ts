import cookie from '@fastify/cookie';
import { can, type Action } from '@wms/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../errors.js';
import { scopeOf, type Actor, type RequestContext } from './context.js';
import type { NewSession, SessionService } from './session.js';
import type { SettingsService } from './settings.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in person, or null. Set for every /api request before any handler runs. */
    actor: Actor | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Printable ASCII, 16..128 characters: a UUID fits, a stray header value does not. */
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{16,128}$/;

export interface CookiePolicy {
  /** `__Host-` makes the browser refuse the cookie unless it is Secure, host-only and Path=/. */
  name: string;
  secure: boolean;
}

export function cookiePolicy(secure: boolean): CookiePolicy {
  return { name: secure ? '__Host-wms_session' : 'wms_session', secure };
}

/**
 * Authentication and authorisation for every API route. The session is resolved once per
 * request in an onRequest hook; routes then call `require(request, action)`, which is the only
 * way to obtain a RequestContext, so a service cannot be reached without a permission check.
 */
export class Guard {
  constructor(
    private readonly sessions: SessionService,
    private readonly settings: SettingsService,
    private readonly cookies: CookiePolicy,
  ) {}

  readonly plugin = fp(
    async (app: FastifyInstance) => {
      await app.register(cookie);
      app.decorateRequest('actor', null);
      app.addHook('onRequest', async (request) => {
        request.actor = null;
        if (!request.url.startsWith('/api/')) {
          return;
        }
        const token = request.cookies[this.cookies.name];
        if (token) {
          const { idleHours } = await this.settings.sessionLimits();
          request.actor = await this.sessions.resolve(token, idleHours);
        }
      });
    },
    { name: 'guard' },
  );

  /**
   * The request's context, or a 401/403. `action` omitted means "any signed-in staff member";
   * partner sessions are refused from every console route until the portal slice exists.
   */
  require(request: FastifyRequest, action?: Action): RequestContext {
    const actor = request.actor;
    if (!actor) {
      throw new AppError(401, 'unauthenticated', 'Sign in to continue');
    }
    if (actor.kind !== 'staff' || (action !== undefined && !can(actor.role, action))) {
      throw new AppError(403, 'forbidden', 'You do not have permission to do that');
    }
    let idempotencyKey: string | null = null;
    if (UNSAFE_METHODS.has(request.method)) {
      const header = request.headers['idempotency-key'];
      if (typeof header !== 'string' || !IDEMPOTENCY_KEY.test(header)) {
        throw new AppError(
          400,
          'idempotency_key_required',
          'An Idempotency-Key header is required',
        );
      }
      idempotencyKey = header;
    }
    return {
      actor,
      scope: scopeOf(actor),
      requestId: request.id,
      ip: request.ip,
      idempotencyKey,
      route: `${request.method} ${request.routeOptions.url ?? request.url}`,
    };
  }

  setSessionCookie(reply: FastifyReply, session: NewSession): void {
    void reply.setCookie(this.cookies.name, session.token, {
      httpOnly: true,
      secure: this.cookies.secure,
      sameSite: 'lax',
      path: '/',
      ...(session.cookieMaxAgeSeconds === null ? {} : { maxAge: session.cookieMaxAgeSeconds }),
    });
  }

  clearSessionCookie(reply: FastifyReply): void {
    void reply.clearCookie(this.cookies.name, {
      httpOnly: true,
      secure: this.cookies.secure,
      sameSite: 'lax',
      path: '/',
    });
  }
}

/**
 * Cross-site request forgery defence for every state-changing API call, signed in or not
 * (spec section 9): the browser-set `Origin` must be our own origin, and a custom header that
 * a plain HTML form cannot send must be present. Either one missing is a 403.
 */
export function csrfPlugin(appOrigin: string) {
  return fp(
    (app: FastifyInstance, _options: unknown, done: () => void) => {
      app.addHook('onRequest', (request, _reply, hookDone) => {
        if (!UNSAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) {
          hookDone();
          return;
        }
        const origin = request.headers.origin ?? originOf(request.headers.referer);
        if (origin !== appOrigin || request.headers['x-wms-request'] !== '1') {
          hookDone(new AppError(403, 'csrf_failed', 'The request did not come from this site'));
          return;
        }
        hookDone();
      });
      done();
    },
    { name: 'csrf' },
  );
}

function originOf(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
