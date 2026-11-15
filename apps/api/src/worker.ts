import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { ConfigError, loadConfig } from '@wms/config';
import { Database } from '@wms/db';
import { createLogger } from './logging.js';
import { OutboxDispatcher } from './worker/dispatcher.js';
import { beat, CLEANUP_JOBS, runExclusive } from './worker/jobs.js';
import { LogMailer } from './worker/mailer.js';

const POLL_MS = 5_000;
const JOBS_EVERY_MS = 10 * 60_000;

/**
 * The worker process: same image as the API, started with a different command. It delivers
 * the outbox, runs the cleanup jobs and writes a heartbeat so a stalled worker can be noticed.
 */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Invalid configuration. Fix: ${error.invalidKeys.join(', ')}\n`);
      process.exit(1);
    }
    throw error;
  }
  const logger = createLogger(config.logLevel);
  const db = new Database(config.db, (err) => logger.error({ err }, 'database pool error'));
  const dispatcher = new OutboxDispatcher(
    db,
    new LogMailer(logger, config.nodeEnv === 'production'),
    logger,
  );
  const name = `worker@${hostname()}`;

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  let jobsDueAt = 0;
  logger.info({ worker: name }, 'worker started');
  while (!stopping) {
    try {
      await beat(db, name);
      // Drain what is due before sleeping, but finish the current batch on shutdown.
      while (!stopping && (await dispatcher.runOnce()) > 0);
      if (Date.now() >= jobsDueAt) {
        for (const job of CLEANUP_JOBS) {
          const removed = await runExclusive(db, job);
          if (removed) logger.info({ job: job.name, removed }, 'cleanup job ran');
        }
        jobsDueAt = Date.now() + JOBS_EVERY_MS;
      }
    } catch (err) {
      logger.error({ err }, 'worker loop failed; retrying');
    }
    if (!stopping) await delay(POLL_MS);
  }
  logger.info('worker stopping');
  await db.close();
}

await main();
