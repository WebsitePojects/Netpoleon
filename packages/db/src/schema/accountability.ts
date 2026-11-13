import { sql } from 'drizzle-orm';
import { foreignKey, inet, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { assets, locations } from './catalog.js';
import { createdAt, primaryId, timestamps, timestamptz } from './columns.js';
import { assetStatus, movementType } from './enums.js';
import { users } from './identity.js';
import { loanItems } from './lending.js';

// The whitelist of legal status changes; asset_movements references it so an unlisted move
// is rejected by the database rather than by application code.
export const assetTransitions = pgTable(
  'asset_transitions',
  {
    movementType: movementType('movement_type').notNull(),
    fromStatus: assetStatus('from_status').notNull(),
    toStatus: assetStatus('to_status').notNull(),
  },
  (t) => [primaryKey({ columns: [t.movementType, t.fromStatus, t.toStatus] })],
);

export const assetMovements = pgTable(
  'asset_movements',
  {
    id: primaryId(),
    createdAt: createdAt(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    movementType: movementType('movement_type').notNull(),
    fromStatus: assetStatus('from_status').notNull(),
    toStatus: assetStatus('to_status').notNull(),
    fromLocationId: uuid('from_location_id').references(() => locations.id),
    toLocationId: uuid('to_location_id').references(() => locations.id),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    loanItemId: uuid('loan_item_id').references(() => loanItems.id),
    note: text('note'),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.movementType, t.fromStatus, t.toStatus],
      foreignColumns: [
        assetTransitions.movementType,
        assetTransitions.fromStatus,
        assetTransitions.toStatus,
      ],
    }),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: primaryId(),
  createdAt: createdAt(),
  // Null means the system acted, not a person.
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  changedFields: jsonb('changed_fields')
    .notNull()
    .default(sql`'{}'::jsonb`),
  ip: inet('ip'),
  requestId: text('request_id'),
  occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: primaryId(),
  ...timestamps(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  kind: text('kind').notNull(),
  payload: jsonb('payload')
    .notNull()
    .default(sql`'{}'::jsonb`),
  dedupeKey: text('dedupe_key').notNull(),
  readAt: timestamptz('read_at'),
});
