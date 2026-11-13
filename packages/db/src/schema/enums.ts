import { pgEnum } from 'drizzle-orm/pg-core';

export const userKind = pgEnum('user_kind', ['staff', 'partner']);
export const userRole = pgEnum('user_role', [
  'admin',
  'manager',
  'warehouse',
  'auditor',
  'partner_admin',
  'partner_member',
]);
export const userStatus = pgEnum('user_status', ['invited', 'active', 'deactivated']);
export const orgType = pgEnum('org_type', ['partner', 'reseller', 'internal_team', 'branch']);
export const orgStatus = pgEnum('org_status', ['active', 'archived']);
export const assetStatus = pgEnum('asset_status', [
  'registered',
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
  'retired',
  'lost',
]);
export const ownershipType = pgEnum('ownership_type', ['owned', 'vendor_consigned']);
export const requestStatus = pgEnum('request_status', [
  'submitted',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'fulfilled',
]);
export const reservationStatus = pgEnum('reservation_status', [
  'active',
  'needs_reassignment',
  'released',
  'completed',
  'cancelled',
  'expired',
]);
export const movementType = pgEnum('movement_type', [
  'registered',
  'stocked',
  'relocated',
  'released',
  'returned',
  'inspection_started',
  'restocked',
  'sent_to_repair',
  'repaired',
  'retired',
  'marked_lost',
  'found',
]);
export const inspectionOutcome = pgEnum('inspection_outcome', [
  'restock',
  'repair',
  'reassign',
  'retire',
]);
export const conditionGrade = pgEnum('condition_grade', ['a', 'b', 'c', 'd']);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'processing', 'done', 'failed']);
export const authTokenPurpose = pgEnum('auth_token_purpose', ['invite', 'password_reset']);
export const locationKind = pgEnum('location_kind', ['site', 'room', 'shelf']);
export const extensionStatus = pgEnum('extension_status', ['requested', 'approved', 'rejected']);
