import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from '@wms/config';
import { EXPECTED_MIGRATION_COUNT, type Database } from '@wms/db';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AlertsRepository } from './modules/alerts/alerts.repository.js';
import { AlertsService } from './modules/alerts/alerts.service.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { HealthService } from './modules/health/health.service.js';
import { InspectionsRepository } from './modules/inspections/inspections.repository.js';
import { inspectionsRoutes } from './modules/inspections/inspections.routes.js';
import { InspectionsService } from './modules/inspections/inspections.service.js';
import { ReportsRepository } from './modules/reports/reports.repository.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { TransactionsRepository } from './modules/transactions/transactions.repository.js';
import { transactionsRoutes } from './modules/transactions/transactions.routes.js';
import { TransactionsService } from './modules/transactions/transactions.service.js';
import { UnitsRepository } from './modules/units/units.repository.js';
import { unitsRoutes } from './modules/units/units.routes.js';
import { UnitsService } from './modules/units/units.service.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { UsersService } from './modules/users/users.service.js';
import { AuditWriter } from './platform/audit.js';
import { cookiePolicy, csrfPlugin, Guard } from './platform/guard.js';
import { cacheDefaultsPlugin } from './platform/http.js';
import { SessionService } from './platform/session.js';
import { SettingsService } from './platform/settings.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { generateRequestId, requestIdPlugin } from './plugins/request-id.js';
import { securityHeadersPlugin } from './plugins/security-headers.js';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  logger: FastifyBaseLogger;
}

const BODY_LIMIT_BYTES = 1024 * 1024;
const API_PREFIX = '/api/v1';

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

  const settings = new SettingsService(db);
  const sessions = new SessionService(db);
  const audit = new AuditWriter();
  const guard = new Guard(sessions, settings, cookiePolicy(config.secureCookies));
  const catalogRepo = new CatalogRepository();

  await app.register(requestIdPlugin);
  await app.register(securityHeadersPlugin, { hsts: config.nodeEnv === 'production' });
  await app.register(errorHandlerPlugin);
  await app.register(cacheDefaultsPlugin);
  // Limits apply only to routes that declare one (sign-in and token endpoints). Counting is
  // per process, which is right for the single API instance this deployment runs.
  await app.register(rateLimit, { global: false });
  await app.register(csrfPlugin(config.appOrigin));
  await app.register(guard.plugin);

  await app.register(healthRoutes(new HealthService(db, EXPECTED_MIGRATION_COUNT)));

  const auth = new AuthService(db, new AuthRepository(), catalogRepo, sessions, settings, audit);
  const catalog = new CatalogService(db, catalogRepo, settings, audit);
  const unitsRepo = new UnitsRepository();
  const units = new UnitsService(db, unitsRepo, settings, audit);
  const transactions = new TransactionsService(
    db,
    new TransactionsRepository(),
    unitsRepo,
    catalogRepo,
    settings,
    audit,
  );

  const inspections = new InspectionsService(db, new InspectionsRepository(), unitsRepo, audit);
  const alerts = new AlertsService(db, new AlertsRepository(), settings);
  const reports = new ReportsService(db, new ReportsRepository(), alerts);
  const users = new UsersService(
    db,
    new UsersRepository(),
    sessions,
    settings,
    audit,
    config.appOrigin,
  );

  await app.register(
    async (api) => {
      await api.register(authRoutes(auth, guard));
      await api.register(catalogRoutes(catalog, guard));
      await api.register(unitsRoutes(units, guard));
      await api.register(transactionsRoutes(transactions, guard));
      await api.register(inspectionsRoutes(inspections, guard));
      await api.register(reportsRoutes(reports, alerts, guard));
      await api.register(usersRoutes(users, guard));
    },
    { prefix: API_PREFIX },
  );

  return app;
}
