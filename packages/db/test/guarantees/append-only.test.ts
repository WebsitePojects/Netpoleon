import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const INSUFFICIENT_PRIVILEGE = '42501';
const HISTORY_REWRITE = 'WM003';

const TABLES = ['asset_movements', 'audit_log'] as const;

const ATTACKS: Array<[string, (table: string) => string]> = [
  ['UPDATE', (table) => `UPDATE ${table} SET created_at = created_at`],
  ['DELETE', (table) => `DELETE FROM ${table}`],
  ['TRUNCATE', (table) => `TRUNCATE ${table}`],
];

describe('history cannot be rewritten', () => {
  let fixtures: Fixtures;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    // Row-level triggers only fire when a row matches, so both tables need at least one.
    const actorId = await fixtures.staffUser();
    const modelId = await fixtures.productModel();
    await fixtures.asset(modelId, actorId);
    await fixtures.auditEntry(actorId);
  });

  afterAll(async () => {
    await fixtures.close();
  });

  describe.each(TABLES)('%s', (table) => {
    it.each(ATTACKS)('staff %s is refused with 42501', async (_operation, statement) => {
      const state = await inRolledBackTransaction(getTestDb().staffUrl, {}, (client) =>
        sqlState(() => client.query(statement(table))),
      );

      expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it.each(ATTACKS)(
      'the owning migrator is stopped by the trigger on %s with WM003',
      async (_operation, statement) => {
        // Rolled back, so if the trigger were missing the shared history would survive.
        const state = await inRolledBackTransaction(getTestDb().migratorUrl, {}, (client) =>
          sqlState(() => client.query(statement(table))),
        );

        expect(state).toBe(HISTORY_REWRITE);
      },
    );
  });
});
