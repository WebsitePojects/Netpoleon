import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  SESSION_COOKIE,
  sessionUserSchema,
  setPasswordBodySchema,
  tokenOwnerSchema,
  tokenParamsSchema,
  tokenPurposeSchema,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { clearedCookie, readCookie, sessionCookie } from '../../platform/cookies.js';
import { contextOf, requireSession, requireSignedIn } from '../../plugins/session.js';
import type { AuthService } from './auth.service.js';

const userResponse = z.strictObject({ user: sessionUserSchema });
const accepted = z.strictObject({ status: z.literal('accepted') });

/**
 * The pre-login endpoints take no Idempotency-Key (foundation spec section 8): there is no
 * user to key on, and a stored login response would hold a session token. They are safe to
 * repeat by construction instead: a link is spent by a conditional update that succeeds once,
 * and a repeated login only creates a second, revocable session, under a rate limit.
 */
export function authRoutes(service: AuthService, secureCookies: boolean): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.post(
      '/api/v1/auth/login',
      { schema: { body: loginBodySchema, response: { 200: userResponse } } },
      async (request, reply) => {
        const result = await service.login(request.body, contextOf(request));
        reply.header(
          'set-cookie',
          sessionCookie(SESSION_COOKIE, result.token, {
            secure: secureCookies,
            maxAgeSeconds: result.maxAgeSeconds,
          }),
        );
        return { user: result.user };
      },
    );

    app.post('/api/v1/auth/logout', async (request, reply) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      if (token) await service.logout(token, contextOf(request));
      reply.header('set-cookie', clearedCookie(SESSION_COOKIE, secureCookies));
      return reply.status(204).send();
    });

    app.get(
      '/api/v1/auth/me',
      { preHandler: requireSignedIn, schema: { response: { 200: userResponse } } },
      (request) => ({ user: requireSession(request).user }),
    );

    app.post(
      '/api/v1/auth/password/forgot',
      { schema: { body: forgotPasswordBodySchema, response: { 202: accepted } } },
      async (request, reply) => {
        await service.forgotPassword(request.body.email, contextOf(request));
        return reply.status(202).send({ status: 'accepted' as const });
      },
    );

    app.get(
      '/api/v1/auth/links/:purpose/:token',
      { schema: { params: tokenParamsSchema, response: { 200: tokenOwnerSchema } } },
      (request) =>
        service.tokenOwner(request.params.purpose, request.params.token, contextOf(request)),
    );

    app.post(
      '/api/v1/auth/links/:purpose',
      {
        schema: {
          params: z.strictObject({ purpose: tokenPurposeSchema }),
          body: setPasswordBodySchema,
        },
      },
      async (request, reply) => {
        await service.completeToken(
          request.params.purpose,
          request.body.token,
          request.body.password,
          contextOf(request),
        );
        return reply.status(204).send();
      },
    );

    app.post(
      '/api/v1/auth/password/change',
      { preHandler: requireSignedIn, schema: { body: changePasswordBodySchema } },
      async (request, reply) => {
        await service.changePassword(
          requireSession(request),
          request.body.currentPassword,
          request.body.newPassword,
          contextOf(request),
        );
        return reply.status(204).send();
      },
    );

    done();
  };
}
