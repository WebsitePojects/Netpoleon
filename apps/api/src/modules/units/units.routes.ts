import {
  bulkRelocateBody,
  importUnitsBody,
  importUnitsResponse,
  bulkResultSchema,
  completeRepairBody,
  exportUnitsQuery,
  listMovementsResponse,
  listUnitsQuery,
  listUnitsResponse,
  pageQuerySchema,
  reasonBody,
  registerUnitBody,
  relocateUnitBody,
  unitCodeParams,
  unitDetailSchema,
  unitSchema,
  updateUnitBody,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { sendCsv, sendOutcome, toCsv } from '../../platform/http.js';
import type { UnitsService } from './units.service.js';

const unitResponse = { 200: unitSchema };

export function unitsRoutes(service: UnitsService, guard: Guard): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/units',
      { schema: { querystring: listUnitsQuery, response: { 200: listUnitsResponse } } },
      (request) => service.list(guard.require(request), request.query),
    );

    app.get(
      '/units/export.csv',
      { schema: { querystring: exportUnitsQuery } },
      async (request, reply) => {
        const units = await service.export(guard.require(request, 'reports.export'), request.query);
        return sendCsv(
          reply,
          'demo-units.csv',
          toCsv(
            [
              'Asset code',
              'Serial',
              'Category',
              'Brand',
              'Model',
              'Status',
              'Condition',
              'Location',
              'Reserved for',
            ],
            units.map((u) => [
              u.code,
              u.serial,
              u.categoryCode,
              u.brand,
              u.model,
              u.status,
              u.condition.toUpperCase(),
              u.location?.name ?? '',
              u.reservedFor ?? '',
            ]),
          ),
        );
      },
    );

    app.post(
      '/units',
      { schema: { body: registerUnitBody, response: { 201: unitSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.register(guard.require(request, 'unit.register'), request.body),
        ),
    );

    app.post(
      '/units/import',
      {
        // A 500-row file is about 100 KB of JSON; the default 1 MB limit already covers it.
        schema: {
          body: importUnitsBody,
          response: { 200: importUnitsResponse, 201: importUnitsResponse },
        },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.importUnits(guard.require(request, 'unit.register'), request.body),
        ),
    );
    app.post(
      '/units/bulk-relocate',
      { schema: { body: bulkRelocateBody, response: { 200: bulkResultSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.bulkRelocate(guard.require(request, 'unit.move'), request.body),
        ),
    );

    app.get(
      '/units/:code',
      { schema: { params: unitCodeParams, response: { 200: unitDetailSchema } } },
      (request) => service.detail(guard.require(request), request.params.code),
    );

    app.get(
      '/units/:code/movements',
      {
        schema: {
          params: unitCodeParams,
          querystring: pageQuerySchema,
          response: { 200: listMovementsResponse },
        },
      },
      (request) =>
        service.movements(
          guard.require(request),
          request.params.code,
          request.query.cursor,
          request.query.limit,
        ),
    );

    app.patch(
      '/units/:code',
      { schema: { params: unitCodeParams, body: updateUnitBody, response: unitResponse } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.update(
            guard.require(request, 'unit.edit'),
            request.params.code,
            request.body,
          ),
        ),
    );

    app.post(
      '/units/:code/relocate',
      { schema: { params: unitCodeParams, body: relocateUnitBody, response: unitResponse } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.relocate(
            guard.require(request, 'unit.move'),
            request.params.code,
            request.body,
          ),
        ),
    );

    app.post(
      '/units/:code/repair',
      { schema: { params: unitCodeParams, body: reasonBody, response: unitResponse } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.sendToRepair(
            guard.require(request, 'unit.repair'),
            request.params.code,
            request.body,
          ),
        ),
    );

    app.post(
      '/units/:code/repair-complete',
      { schema: { params: unitCodeParams, body: completeRepairBody, response: unitResponse } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.completeRepair(
            guard.require(request, 'unit.repair'),
            request.params.code,
            request.body,
          ),
        ),
    );

    app.post(
      '/units/:code/retire',
      { schema: { params: unitCodeParams, body: reasonBody, response: unitResponse } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.retire(
            guard.require(request, 'unit.retire'),
            request.params.code,
            request.body,
          ),
        ),
    );

    done();
  };
}
