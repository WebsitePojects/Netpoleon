import type { Database } from '@wms/db';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/**
 * Drains in-flight requests before the pools close, and gives up after a deadline so a stuck
 * connection cannot keep a deploy waiting forever.
 */
export class ShutdownCoordinator {
  private shuttingDown = false;

  constructor(
    private readonly app: FastifyInstance,
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly forceExitAfterMs: number,
  ) {}

  register(): void {
    for (const signal of SIGNALS) {
      process.once(signal, () => void this.shutdown(signal));
    }
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    this.logger.info({ signal }, 'shutting down');

    const deadline = setTimeout(() => {
      this.logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, this.forceExitAfterMs);
    deadline.unref();

    // Each step runs even if the previous one failed, so a failed drain still releases the pools.
    const serverClosed = await this.attempt('close http server', () => this.app.close());
    const poolsClosed = await this.attempt('close database pools', () => this.db.close());
    process.exit(serverClosed && poolsClosed ? 0 : 1);
  }

  private async attempt(step: string, action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (err) {
      this.logger.error({ err }, `shutdown step failed: ${step}`);
      return false;
    }
  }
}
