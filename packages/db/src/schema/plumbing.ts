import { bigint, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, primaryId, timestamps, timestamptz } from './columns.js';
import { outboxStatus } from './enums.js';
import { users } from './identity.js';

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: primaryId(),
  ...timestamps(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  key: text('key').notNull(),
  route: text('route').notNull(),
  requestHash: bytea('request_hash').notNull(),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  expiresAt: timestamptz('expires_at').notNull(),
});

export const outbox = pgTable('outbox', {
  id: primaryId(),
  ...timestamps(),
  topic: text('topic').notNull(),
  payload: jsonb('payload').notNull(),
  status: outboxStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamptz('next_attempt_at').notNull().defaultNow(),
  lockedUntil: timestamptz('locked_until'),
  lastError: text('last_error'),
});

// Written only through next_counter(); application roles have no table privilege.
// 'bigint' mode keeps the full 64-bit range exact instead of rounding past 2^53.
export const counters = pgTable('counters', {
  prefix: text('prefix').primaryKey(),
  ...timestamps(),
  value: bigint('value', { mode: 'bigint' }).notNull().default(0n),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  ...timestamps(),
  value: jsonb('value').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
});

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerName: text('worker_name').primaryKey(),
  ...timestamps(),
  beatAt: timestamptz('beat_at').notNull(),
});
