import {
  agingResponse,
  borrowersQuery,
  borrowersResponse,
  dashboardResponse,
  listAlertsQuery,
  listAlertsResponse,
  markAlertsReadBody,
  overviewQuery,
  overviewResponse,
  trackingQuery,
  trackingResponse,
  unreadCountResponse,
  utilizationResponse,
} from '@wms/contracts';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { Guard } from '../../platform/guard.js';
import { sendCsv, sendOutcome, toCsv } from '../../platform/http.js';
import type { AlertsService } from '../alerts/alerts.service.js';
import type { ReportsService } from './reports.service.js';

export function reportsRoutes(
  reports: ReportsService,
  alerts: AlertsService,
  guard: Guard,
): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get('/dashboard', { schema: { response: { 200: dashboardResponse } } }, (request) =>
      reports.dashboard(guard.require(request)),
    );

    app.get(
      '/alerts',
      { schema: { querystring: listAlertsQuery, response: { 200: listAlertsResponse } } },
      (request) => alerts.list(guard.require(request), request.query),
    );
    app.get(
      '/alerts/unread-count',
      { schema: { response: { 200: unreadCountResponse } } },
      async (request) => {
        const { unread } = await alerts.list(guard.require(request), { limit: 200 });
        return { unread };
      },
    );
    app.post('/alerts/read', { schema: { body: markAlertsReadBody } }, async (request, reply) =>
      sendOutcome(reply, await alerts.markRead(guard.require(request), request.body)),
    );

    app.get(
      '/reports/overview',
      { schema: { querystring: overviewQuery, response: { 200: overviewResponse } } },
      (request) => reports.overview(guard.require(request), request.query.months),
    );
    app.get(
      '/reports/tracking',
      { schema: { querystring: trackingQuery, response: { 200: trackingResponse } } },
      (request) => reports.tracking(guard.require(request), request.query),
    );
    app.get(
      '/reports/borrowers',
      { schema: { querystring: borrowersQuery, response: { 200: borrowersResponse } } },
      (request) => reports.borrowers(guard.require(request), request.query),
    );
    app.get(
      '/reports/borrowers.csv',
      { schema: { querystring: borrowersQuery } },
      async (request, reply) => {
        const rows = await reports.borrowers(
          guard.require(request, 'reports.export'),
          request.query,
        );
        return sendCsv(
          reply,
          `borrowers-${request.query.from}-${request.query.until}.csv`,
          toCsv(
            ['Company', 'Loans', 'Open', 'Overdue', 'Returned short', 'Last borrowed'],
            rows.map((row) => [
              row.company,
              row.loans,
              row.open,
              row.overdue,
              row.missing,
              row.lastBorrowed,
            ]),
          ),
        );
      },
    );
    app.get('/reports/aging', { schema: { response: { 200: agingResponse } } }, (request) =>
      reports.aging(guard.require(request)),
    );
    app.get(
      '/reports/utilization',
      { schema: { response: { 200: utilizationResponse } } },
      (request) => reports.utilization(guard.require(request)),
    );

    done();
  };
}
