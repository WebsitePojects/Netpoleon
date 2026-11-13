import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { assets, productModels } from './catalog.js';
import { citext, daterange, primaryId, timestamps, timestamptz } from './columns.js';
import { extensionStatus, requestStatus, reservationStatus } from './enums.js';
import { partnerOrgs, users } from './identity.js';

export const loanRequests = pgTable('loan_requests', {
  id: primaryId(),
  ...timestamps(),
  requestNo: text('request_no').notNull(),
  partnerOrgId: uuid('partner_org_id')
    .notNull()
    .references(() => partnerOrgs.id),
  filedByUserId: uuid('filed_by_user_id')
    .notNull()
    .references(() => users.id),
  contactName: text('contact_name').notNull(),
  contactEmail: citext('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  neededFrom: date('needed_from', { mode: 'string' }).notNull(),
  neededUntil: date('needed_until', { mode: 'string' }).notNull(),
  purpose: text('purpose').notNull(),
  endCustomer: text('end_customer'),
  status: requestStatus('status').notNull().default('submitted'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
  decidedAt: timestamptz('decided_at'),
  decisionNote: text('decision_note'),
});

// Child tables repeat partner_org_id and reference (parent id, partner_org_id) so a child
// can never belong to a different company than its parent.
export const loanRequestItems = pgTable(
  'loan_request_items',
  {
    id: primaryId(),
    ...timestamps(),
    loanRequestId: uuid('loan_request_id').notNull(),
    partnerOrgId: uuid('partner_org_id').notNull(),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id),
    quantityRequested: integer('quantity_requested').notNull(),
    quantityAssigned: integer('quantity_assigned').notNull().default(0),
  },
  (t) => [
    foreignKey({
      columns: [t.loanRequestId, t.partnerOrgId],
      foreignColumns: [loanRequests.id, loanRequests.partnerOrgId],
    }),
  ],
);

export const reservations = pgTable('reservations', {
  id: primaryId(),
  ...timestamps(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id),
  loanRequestItemId: uuid('loan_request_item_id')
    .notNull()
    .references(() => loanRequestItems.id),
  period: daterange('period').notNull(),
  status: reservationStatus('status').notNull().default('active'),
});

export const loans = pgTable(
  'loans',
  {
    id: primaryId(),
    ...timestamps(),
    loanNo: text('loan_no').notNull(),
    loanRequestId: uuid('loan_request_id').notNull(),
    partnerOrgId: uuid('partner_org_id').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: citext('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    releasedByUserId: uuid('released_by_user_id')
      .notNull()
      .references(() => users.id),
    releasedAt: timestamptz('released_at').notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    closedAt: timestamptz('closed_at'),
    isBackdated: boolean('is_backdated').notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.loanRequestId, t.partnerOrgId],
      foreignColumns: [loanRequests.id, loanRequests.partnerOrgId],
    }),
  ],
);

export const loanItems = pgTable(
  'loan_items',
  {
    id: primaryId(),
    ...timestamps(),
    loanId: uuid('loan_id').notNull(),
    partnerOrgId: uuid('partner_org_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    reservationId: uuid('reservation_id').references(() => reservations.id),
    releasedAt: timestamptz('released_at').notNull(),
    returnedAt: timestamptz('returned_at'),
    accessoriesOut: jsonb('accessories_out')
      .notNull()
      .default(sql`'[]'::jsonb`),
    accessoriesBack: jsonb('accessories_back'),
  },
  (t) => [
    foreignKey({
      columns: [t.loanId, t.partnerOrgId],
      foreignColumns: [loans.id, loans.partnerOrgId],
    }),
  ],
);

export const loanExtensions = pgTable(
  'loan_extensions',
  {
    id: primaryId(),
    ...timestamps(),
    loanId: uuid('loan_id').notNull(),
    partnerOrgId: uuid('partner_org_id').notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    requestedDueDate: date('requested_due_date', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    status: extensionStatus('status').notNull().default('requested'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decidedAt: timestamptz('decided_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.loanId, t.partnerOrgId],
      foreignColumns: [loans.id, loans.partnerOrgId],
    }),
  ],
);
