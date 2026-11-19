import {
  bootstrapResponse,
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  sessionUserSchema,
  setPasswordWithTokenBody,
  updateProfileBody,
} from '@wms/contracts';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { revalidated, sendOutcome } from '../../platform/http.js';
import type { AuthService, ClientInfo } from './auth.service.js';

/** Per IP: generous for an office behind one NAT, tight enough to stop a password spray. */
const SIGN_IN_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
/** Mail-sending and token endpoints: a person needs a handful of tries, not hundreds. */
const TOKEN_LIMIT = { max: 10, timeWindow: '15 minutes' } as const;

function client(request: FastifyRequest): ClientInfo {
  const agent = request.headers['user-agent'];
  return {
    ip: request.ip,
    userAgent: typeof agent === 'string' ? agent : null,
    requestId: request.id,
  };
}

export function authRoutes(service: AuthService, guard: Guard): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.post(
      '/auth/login',
      {
        schema: { body: loginBody, response: { 200: bootstrapResponse } },
        config: { rateLimit: SIGN_IN_LIMIT },
      },
      async (request, reply) => {
        const { bootstrap, session } = await service.login(request.body, client(request));
        guard.setSessionCookie(reply, session);
        return bootstrap;
      },
    );

    // Not idempotency-keyed: revoking an already-revoked session is a no-op by nature.
    app.post('/auth/logout', async (request, reply) => {
      await service.logout(request.actor);
      guard.clearSessionCookie(reply);
      return reply.code(204).send();
    });

    app.get(
      '/bootstrap',
      { schema: { response: { 200: bootstrapResponse } } },
      async (request, reply) =>
        revalidated(request, reply, await service.bootstrap(guard.require(request))),
    );

    app.patch(
      '/profile',
      { schema: { body: updateProfileBody, response: { 200: sessionUserSchema } } },
      async (request, reply) =>
        sendOutcome(reply, await service.updateProfile(guard.require(request), request.body)),
    );

    app.post('/auth/password', { schema: { body: changePasswordBody } }, async (request, reply) =>
      sendOutcome(reply, await service.changePassword(guard.require(request), request.body)),
    );

    app.post(
      '/auth/forgot',
      { schema: { body: forgotPasswordBody }, config: { rateLimit: TOKEN_LIMIT } },
      async (request, reply) => {
        await service.forgotPassword(request.body.identifier, client(request));
        return reply.code(202).send();
      },
    );

    for (const [path, purpose] of [
      ['/auth/reset', 'password_reset'],
      ['/auth/accept-invite', 'invite'],
    ] as const) {
      app.post(
        path,
        { schema: { body: setPasswordWithTokenBody }, config: { rateLimit: TOKEN_LIMIT } },
        async (request, reply) => {
          await service.setPasswordWithToken(purpose, request.body, client(request));
          return reply.code(204).send();
        },
      );
    }
    done();
  };
}
