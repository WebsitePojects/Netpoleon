import type { Tx } from '@wms/db';
import type { SQL } from 'drizzle-orm';

/*
 * Repositories write SQL with drizzle's `sql` tag: every interpolated value becomes a bound
 * parameter, so no value is ever spliced into the statement text. These helpers only shape
 * the result; the row type is the repository's promise about its own SELECT list.
 */

export async function rows<T>(tx: Tx, query: SQL): Promise<T[]> {
  const result = await tx.execute(query);
  return result.rows as T[];
}

export async function maybeOne<T>(tx: Tx, query: SQL): Promise<T | null> {
  const found = await rows<T>(tx, query);
  return found[0] ?? null;
}

/** For statements that must return exactly one row (an INSERT ... RETURNING, a count). */
export async function one<T>(tx: Tx, query: SQL): Promise<T> {
  const found = await rows<T>(tx, query);
  const first = found[0];
  if (first === undefined) {
    throw new Error('Expected one row, got none');
  }
  return first;
}

export async function rowCount(tx: Tx, query: SQL): Promise<number> {
  const result = await tx.execute(query);
  return result.rowCount ?? 0;
}
