import { z } from 'zod';
import {
  companyRefSchema,
  countSchema,
  emailSchema,
  idSchema,
  NAME_MAX,
  ORG_STATUSES,
  ORG_TYPES,
  orgStatusSchema,
  orgTypeSchema,
  phoneSchema,
  queryInt,
  queryList,
  searchSchema,
  text,
  timestampSchema,
} from './common.js';
import { pageQuery, paged } from './pagination.js';

/** A borrowing company (`partner_orgs`). Every request points at one (plan R1). */
export const partnerSchema = companyRefSchema.extend({ status: orgStatusSchema });
export type Partner = z.infer<typeof partnerSchema>;

/**
 * Name suggestions for the request form's company box. Without `q` the most recently used
 * companies come back; archived companies are never suggested.
 */
export const listPartnersQuery = z.strictObject({
  q: searchSchema.optional(),
  limit: queryInt(1, 20).default(10),
});
export type ListPartnersQuery = z.infer<typeof listPartnersQuery>;

export const listPartnersResponse = z.array(partnerSchema);

// ---------------------------------------------------------------------------------------------
// Partner directory: every company with its activity, and the people Netpoleon deals with there.
// ---------------------------------------------------------------------------------------------

/** A saved contact. Requests copy these details when filed, so editing one rewrites no history. */
export const partnerContactSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  lastUsedAt: timestampSchema.nullable(),
});
export type PartnerContact = z.infer<typeof partnerContactSchema>;

/** One directory row. `openRequests` are filed or approved and not yet released. */
export const partnerSummarySchema = partnerSchema.extend({
  contactCount: countSchema,
  requestCount: countSchema,
  openRequests: countSchema,
  unitsOut: countSchema,
  lastActivityAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type PartnerSummary = z.infer<typeof partnerSummarySchema>;

export const PARTNER_SORTS = ['name', 'type', 'unitsOut', 'lastActivityAt'] as const;
export const listDirectoryQuery = pageQuery(PARTNER_SORTS).extend({
  q: searchSchema.optional(),
  type: queryList(ORG_TYPES).optional(),
  status: queryList(ORG_STATUSES).optional(),
});
export type ListDirectoryQuery = z.infer<typeof listDirectoryQuery>;
export const listDirectoryResponse = paged(partnerSummarySchema);

export const partnerDetailSchema = partnerSummarySchema.extend({
  contacts: z.array(partnerContactSchema),
});
export type PartnerDetail = z.infer<typeof partnerDetailSchema>;

export const createPartnerBody = z.strictObject({ name: text(NAME_MAX), type: orgTypeSchema });
export type CreatePartnerBody = z.infer<typeof createPartnerBody>;

export const updatePartnerBody = z
  .strictObject({ name: text(NAME_MAX), type: orgTypeSchema })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { error: 'must change at least one field' });
export type UpdatePartnerBody = z.infer<typeof updatePartnerBody>;

export const addContactBody = z.strictObject({
  name: text(NAME_MAX),
  email: emailSchema,
  phone: phoneSchema,
});
export type AddContactBody = z.infer<typeof addContactBody>;

export const contactParams = z.strictObject({ id: idSchema, contactId: idSchema });
export type ContactParams = z.infer<typeof contactParams>;
