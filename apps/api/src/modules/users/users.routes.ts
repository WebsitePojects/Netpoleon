import {
  editUserBodySchema,
  idParamsSchema,
  inviteUserBodySchema,
  userSchema,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  contextOf,
  idempotencyOf,
  requirePermission,
  requireSession,
  sendOutcome,
} from '../../plugins/session.js';
import type { UsersService } from './users.service.js';

export function userRoutes(service: UsersService): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/api/v1/users',
      {
        preHandler: requirePermission('users.view'),
        schema: { response: { 200: z.strictObject({ items: z.array(userSchema) }) } },
      },
      async (request) => ({ items: await service.list(requireSession(request).scope) }),
    );

    app.post(
      '/api/v1/users',
      { preHandler: requirePermission('users.manage'), schema: { body: inviteUserBodySchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.invite(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    app.patch(
      '/api/v1/users/:id',
      {
        preHandler: requirePermission('users.manage'),
        schema: { params: idParamsSchema, body: editUserBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.edit(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.id,
            request.body,
          ),
        ),
    );

    for (const [path, active] of [
      ['deactivate', false],
      ['reactivate', true],
    ] as const) {
      app.post(
        `/api/v1/users/:id/${path}`,
        { preHandler: requirePermission('users.manage'), schema: { params: idParamsSchema } },
        async (request, reply) =>
          sendOutcome(
            reply,
            await service.setActive(
              requireSession(request).scope,
              contextOf(request),
              idempotencyOf(request),
              request.params.id,
              active,
            ),
          ),
      );
    }

    app.post(
      '/api/v1/users/:id/invite',
      { preHandler: requirePermission('users.manage'), schema: { params: idParamsSchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.resendInvite(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.id,
          ),
        ),
    );

    done();
  };
}
