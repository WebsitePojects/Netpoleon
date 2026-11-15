import { z } from 'zod';
import { MAX_PASSWORD_LENGTH } from './passwords.js';
import { PARTNER_ROLES, STAFF_ROLES } from './permissions.js';

/** Sent on every mutating request; a cross-site form cannot set it without a CORS preflight. */
export const CLIENT_HEADER = 'x-wms-client';
export const SESSION_COOKIE = 'wms_session';

const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
// The rule (length, common passwords) is checked by the service so the message is specific;
// the schema only bounds the size.
const password = z.string().min(1).max(MAX_PASSWORD_LENGTH);
// Tokens are 32 random bytes as base64url: exactly 43 characters.
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const loginBodySchema = z.strictObject({
  email,
  password,
  remember: z.boolean().default(false),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const forgotPasswordBodySchema = z.strictObject({ email });

export const setPasswordBodySchema = z.strictObject({ token, password });
export type SetPasswordBody = z.infer<typeof setPasswordBodySchema>;

export const changePasswordBodySchema = z.strictObject({
  currentPassword: password,
  newPassword: password,
});

export const tokenPurposeSchema = z.enum(['invite', 'password_reset']);
export type TokenPurpose = z.infer<typeof tokenPurposeSchema>;

export const tokenParamsSchema = z.strictObject({ purpose: tokenPurposeSchema, token });

export const sessionUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  kind: z.enum(['staff', 'partner']),
  role: z.enum([...STAFF_ROLES, ...PARTNER_ROLES]),
  partnerOrgId: z.uuid().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** What a single-use link reveals to whoever holds it: whose account it opens, nothing more. */
export const tokenOwnerSchema = z.strictObject({
  fullName: z.string(),
  email: z.string(),
});
export type TokenOwner = z.infer<typeof tokenOwnerSchema>;
