import type { ClientBase } from 'pg';
import { DEMO_PASSWORD, SEED_MARKER_EMAIL } from './dataset.js';
import { SeedRefusedError } from './environment.js';
import { buildSeedPlan } from './plan.js';
import type { SeedPlan } from './rows.js';
import { SeedWriter } from './writer.js';

// One fixed key, so two seeds started together queue up and the second sees the first's data.
const LOCK_NAME = 'wms.dev-seed';

export type SeedOutcome = { kind: 'seeded' } | { kind: 'already-seeded' };

/**
 * Loads the development dataset into an empty database, all of it in one transaction or none
 * of it. Running it again is a no-op: the seed recognises its own admin and changes nothing.
 * A database that holds anything else is refused rather than mixed with demo rows.
 */
export class DevSeeder {
  private readonly client: ClientBase;
  private readonly hashPassword: (plain: string) => Promise<string>;

  constructor(client: ClientBase, hashPassword: (plain: string) => Promise<string>) {
    this.client = client;
    this.hashPassword = hashPassword;
  }

  /** `now` is read once by the caller; every date in the dataset is relative to it. */
  async run(now: Date): Promise<SeedOutcome> {
    const outcome = await this.loadOnce(now);
    if (outcome.kind === 'seeded') {
      // Thousands of rows just arrived in tables the planner believes are empty; until
      // autovacuum gets round to them it picks sequential scans inside the transaction_overview
      // view (measured: 44 ms instead of 5 ms for a full count at seed scale).
      await this.client.query('ANALYZE');
    }
    return outcome;
  }

  private async loadOnce(now: Date): Promise<SeedOutcome> {
    await this.client.query('BEGIN');
    try {
      await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [LOCK_NAME]);
      const state = await this.databaseState();
      if (state === 'seeded') {
        await this.client.query('ROLLBACK');
        return { kind: 'already-seeded' };
      }
      if (state === 'other-data') {
        throw new SeedRefusedError(
          'The database already holds users, units, locations or requests that are not the ' +
            'development seed. Seed an empty, freshly migrated database instead.',
        );
      }
      const plan = buildSeedPlan(now);
      await new SeedWriter(this.client).write(plan, await this.passwordHashes(plan));
      await this.client.query('COMMIT');
      return { kind: 'seeded' };
    } catch (error) {
      // If the connection died the rollback fails too; the original error is the one to report.
      await this.client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }

  /** Reference data from the migrations (categories, settings, the lifecycle) does not count. */
  private async databaseState(): Promise<'empty' | 'seeded' | 'other-data'> {
    const { rows } = await this.client.query<{ seeded: boolean; has_data: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1) AS seeded,
              EXISTS (SELECT 1 FROM users)
                OR EXISTS (SELECT 1 FROM partner_orgs)
                OR EXISTS (SELECT 1 FROM product_models)
                OR EXISTS (SELECT 1 FROM locations)
                OR EXISTS (SELECT 1 FROM assets)
                OR EXISTS (SELECT 1 FROM loan_requests) AS has_data`,
      [SEED_MARKER_EMAIL],
    );
    const row = rows[0];
    if (row?.seeded) {
      return 'seeded';
    }
    return row?.has_data ? 'other-data' : 'empty';
  }

  /** One hash per account, each with its own salt. */
  private async passwordHashes(plan: SeedPlan): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    for (const user of plan.staffUsers) {
      hashes.set(user.username, await this.hashPassword(DEMO_PASSWORD));
    }
    return hashes;
  }
}

export interface SeedSummary {
  tables: Record<string, number>;
  assetsByStatus: Record<string, number>;
  transactionsByStage: Record<string, number>;
}

const SUMMARY_TABLES = [
  'locations',
  'product_models',
  'model_accessories',
  'partner_orgs',
  'users',
  'assets',
  'asset_movements',
  'loan_requests',
  'loan_request_items',
  'reservations',
  'loans',
  'loan_items',
  'loan_extensions',
  'inspections',
  'repair_tickets',
  'audit_log',
] as const;

/** Row counts after a run, for the operator and for tests. */
export async function summarise(client: ClientBase): Promise<SeedSummary> {
  // The table names are the constants above, so building the statement from them is safe.
  const counts = SUMMARY_TABLES.map(
    (table) => `SELECT '${table}' AS name, count(*)::int AS n FROM ${table}`,
  ).join(' UNION ALL ');
  const tables = await client.query<{ name: string; n: number }>(counts);
  const statuses = await client.query<{ name: string; n: number }>(
    'SELECT status::text AS name, count(*)::int AS n FROM assets GROUP BY 1 ORDER BY 1',
  );
  const stages = await client.query<{ name: string; n: number }>(
    'SELECT stage::text AS name, count(*)::int AS n FROM transaction_overview GROUP BY 1 ORDER BY 1',
  );
  const toRecord = (rows: { name: string; n: number }[]) =>
    Object.fromEntries(rows.map((row) => [row.name, row.n]));
  return {
    tables: toRecord(tables.rows),
    assetsByStatus: toRecord(statuses.rows),
    transactionsByStage: toRecord(stages.rows),
  };
}
