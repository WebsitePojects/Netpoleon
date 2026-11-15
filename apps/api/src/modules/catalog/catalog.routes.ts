import {
  catalogSchema,
  createCategoryBodySchema,
  createLocationBodySchema,
  createModelBodySchema,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  contextOf,
  idempotencyOf,
  requirePermission,
  requireSession,
  sendOutcome,
} from '../../plugins/session.js';
import type { CatalogService } from './catalog.service.js';

export function catalogRoutes(service: CatalogService): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/api/v1/catalog',
      { preHandler: requirePermission('unit.view'), schema: { response: { 200: catalogSchema } } },
      (request) => service.catalog(requireSession(request).scope),
    );

    app.post(
      '/api/v1/categories',
      {
        preHandler: requirePermission('settings.manage'),
        schema: { body: createCategoryBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createCategory(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    app.post(
      '/api/v1/locations',
      {
        preHandler: requirePermission('settings.manage'),
        schema: { body: createLocationBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createLocation(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    app.post(
      '/api/v1/models',
      { preHandler: requirePermission('unit.register'), schema: { body: createModelBodySchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createModel(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    done();
  };
}
