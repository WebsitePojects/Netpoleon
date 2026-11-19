import {
  approveTransactionBody,
  bulkRejectBody,
  bulkResultSchema,
  candidatesResponse,
  createTransactionBody,
  exportTransactionsQuery,
  extendTransactionBody,
  listTransactionsQuery,
  listTransactionsResponse,
  releaseTransactionBody,
  returnTransactionBody,
  stageCountsResponse,
  transactionDetailSchema,
  transactionNumberParams,
  transactionReasonBody,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { sendCsv, sendOutcome, toCsv } from '../../platform/http.js';
import type { TransactionsService } from './transactions.service.js';

const detail = { 200: transactionDetailSchema };

export function transactionsRoutes(
  service: TransactionsService,
  guard: Guard,
): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/transactions',
      {
        schema: { querystring: listTransactionsQuery, response: { 200: listTransactionsResponse } },
      },
      (request) => service.list(guard.require(request), request.query),
    );

    app.get(
      '/transactions/stage-counts',
      { schema: { response: { 200: stageCountsResponse } } },
      (request) => service.stageCounts(guard.require(request)),
    );

    app.get(
      '/transactions/export.csv',
      { schema: { querystring: exportTransactionsQuery } },
      async (request, reply) => {
        const items = await service.export(guard.require(request, 'reports.export'), request.query);
        return sendCsv(
          reply,
          'transactions.csv',
          toCsv(
            [
              'Transaction',
              'Stage',
              'Company',
              'Borrower',
              'Brand',
              'Model',
              'Units',
              'Needed from',
              'Due',
              'Purpose',
            ],
            items.map((t) => [
              t.number,
              t.stage,
              t.company.name,
              t.contact.name,
              t.model.brand,
              t.model.name,
              t.unitCodes.join(' '),
              t.neededFrom,
              t.dueDate,
              t.purpose,
            ]),
          ),
        );
      },
    );

    app.post(
      '/transactions',
      { schema: { body: createTransactionBody, response: { 201: transactionDetailSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.create(guard.require(request, 'loan.request'), request.body),
        ),
    );

    app.post(
      '/transactions/bulk-reject',
      { schema: { body: bulkRejectBody, response: { 200: bulkResultSchema } } },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.bulkReject(guard.require(request, 'loan.decide'), request.body),
        ),
    );

    app.get(
      '/transactions/:no',
      { schema: { params: transactionNumberParams, response: detail } },
      (request) => service.detail(guard.require(request), request.params.no),
    );

    app.get(
      '/transactions/:no/candidates',
      { schema: { params: transactionNumberParams, response: { 200: candidatesResponse } } },
      (request) => service.candidates(guard.require(request, 'loan.decide'), request.params.no),
    );

    app.post(
      '/transactions/:no/approve',
      {
        schema: { params: transactionNumberParams, body: approveTransactionBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.approve(
            guard.require(request, 'loan.decide'),
            request.params.no,
            request.body,
          ),
        ),
    );

    app.post(
      '/transactions/:no/reject',
      {
        schema: { params: transactionNumberParams, body: transactionReasonBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.reject(
            guard.require(request, 'loan.decide'),
            request.params.no,
            request.body,
          ),
        ),
    );

    app.post(
      '/transactions/:no/cancel',
      {
        schema: { params: transactionNumberParams, body: transactionReasonBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.cancel(
            guard.require(request, 'loan.cancel'),
            request.params.no,
            request.body,
          ),
        ),
    );

    app.post(
      '/transactions/:no/release',
      {
        schema: { params: transactionNumberParams, body: releaseTransactionBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.release(
            guard.require(request, 'loan.release'),
            request.params.no,
            request.body,
          ),
        ),
    );

    app.post(
      '/transactions/:no/return',
      {
        schema: { params: transactionNumberParams, body: returnTransactionBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.receive(
            guard.require(request, 'loan.receive'),
            request.params.no,
            request.body,
          ),
        ),
    );

    app.post(
      '/transactions/:no/extend',
      {
        schema: { params: transactionNumberParams, body: extendTransactionBody, response: detail },
      },
      async (request, reply) =>
        sendOutcome(
          reply,
          await service.extend(
            guard.require(request, 'loan.extend'),
            request.params.no,
            request.body,
          ),
        ),
    );

    done();
  };
}
