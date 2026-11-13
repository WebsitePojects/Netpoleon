import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/schema/index.js';
import { getTestDb, withClient } from './helpers.js';

interface ColumnShape {
  name: string;
  nullable: boolean;
  type: string;
}

// The schema module also exports enums; only its tables are compared.
const schemaExports: unknown[] = Object.values(schema);
const tables = schemaExports.filter((exported): exported is PgTable => is(exported, PgTable));

const describeDrizzleColumns = (table: PgTable): ColumnShape[] =>
  getTableConfig(table).columns.map((column) => ({
    name: column.name,
    nullable: !column.notNull,
    // Enums report their type name, timestamps 'timestamp with time zone', and the custom
    // types (citext, bytea, daterange) the name given in columns.ts.
    type: column.getSQLType(),
  }));

const byName = (a: ColumnShape, b: ColumnShape) => a.name.localeCompare(b.name);

describe('typed schema matches the migrated database', () => {
  it('declares exactly the base tables in public, except schema_migrations', async () => {
    const actual = await withClient(getTestDb().migratorUrl, async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name <> 'schema_migrations'`,
      );
      return rows.map((row) => row.table_name).sort();
    });

    expect(tables.map((table) => getTableConfig(table).name).sort()).toEqual(actual);
  });

  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    'columns of %s match name, nullability and type',
    async (name, table) => {
      const actual = await withClient(getTestDb().migratorUrl, async (client) => {
        // information_schema reports enums, citext and daterange as USER-DEFINED; udt_name
        // carries the real type name, so it is used for those.
        const { rows } = await client.query<ColumnShape>(
          `SELECT column_name AS name,
                  is_nullable = 'YES' AS nullable,
                  CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE data_type END AS type
             FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1`,
          [name],
        );
        return rows;
      });

      expect(describeDrizzleColumns(table).sort(byName)).toEqual(actual.sort(byName));
    },
  );
});
