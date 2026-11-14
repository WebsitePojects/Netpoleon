import { is } from 'drizzle-orm';
import {
  getTableConfig,
  getViewConfig,
  isPgView,
  PgColumn,
  PgTable,
  type PgView,
} from 'drizzle-orm/pg-core';
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
const views = schemaExports.filter((exported): exported is PgView => isPgView(exported));

const describeDrizzleColumns = (table: PgTable): ColumnShape[] =>
  getTableConfig(table).columns.map((column) => ({
    name: column.name,
    nullable: !column.notNull,
    // Enums report their type name, timestamps 'timestamp with time zone', and the custom
    // types (citext, bytea, daterange) the name given in columns.ts.
    type: column.getSQLType(),
  }));

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

// Postgres reports every view column as nullable whatever the query guarantees, so a view is
// compared on name and type only. Its notNull flags describe what the view's joins guarantee.
const describeViewColumns = (view: PgView): Omit<ColumnShape, 'nullable'>[] =>
  Object.values(getViewConfig(view).selectedFields).map((field) => {
    if (!is(field, PgColumn)) {
      throw new Error(`View ${getViewConfig(view).name} declares a field that is not a column.`);
    }
    return { name: field.name, type: field.getSQLType() };
  });

/** information_schema's view of a relation's columns, with enums and citext named. */
async function columnsInDatabase(relation: string): Promise<ColumnShape[]> {
  return withClient(getTestDb().migratorUrl, async (client) => {
    // information_schema reports enums, citext and daterange as USER-DEFINED; udt_name
    // carries the real type name, so it is used for those.
    const { rows } = await client.query<ColumnShape>(
      `SELECT column_name AS name,
              is_nullable = 'YES' AS nullable,
              CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE data_type END AS type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [relation],
    );
    return rows;
  });
}

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
      const actual = await columnsInDatabase(name);

      expect(describeDrizzleColumns(table).sort(byName)).toEqual(actual.sort(byName));
    },
  );

  it('declares exactly the views in public', async () => {
    const actual = await withClient(getTestDb().migratorUrl, async (client) => {
      const { rows } = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'public'",
      );
      return rows.map((row) => row.table_name).sort();
    });

    expect(views.map((view) => getViewConfig(view).name).sort()).toEqual(actual);
  });

  it.each(views.map((view) => [getViewConfig(view).name, view] as const))(
    'columns of view %s match name and type',
    async (name, view) => {
      const actual = (await columnsInDatabase(name)).map(({ name: column, type }) => ({
        name: column,
        type,
      }));

      expect(describeViewColumns(view).sort(byName)).toEqual(actual.sort(byName));
    },
  );
});
