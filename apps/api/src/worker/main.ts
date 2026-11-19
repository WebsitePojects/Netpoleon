import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { ConfigError, loadConfig, type AppConfig } from '@wms/config';
import { Database } from '@wms/db';
import { sql } from 'drizzle-orm';
import { createLogger } from '../logging.js';
import { createMailer } from '../platform/mailer.js';
import { SettingsService } from '../platform/settings.js';
import { OutboxDispatcher } from './dispatcher.js';
import { mailHandlers } from './handlers.js';
import { runJob, scheduledJobs } from './jobs.js';

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

/**
 * The background process: delivers the outbox, runs the scheduled jobs and writes a heartbeat
 * (spec section 8). Same image as the API, different command. On SIGTERM it finishes the step
 * in hand and exits; a row it had claimed but not finished comes back when its lease runs out.
 */
async function main(): Promise<void> {
  const config = readConfigOrExit();
  const logger = createLogger(config.logLevel);
  const db = new Database(config.db, (err) => logger.error({ err }, 'database pool error'));
  const settings = new SettingsService(db);
  const dispatcher = new OutboxDispatcher(
    db,
    mailHandlers(db, createMailer(config.mail, logger), config.appOrigin),
    logger,
  );
  const jobs = scheduledJobs(settings);
  const lastRun = new Map<string, number>();
  const name = config.worker.name ?? hostname();

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      stopping = true;
      logger.info({ signal }, 'worker stopping after the current step');
    });
  }

  logger.info({ worker: name }, 'worker started');
  while (!stopping) {
    try {
      // Drain the outbox before sleeping, so a burst of mail goes out in one pass.
      while (!stopping && (await dispatcher.runOnce()) > 0);
      for (const job of jobs) {
        if (stopping) break;
        if (Date.now() - (lastRun.get(job.name) ?? 0) < job.everyMs) continue;
        lastRun.set(job.name, Date.now());
        const result = await runJob(db, job);
        if (result) logger.info({ job: job.name, ...result }, 'job ran');
      }
      await db.transaction({ kind: 'system' }, (tx) =>
        tx.execute(sql`INSERT INTO worker_heartbeats (worker_name, beat_at) VALUES (${name}, now())
                       ON CONFLICT (worker_name) DO UPDATE SET beat_at = now()`),
      );
    } catch (err) {
      // One failed pass must not kill the worker: log it, wait, try again.
      logger.error({ err }, 'worker pass failed');
    }
    await delay(config.worker.pollIntervalMs);
  }
  await db.close();
  logger.info('worker stopped');
}

await main();
