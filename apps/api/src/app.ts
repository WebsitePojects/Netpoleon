import type { AppConfig } from '@wms/config';
import { EXPECTED_MIGRATION_COUNT, type Database } from '@wms/db';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { healthRoutes } from './modules/health/health.routes.js';
import { HealthService } from './modules/health/health.service.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { generateRequestId, requestIdPlugin } from './plugins/request-id.js';
import { securityHeadersPlugin } from './plugins/security-headers.js';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  logger: FastifyBaseLogger;
}

const BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * The composition root: the only place objects are constructed and wired together. Returns
 * before `ready()` so tests can add routes of their own; `listen()` and `inject()` finish the job.
 */
export async function buildApp({ config, db, logger }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: generateRequestId,
    requestIdHeader: false,
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.trustProxy,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(requestIdPlugin);
  await app.register(securityHeadersPlugin, { hsts: config.nodeEnv === 'production' });
  await app.register(errorHandlerPlugin);

  await app.register(healthRoutes(new HealthService(db, EXPECTED_MIGRATION_COUNT)));

  return app;
}
