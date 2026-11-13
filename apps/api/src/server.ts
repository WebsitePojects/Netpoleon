import { ConfigError, loadConfig, type AppConfig } from '@wms/config';
import { Database } from '@wms/db';
import { buildApp } from './app.js';
import { createLogger } from './logging.js';
import { ShutdownCoordinator } from './shutdown.js';

const FORCE_EXIT_AFTER_MS = 10_000;

// Prints variable names only: a value can be a connection string with a password in it.
function readConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Invalid configuration. Fix: ${error.invalidKeys.join(', ')}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = readConfigOrExit();
  const logger = createLogger(config.logLevel);
  const db = new Database(config.db, (err) => logger.error({ err }, 'database pool error'));

  try {
    const app = await buildApp({ config, db, logger });
    new ShutdownCoordinator(app, db, logger, FORCE_EXIT_AFTER_MS).register();
    await app.listen({ host: config.apiHost, port: config.apiPort });
  } catch (err) {
    logger.fatal({ err }, 'failed to start');
    await db.close().catch(() => undefined);
    process.exit(1);
  }
}

await main();
