import { loadConfig, type AppConfig } from '@wms/config';
import { Database } from '@wms/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { buildApp } from '../src/app.js';
import { createLogger } from '../src/logging.js';

export const CLOSED_PORT_URL = 'postgres://x:y@127.0.0.1:1/x';

export interface DatabaseUrls {
  staffUrl: string;
  partnerUrl: string;
}

export interface TestAppOptions {
  urls: DatabaseUrls;
  nodeEnv?: 'test' | 'production';
  /** Adds routes that exist only in tests; runs before the app is ready. */
  registerRoutes?: (app: FastifyInstance, db: Database) => void;
  /** Receives the text of every statement the app runs inside a transaction. */
  onQuery?: (text: string) => void;
}

export interface TestApp {
  app: FastifyInstance;
  /** Every log line the app wrote, newest last. */
  logLines: string[];
}

export function configFor(urls: DatabaseUrls, nodeEnv: 'test' | 'production' = 'test'): AppConfig {
  return loadConfig({
    NODE_ENV: nodeEnv,
    APP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL_STAFF: urls.staffUrl,
    DATABASE_URL_PARTNER: urls.partnerUrl,
    LOG_LEVEL: 'debug',
  });
}

/** Test-only routes: a body-validating POST and a route that throws an unexpected error. */
export function registerProbeRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.post(
    '/probe/echo',
    { schema: { body: z.strictObject({ name: z.string() }) } },
    (request) => ({ name: request.body.name }),
  );
  app.get('/probe/throw', () => {
    throw new Error('pg password=hunter2');
  });
  app.get('/probe/log-secrets', (request) => {
    request.log.info({ session: { token: 'tok-secret-9', password: 'pw-secret-9' } }, 'probe');
    return { ok: true };
  });
}

/** Builds apps with real Database objects and closes every one of them after the test. */
export class TestApps {
  private readonly open: { app: FastifyInstance; db: Database }[] = [];

  async create(options: TestAppOptions): Promise<TestApp> {
    const config = configFor(options.urls, options.nodeEnv);
    const logLines: string[] = [];
    const logger = createLogger('debug', { write: (line: string) => void logLines.push(line) });
    // A pool error here would be a test bug; surfacing it as a log line keeps it visible.
    const db = new Database(
      config.db,
      (err) => logger.error({ err }, 'database pool error'),
      options.onQuery ? { onQuery: options.onQuery } : {},
    );

    const app = await buildApp({ config, db, logger });
    this.open.push({ app, db });
    options.registerRoutes?.(app, db);
    return { app, logLines };
  }

  async closeAll(): Promise<void> {
    const pending = this.open.splice(0);
    for (const { app, db } of pending) {
      await app.close();
      await db.close();
    }
  }
}
