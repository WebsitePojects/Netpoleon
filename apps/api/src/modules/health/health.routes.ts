import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import type { HealthService } from './health.service.js';

const okSchema = z.strictObject({ status: z.literal('ok') });
const readySchema = z.strictObject({ status: z.literal('ready') });

export function healthRoutes(service: HealthService): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    // Liveness: proves the process answers. It must never touch a dependency, or a database
    // outage would make the orchestrator restart a healthy process.
    app.get('/healthz', { schema: { response: { 200: okSchema } } }, () => ({
      status: 'ok' as const,
    }));

    app.get('/readyz', { schema: { response: { 200: readySchema } } }, async () => {
      if (!(await service.isReady())) {
        throw new AppError(503, 'not_ready', 'Service is not ready');
      }
      return { status: 'ready' as const };
    });

    done();
  };
}
