import {
  addContactBody,
  contactParams,
  createPartnerBody,
  idParams,
  listDirectoryQuery,
  listDirectoryResponse,
  listPartnersQuery,
  listPartnersResponse,
  partnerDetailSchema,
  updatePartnerBody,
} from '@wms/contracts';
import { z } from 'zod';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { sendOutcome } from '../../platform/http.js';
import type { PartnersService } from './partners.service.js';

const detail = { 200: partnerDetailSchema };
const empty = z.strictObject({});

/** Reads are open to every staff role (filers pick contacts); changes need `partners.manage`. */
export function partnersRoutes(service: PartnersService, guard: Guard): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/partners',
      { schema: { querystring: listPartnersQuery, response: { 200: listPartnersResponse } } },
      (request) => service.suggest(guard.require(request), request.query),
    );
    app.get(
      '/partners/directory',
      { schema: { querystring: listDirectoryQuery, response: { 200: listDirectoryResponse } } },
      (request) => service.directory(guard.require(request), request.query),
    );
    app.get('/partners/:id', { schema: { params: idParams, response: detail } }, (request) =>
      service.detail(guard.require(request), request.params.id),
    );

    app.post(
      '/partners',
      { schema: { body: createPartnerBody, response: { 201: partnerDetailSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.create(guard.require(request, 'partners.manage'), request.body),
        ),
    );
    app.patch(
      '/partners/:id',
      { schema: { params: idParams, body: updatePartnerBody, response: detail } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.update(
            guard.require(request, 'partners.manage'),
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
        `/partners/:id/${path}`,
        { schema: { params: idParams, body: empty, response: detail } },
        async (request, reply) =>
          sendOutcome(
            reply,
            await service.setArchived(
              guard.require(request, 'partners.manage'),
              request.params.id,
              archived,
            ),
          ),
      );
    }

    app.post(
      '/partners/:id/contacts',
      {
        schema: { params: idParams, body: addContactBody, response: { 201: partnerDetailSchema } },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.addContact(
            guard.require(request, 'partners.manage'),
            request.params.id,
            request.body,
          ),
        ),
    );
    // A POST, not a DELETE: every mutation here carries a JSON body and an Idempotency-Key.
    app.post(
      '/partners/:id/contacts/:contactId/remove',
      { schema: { params: contactParams, body: empty, response: detail } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.removeContact(
            guard.require(request, 'partners.manage'),
            request.params.id,
            request.params.contactId,
          ),
        ),
    );
    done();
  };
}
