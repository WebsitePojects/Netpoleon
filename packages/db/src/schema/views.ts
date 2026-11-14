import { boolean, date, integer, pgView, text, uuid } from 'drizzle-orm/pg-core';
import { citext, timestamptz } from './columns.js';
import { orgType, requestStatus, transactionStage } from './enums.js';

/**
 * One row per loan request with its computed stage: the console's "transaction" (plan D3, R3).
 * Defined in migration 0011 with security_invoker, so the caller's grants and row-level
 * security apply. Read-only, and granted to wms_staff only.
 *
 * `.notNull()` marks what the view's joins guarantee; Postgres itself reports every view column
 * as nullable, so the drift test compares names and types only. Names of people are nullable
 * because a caller's policies may hide that person.
 */
export const transactionOverview = pgView('transaction_overview', {
  requestId: uuid('request_id').notNull(),
  requestNo: text('request_no').notNull(),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
  partnerOrgId: uuid('partner_org_id').notNull(),
  partnerOrgName: text('partner_org_name').notNull(),
  partnerOrgType: orgType('partner_org_type').notNull(),
  contactName: text('contact_name').notNull(),
  contactEmail: citext('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  endCustomer: text('end_customer'),
  purpose: text('purpose').notNull(),
  neededFrom: date('needed_from', { mode: 'string' }).notNull(),
  neededUntil: date('needed_until', { mode: 'string' }).notNull(),
  // Null only for a request filed without any line, which the API never creates.
  productModelId: uuid('product_model_id'),
  brand: text('brand'),
  modelName: text('model_name'),
  categoryId: uuid('category_id'),
  categoryCode: text('category_code'),
  categoryName: text('category_name'),
  modelCount: integer('model_count').notNull(),
  quantityRequested: integer('quantity_requested').notNull(),
  quantityAssigned: integer('quantity_assigned').notNull(),
  filedByUserId: uuid('filed_by_user_id').notNull(),
  filedByName: text('filed_by_name'),
  requestStatus: requestStatus('request_status').notNull(),
  decidedByUserId: uuid('decided_by_user_id'),
  decidedByName: text('decided_by_name'),
  decidedAt: timestamptz('decided_at'),
  decisionNote: text('decision_note'),
  loanId: uuid('loan_id'),
  loanNo: text('loan_no'),
  releasedAt: timestamptz('released_at'),
  releasedByUserId: uuid('released_by_user_id'),
  releasedByName: text('released_by_name'),
  // The loan's own due date; due_date is the current one after approved extensions.
  originalDueDate: date('original_due_date', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }),
  closedAt: timestamptz('closed_at'),
  itemsReleased: integer('items_released').notNull(),
  itemsReturned: integer('items_returned').notNull(),
  stage: transactionStage('stage').notNull(),
  // A unit is still out and the current due date is before today in Asia/Manila.
  isOverdue: boolean('is_overdue').notNull(),
}).existing();
