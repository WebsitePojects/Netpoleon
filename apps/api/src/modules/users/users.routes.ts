import {
  accessLinkResponse,
  createUserBody,
  idParams,
  listAuditQuery,
  listAuditResponse,
  listUsersQuery,
  listUsersResponse,
  settingsResponse,
  updateSettingsBody,
  updateUserBody,
  userSchema,
} from '@wms/contracts';
import { z } from 'zod';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { revalidated, sendOutcome } from '../../platform/http.js';
import type { UsersService } from './users.service.js';

const user = { 200: userSchema };

export function usersRoutes(service: UsersService, guard: Guard): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/users',
      { schema: { querystring: listUsersQuery, response: { 200: listUsersResponse } } },
      (request) => service.list(guard.require(request, 'users.manage'), request.query),
    );
    app.post(
      '/users',
      { schema: { body: createUserBody, response: { 201: userSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.create(guard.require(request, 'users.manage'), request.body),
        ),
    );
    app.patch(
      '/users/:id',
      { schema: { params: idParams, body: updateUserBody, response: user } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.update(
            guard.require(request, 'users.manage'),
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
        `/users/:id/${path}`,
        { schema: { params: idParams, body: z.strictObject({}), response: user } },
        async (request, reply) =>
          sendOutcome(
            reply,
            await service.setActive(
              guard.require(request, 'users.manage'),
              request.params.id,
              active,
            ),
          ),
      );
    }
    app.post(
      '/users/:id/access-link',
      {
        schema: {
          params: idParams,
          body: z.strictObject({}),
          response: { 200: accessLinkResponse },
        },
      },
      async (request, reply) => {
        const outcome = await service.accessLink(
          guard.require(request, 'users.manage'),
          request.params.id,
        );
        reply.header('cache-control', 'no-store');
        return sendOutcome(reply, outcome);
      },
    );

    app.get(
      '/audit',
      { schema: { querystring: listAuditQuery, response: { 200: listAuditResponse } } },
      (request) => service.auditTrail(guard.require(request), request.query),
    );

    app.get(
      '/settings',
      { schema: { response: { 200: settingsResponse } } },
      async (request, reply) => {
        guard.require(request);
        return revalidated(request, reply, await service.getSettings());
      },
    );
    app.patch(
      '/settings',
      { schema: { body: updateSettingsBody, response: { 200: settingsResponse } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.updateSettings(guard.require(request, 'settings.manage'), request.body),
        ),
    );

    done();
  };
}
