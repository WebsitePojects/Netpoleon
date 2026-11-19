import { z } from 'zod';
import { categorySchema, locationSchema, modelSchema } from './catalog.js';
import {
  dateKeySchema,
  EMAIL_MAX,
  idSchema,
  NAME_MAX,
  newPasswordSchema,
  PASSWORD_MAX,
  phoneSchema,
  SHORT_TEXT_MAX,
  text,
  timestampSchema,
  tokenSchema,
} from './common.js';
import { actionSchema, roleSchema } from './permissions.js';
import { settingsResponse } from './settings.js';

/**
 * Sign in by username or email (plan D1). The password is never trimmed or lower-cased, and is
 * only length-checked here: the 12-character rule applies when a password is SET, so an
 * account created before a rule change can still sign in and be asked to change it.
 */
export const loginBody = z.strictObject({
  identifier: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX),
  password: z.string().min(1).max(PASSWORD_MAX),
  remember: z.boolean().default(false),
});
export type LoginBody = z.infer<typeof loginBody>;

export const sessionUserSchema = z.object({
  id: idSchema,
  username: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  title: z.string().nullable(),
  role: roleSchema,
  lastLoginAt: timestampSchema.nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * Everything the console needs before it can draw a page, in one request: who is signed in,
 * what they may do, the settings and the small reference lists. `serverDate` is "today" in
 * Asia/Manila, so the browser never decides what day it is.
 */
export const bootstrapResponse = z.object({
  user: sessionUserSchema,
  permissions: z.array(actionSchema),
  settings: settingsResponse,
  categories: z.array(categorySchema),
  locations: z.array(locationSchema),
  models: z.array(modelSchema),
  serverDate: dateKeySchema,
});
export type Bootstrap = z.infer<typeof bootstrapResponse>;

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: newPasswordSchema,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

export const updateProfileBody = z
  .strictObject({
    name: text(NAME_MAX),
    phone: phoneSchema.nullable(),
    title: text(SHORT_TEXT_MAX).nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { error: 'must change at least one field' });
export type UpdateProfileBody = z.infer<typeof updateProfileBody>;

/** Always answered 202, whether or not the account exists, so the form cannot probe for one. */
export const forgotPasswordBody = z.strictObject({
  identifier: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX),
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBody>;

/** Used by both the invitation page and the reset page: a single-use token plus a new password. */
export const setPasswordWithTokenBody = z.strictObject({
  token: tokenSchema,
  password: newPasswordSchema,
});
export type SetPasswordWithTokenBody = z.infer<typeof setPasswordWithTokenBody>;
