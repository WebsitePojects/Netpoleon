import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

// Postgres types Drizzle has no builder for. The dataType string is what the drift test
// and any introspection see, so it must name the real Postgres type.
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
// node-postgres returns ranges as text such as '[2026-01-01,2026-01-05)'; parsing is the
// repository's job so the half-open convention stays in one place.
export const daterange = customType<{ data: string }>({ dataType: () => 'daterange' });

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// uuidv7 keeps primary keys roughly time-ordered, which keeps btree inserts append-mostly.
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});
