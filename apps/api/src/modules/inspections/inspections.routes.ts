import {
  inspectionQueueQuery,
  inspectionQueueResponse,
  recordInspectionBody,
  unitCodeParams,
  unitSchema,
} from '@wms/contracts';
import { z } from 'zod';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { sendOutcome } from '../../platform/http.js';
import type { InspectionsService } from './inspections.service.js';

export function inspectionsRoutes(
  service: InspectionsService,
  guard: Guard,
): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/inspections',
      { schema: { querystring: inspectionQueueQuery, response: { 200: inspectionQueueResponse } } },
      (request) => service.queue(guard.require(request), request.query),
    );

    app.post(
      '/units/:code/inspection/start',
      {
        schema: { params: unitCodeParams, body: z.strictObject({}), response: { 200: unitSchema } },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.start(guard.require(request, 'inspection.perform'), request.params.code),
        ),
    );

    app.post(
      '/units/:code/inspection',
      {
        schema: {
          params: unitCodeParams,
          body: recordInspectionBody,
          response: { 200: unitSchema },
        },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.record(
            guard.require(request, 'inspection.perform'),
            request.params.code,
            request.body,
          ),
        ),
    );

    done();
  };
}
