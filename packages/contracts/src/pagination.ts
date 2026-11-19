import { z } from 'zod';
import { countSchema, queryInt } from './common.js';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

// ---------------------------------------------------------------------------------------------
// Keyset paging: the two append-only feeds (`/units/:code/movements`, `/audit`), shown with
// "load more". A new row arriving between two calls never shifts or duplicates a page.
// ---------------------------------------------------------------------------------------------

/** `limit=` is rejected rather than silently becoming the default (see `queryInt`). */
export const pageQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(1024).optional(),
  limit: queryInt(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageOf<T>(items: T[], nextCursor: string | null): Page<T> {
  return { items, nextCursor };
}

/** Response schema of a keyset page; `nextCursor` is null on the last page. */
export function cursorPaged<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

// ---------------------------------------------------------------------------------------------
// Offset paging (plan R2): the console's tables show page numbers and a total. Acceptable to
// roughly 50 000 rows per list; the two feeds above stay keyset.
// ---------------------------------------------------------------------------------------------

export const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * Sort without paging, for CSV exports that take a list's filters. `sort` is an allow-list per
 * list; when it is absent the server applies that list's documented default order.
 */
export function sortQuery<const K extends readonly [string, ...string[]]>(sortKeys: K) {
  return z.strictObject({
    sort: z.enum(sortKeys).optional(),
    order: z.enum(SORT_ORDERS).optional(),
  });
}

/** 10 000 pages of 100 is far past the 50 000-row comfort limit; beyond it OFFSET is a scan. */
export const MAX_PAGE = 10_000;

const pagingShape = {
  page: queryInt(1, MAX_PAGE).default(1),
  pageSize: queryInt(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

/** `page` >= 1, `pageSize` 1..100 (default 25), plus the list's sort allow-list. */
export function pageQuery<const K extends readonly [string, ...string[]]>(sortKeys: K) {
  return sortQuery(sortKeys).extend(pagingShape);
}

/** Paging for a list with one fixed order, so it takes no `sort`. */
export const plainPageQuery = z.strictObject(pagingShape);

/** Response schema of an offset page; `total` counts every row matching the filters. */
export function paged<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.int().min(1),
    pageSize: z.int().min(1).max(MAX_PAGE_SIZE),
    total: countSchema,
  });
}
