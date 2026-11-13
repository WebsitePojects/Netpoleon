import type { Database } from '@wms/db';

const PING_TIMEOUT_MS = 1000;

export class HealthService {
  constructor(
    private readonly db: Database,
    private readonly expectedMigrations: number,
  ) {}

  /** Ready means the database answers and every migration this build needs has been applied. */
  async isReady(): Promise<boolean> {
    if (!(await this.db.ping(PING_TIMEOUT_MS))) {
      return false;
    }
    return this.db.migrationsCurrent(this.expectedMigrations);
  }
}
