import { z } from 'zod';
import { MAX_PAGE_SIZE } from './pagination.js';
import { STAFF_ROLES } from './permissions.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const USER_STATUSES = ['invited', 'active', 'deactivated'] as const;

export const userSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(STAFF_ROLES),
  status: z.enum(USER_STATUSES),
  lastLoginAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type User = z.infer<typeof userSchema>;

export const inviteUserBodySchema = z.strictObject({
  email,
  fullName: text(120),
  role: z.enum(STAFF_ROLES),
  jobTitle: optionalText(120).default(null),
  phone: optionalText(40).default(null),
});
export type InviteUserBody = z.infer<typeof inviteUserBodySchema>;

export const editUserBodySchema = z
  .strictObject({
    email,
    fullName: text(120),
    role: z.enum(STAFF_ROLES),
    jobTitle: optionalText(120),
    phone: optionalText(40),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Change at least one field');
export type EditUserBody = z.infer<typeof editUserBodySchema>;

export const idParamsSchema = z.strictObject({ id: z.uuid() });

export const PARTNER_TYPES = ['partner', 'reseller', 'internal_team', 'branch'] as const;

export const contactSchema = z.strictObject({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

export const partnerSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(PARTNER_TYPES),
  status: z.enum(['active', 'archived']),
  createdAt: z.iso.datetime({ offset: true }),
  contacts: z.array(contactSchema),
  loans: z.number().int(),
  openLoans: z.number().int(),
});
export type Partner = z.infer<typeof partnerSchema>;

export const partnerBodySchema = z.strictObject({ name: text(120), type: z.enum(PARTNER_TYPES) });
export const editPartnerBodySchema = partnerBodySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Change at least one field');

export const contactBodySchema = z.strictObject({
  fullName: text(120),
  email,
  phone: z.string().trim().max(40).default(''),
});

export const contactParamsSchema = z.strictObject({ id: z.uuid(), contactId: z.uuid() });

export const auditEntrySchema = z.strictObject({
  id: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.uuid().nullable(),
  changedFields: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  /** Free text over the action, the record type, the person's name and the changed fields. */
  q: z.string().trim().max(80).optional(),
  actorId: z.uuid().optional(),
  action: z
    .string()
    .regex(/^[a-z_.]{2,60}$/)
    .optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});
