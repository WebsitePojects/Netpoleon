import { z } from 'zod';
import { companyRefSchema, orgStatusSchema, queryInt, searchSchema } from './common.js';

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
