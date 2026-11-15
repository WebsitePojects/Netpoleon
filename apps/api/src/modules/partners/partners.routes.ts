import {
  contactBodySchema,
  contactParamsSchema,
  editPartnerBodySchema,
  idParamsSchema,
  partnerBodySchema,
  partnerSchema,
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
import type { PartnersService } from './partners.service.js';

export function partnerRoutes(service: PartnersService): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/api/v1/partners',
      {
        preHandler: requirePermission('partners.view'),
        schema: { response: { 200: z.strictObject({ items: z.array(partnerSchema) }) } },
      },
      async (request) => ({ items: await service.list(requireSession(request).scope) }),
    );

    app.get(
      '/api/v1/partners/:id',
      {
        preHandler: requirePermission('partners.view'),
        schema: { params: idParamsSchema, response: { 200: partnerSchema } },
      },
      (request) => service.detail(requireSession(request).scope, request.params.id),
    );

    app.post(
      '/api/v1/partners',
      { preHandler: requirePermission('partners.manage'), schema: { body: partnerBodySchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.create(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    app.patch(
      '/api/v1/partners/:id',
      {
        preHandler: requirePermission('partners.manage'),
        schema: { params: idParamsSchema, body: editPartnerBodySchema },
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

    for (const [path, archived] of [
      ['archive', true],
      ['restore', false],
    ] as const) {
      app.post(
        `/api/v1/partners/:id/${path}`,
        { preHandler: requirePermission('partners.manage'), schema: { params: idParamsSchema } },
        async (request, reply) =>
          sendOutcome(
            reply,
            await service.setArchived(
              requireSession(request).scope,
              contextOf(request),
              idempotencyOf(request),
              request.params.id,
              archived,
            ),
          ),
      );
    }

    app.post(
      '/api/v1/partners/:id/contacts',
      {
        preHandler: requirePermission('partners.manage'),
        schema: { params: idParamsSchema, body: contactBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.addContact(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.id,
            request.body,
          ),
        ),
    );

    app.delete(
      '/api/v1/partners/:id/contacts/:contactId',
      { preHandler: requirePermission('partners.manage'), schema: { params: contactParamsSchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.removeContact(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.id,
            request.params.contactId,
          ),
        ),
    );

    done();
  };
}
