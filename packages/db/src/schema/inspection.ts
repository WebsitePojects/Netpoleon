import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { assets } from './catalog.js';
import { primaryId, timestamps, timestamptz } from './columns.js';
import { conditionGrade, inspectionOutcome } from './enums.js';
import { users } from './identity.js';
import { loanItems } from './lending.js';

export const inspections = pgTable('inspections', {
  id: primaryId(),
  ...timestamps(),
  loanItemId: uuid('loan_item_id').references(() => loanItems.id),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id),
  inspectorUserId: uuid('inspector_user_id')
    .notNull()
    .references(() => users.id),
  condition: conditionGrade('condition').notNull(),
  checklist: jsonb('checklist')
    .notNull()
    .default(sql`'{}'::jsonb`),
  missingAccessories: jsonb('missing_accessories')
    .notNull()
    .default(sql`'[]'::jsonb`),
  notes: text('notes'),
  outcome: inspectionOutcome('outcome').notNull(),
});

export const repairTickets = pgTable('repair_tickets', {
  id: primaryId(),
  ...timestamps(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id),
  openedByUserId: uuid('opened_by_user_id')
    .notNull()
    .references(() => users.id),
  problem: text('problem').notNull(),
  openedAt: timestamptz('opened_at').notNull().defaultNow(),
  closedAt: timestamptz('closed_at'),
  resolution: text('resolution'),
});
