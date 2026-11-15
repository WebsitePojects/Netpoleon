import {
  assetCodeParamsSchema,
  assetDetailSchema,
  assetListQuerySchema,
  assetPageSchema,
  editAssetBodySchema,
  moveAssetBodySchema,
  moveAssetsBodySchema,
  reasonBodySchema,
  registerAssetBodySchema,
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
import type { AssetsService } from './assets.service.js';

const repairedBodySchema = z.strictObject({
  note: z.string().trim().max(500).nullable().default(null),
});

export function assetRoutes(service: AssetsService): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/api/v1/assets',
      {
        preHandler: requirePermission('unit.view'),
        schema: { querystring: assetListQuerySchema, response: { 200: assetPageSchema } },
      },
      (request) => service.list(requireSession(request).scope, request.query),
    );

    app.get(
      '/api/v1/assets/:code',
      {
        preHandler: requirePermission('unit.view'),
        schema: { params: assetCodeParamsSchema, response: { 200: assetDetailSchema } },
      },
      (request) => service.detail(requireSession(request).scope, request.params.code),
    );

    app.post(
      '/api/v1/assets',
      { preHandler: requirePermission('unit.register'), schema: { body: registerAssetBodySchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.register(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body,
          ),
        ),
    );

    app.patch(
      '/api/v1/assets/:code',
      {
        preHandler: requirePermission('unit.edit'),
        schema: { params: assetCodeParamsSchema, body: editAssetBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.edit(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.code,
            request.body,
          ),
        ),
    );

    app.post(
      '/api/v1/assets/:code/move',
      {
        preHandler: requirePermission('unit.move'),
        schema: { params: assetCodeParamsSchema, body: moveAssetBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.move(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.code,
            request.body.locationId,
          ),
        ),
    );

    app.post(
      '/api/v1/assets/move',
      { preHandler: requirePermission('unit.move'), schema: { body: moveAssetsBodySchema } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.moveMany(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.body.codes,
            request.body.locationId,
          ),
        ),
    );

    app.post(
      '/api/v1/assets/:code/repair',
      {
        preHandler: requirePermission('unit.repair'),
        schema: { params: assetCodeParamsSchema, body: reasonBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.sendToRepair(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.code,
            request.body.reason,
          ),
        ),
    );

    app.post(
      '/api/v1/assets/:code/repaired',
      {
        preHandler: requirePermission('unit.repair'),
        schema: { params: assetCodeParamsSchema, body: repairedBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.repairComplete(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.code,
            request.body.note,
          ),
        ),
    );

    app.post(
      '/api/v1/assets/:code/retire',
      {
        preHandler: requirePermission('unit.retire'),
        schema: { params: assetCodeParamsSchema, body: reasonBodySchema },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.retire(
            requireSession(request).scope,
            contextOf(request),
            idempotencyOf(request),
            request.params.code,
            request.body.reason,
          ),
        ),
    );

    done();
  };
}
