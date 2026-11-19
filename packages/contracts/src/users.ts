import { z } from 'zod';
import {
  emailSchema,
  idSchema,
  NAME_MAX,
  phoneSchema,
  queryList,
  searchSchema,
  SHORT_TEXT_MAX,
  text,
  timestampSchema,
  usernameSchema,
  userRefSchema,
  userStatusSchema,
  USER_STATUSES,
} from './common.js';
import { cursorPaged, pageQuery, paged } from './pagination.js';
import { STAFF_ROLES, roleSchema, staffRoleSchema } from './permissions.js';

export const userSchema = z.object({
  id: idSchema,
  username: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  role: roleSchema,
  status: userStatusSchema,
  lastLoginAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

export const USER_SORTS = ['name', 'username', 'role', 'lastLoginAt'] as const;
export const listUsersQuery = pageQuery(USER_SORTS).extend({
  q: searchSchema.optional(),
  role: queryList(STAFF_ROLES).optional(),
  status: queryList(USER_STATUSES).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export const listUsersResponse = paged(userSchema);

/** Console users only (staff roles). The person is created `invited` and sets a password via link. */
export const createUserBody = z.strictObject({
  username: usernameSchema,
  name: text(NAME_MAX),
  email: emailSchema,
  phone: phoneSchema.nullable().default(null),
  title: text(SHORT_TEXT_MAX).nullable().default(null),
  role: staffRoleSchema,
});
export type CreateUserBody = z.infer<typeof createUserBody>;

export const updateUserBody = z
  .strictObject({
    username: usernameSchema,
    name: text(NAME_MAX),
    email: emailSchema,
    phone: phoneSchema.nullable(),
    title: text(SHORT_TEXT_MAX).nullable(),
    role: staffRoleSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { error: 'must change at least one field' });
export type UpdateUserBody = z.infer<typeof updateUserBody>;

/**
 * A one-time link (plan R9): an invitation for an invited user, a password reset for an active
 * one. Shown once to the admin, never stored in a replayable response and never logged.
 */
export const accessLinkResponse = z.object({
  url: z.url(),
  purpose: z.enum(['invite', 'password_reset']),
  expiresAt: timestampSchema,
});
export type AccessLink = z.infer<typeof accessLinkResponse>;

// ---------------------------------------------------------------------------------------------
// Audit trail: append-only, newest first, read with "load more" (keyset).
// ---------------------------------------------------------------------------------------------

export const auditEntrySchema = z.object({
  id: idSchema,
  at: timestampSchema,
  actor: userRefSchema.nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: idSchema.nullable(),
  /** Field name -> value; null where the value is withheld (personal or secret). */
  fields: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** `actor=me` is open to every role (their own activity); anything else needs `audit.read`. */
export const listAuditQuery = z.strictObject({
  cursor: z.string().min(1).max(200).optional(),
  limit: z
    .union([z.int(), z.string().regex(/^[0-9]+$/)])
    .transform(Number)
    .pipe(z.int().min(1).max(100))
    .default(50),
  actor: z.union([z.literal('me'), idSchema]).optional(),
  targetType: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
  targetId: idSchema.optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuery>;
export const listAuditResponse = cursorPaged(auditEntrySchema);
