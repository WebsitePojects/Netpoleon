import {
  createCategoryBody,
  createLocationBody,
  createModelBody,
  listCategoriesResponse,
  listLocationsResponse,
  listModelsResponse,
  listPartnersQuery,
  listPartnersResponse,
  modelAvailabilityQuery,
  modelAvailabilityResponse,
} from '@wms/contracts';
import { z } from 'zod';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { revalidated, sendOutcome } from '../../platform/http.js';
import type { CatalogService } from './catalog.service.js';

const created = { 201: z.object({ id: z.uuid() }) };

export function catalogRoutes(service: CatalogService, guard: Guard): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/categories',
      { schema: { response: { 200: listCategoriesResponse } } },
      async (request, reply) =>
        revalidated(request, reply, await service.categories(guard.require(request))),
    );
    app.post(
      '/categories',
      { schema: { body: createCategoryBody, response: created } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createCategory(guard.require(request, 'catalog.manage'), request.body),
        ),
    );

    app.get(
      '/locations',
      { schema: { response: { 200: listLocationsResponse } } },
      async (request, reply) =>
        revalidated(request, reply, await service.locations(guard.require(request))),
    );
    app.post(
      '/locations',
      { schema: { body: createLocationBody, response: created } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createLocation(guard.require(request, 'catalog.manage'), request.body),
        ),
    );

    app.get(
      '/models',
      { schema: { response: { 200: listModelsResponse } } },
      async (request, reply) =>
        revalidated(request, reply, await service.models(guard.require(request))),
    );
    app.post(
      '/models',
      { schema: { body: createModelBody, response: created } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.createModel(guard.require(request, 'catalog.manage'), request.body),
        ),
    );
    app.get(
      '/models/availability',
      {
        schema: {
          querystring: modelAvailabilityQuery,
          response: { 200: modelAvailabilityResponse },
        },
      },
      async (request) => service.availability(guard.require(request), request.query),
    );

    app.get(
      '/partners',
      { schema: { querystring: listPartnersQuery, response: { 200: listPartnersResponse } } },
      async (request) => service.partners(guard.require(request), request.query),
    );
    done();
  };
}
