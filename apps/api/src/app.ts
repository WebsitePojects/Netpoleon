import type { AppConfig } from '@wms/config';
import { EXPECTED_MIGRATION_COUNT, type Database } from '@wms/db';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AuthTokens } from './modules/auth/auth-tokens.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { HealthService } from './modules/health/health.service.js';
import { AuditWriter } from './platform/audit.js';
import { Outbox } from './platform/outbox.js';
import { RateLimiter } from './platform/rate-limit.js';
import { SettingsReader } from './platform/settings.js';
import { csrfPlugin } from './plugins/csrf.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { generateRequestId, requestIdPlugin } from './plugins/request-id.js';
import { securityHeadersPlugin } from './plugins/security-headers.js';
import { sessionPlugin } from './plugins/session.js';

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

  const production = config.nodeEnv === 'production';
  const audit = new AuditWriter();
  const outbox = new Outbox();
  const settings = new SettingsReader();
  const authRepository = new AuthRepository();
  const authTokens = new AuthTokens(authRepository, outbox, audit, config.appOrigin);
  const auth = new AuthService(db, authRepository, authTokens, settings, audit, new RateLimiter());

  await app.register(requestIdPlugin);
  await app.register(securityHeadersPlugin, { hsts: production });
  await app.register(errorHandlerPlugin);
  await app.register(csrfPlugin, { appOrigin: config.appOrigin });
  await app.register(sessionPlugin, { resolver: auth });

  await app.register(healthRoutes(new HealthService(db, EXPECTED_MIGRATION_COUNT)));
  await app.register(authRoutes(auth, production));

  return app;
}
