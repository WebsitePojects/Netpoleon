import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

// Query-string values arrive as strings, hence the coercion. `limit=` coerces to 0 and is
// rejected by the minimum rather than silently becoming the default.
export const pageQuerySchema = z.object({
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageOf<T>(items: T[], nextCursor: string | null): Page<T> {
  return { items, nextCursor };
}
