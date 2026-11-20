import { inet, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, citext, createdAt, primaryId, timestamps, timestamptz } from './columns.js';
import { authTokenPurpose, orgStatus, orgType, userKind, userRole, userStatus } from './enums.js';

export const partnerOrgs = pgTable('partner_orgs', {
  id: primaryId(),
  ...timestamps(),
  name: text('name').notNull(),
  type: orgType('type').notNull(),
  status: orgStatus('status').notNull().default('active'),
});

/** People at a borrowing company (0012). Requests copy these details; history never reads here. */
export const partnerContacts = pgTable('partner_contacts', {
  id: primaryId(),
  ...timestamps(),
  partnerOrgId: uuid('partner_org_id')
    .notNull()
    .references(() => partnerOrgs.id),
  fullName: text('full_name').notNull(),
  email: citext('email').notNull(),
  phone: text('phone').notNull(),
  lastUsedAt: timestamptz('last_used_at'),
});

export const users = pgTable('users', {
  id: primaryId(),
  ...timestamps(),
  email: citext('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  kind: userKind('kind').notNull(),
  role: userRole('role').notNull(),
  // Null for staff; a CHECK in the migration ties it to kind and role.
  partnerOrgId: uuid('partner_org_id').references(() => partnerOrgs.id),
  status: userStatus('status').notNull().default('invited'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamptz('locked_until'),
  lastLoginAt: timestamptz('last_login_at'),
  // Lower-case sign-in name (CHECK in 0011). Null for partners, who sign in by email; the API
  // requires it for staff.
  username: citext('username'),
  title: text('title'),
});

export const sessions = pgTable('sessions', {
  id: primaryId(),
  createdAt: createdAt(),
  tokenHash: bytea('token_hash').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  idleExpiresAt: timestamptz('idle_expires_at').notNull(),
  absoluteExpiresAt: timestamptz('absolute_expires_at').notNull(),
  revokedAt: timestamptz('revoked_at'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
});

export const authTokens = pgTable('auth_tokens', {
  id: primaryId(),
  createdAt: createdAt(),
  tokenHash: bytea('token_hash').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  purpose: authTokenPurpose('purpose').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  usedAt: timestamptz('used_at'),
});
