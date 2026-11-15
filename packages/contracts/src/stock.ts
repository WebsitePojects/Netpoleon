import { z } from 'zod';
import { MAX_PAGE_SIZE } from './pagination.js';

export const ASSET_STATUSES = [
  'registered',
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
  'retired',
  'lost',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const CONDITION_GRADES = ['a', 'b', 'c', 'd'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const LOCATION_KINDS = ['site', 'room', 'shelf'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

export const categorySchema = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });
export type Category = z.infer<typeof categorySchema>;

export const locationSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(LOCATION_KINDS),
  parentId: z.uuid().nullable(),
  parentName: z.string().nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const productModelSchema = z.strictObject({
  id: z.uuid(),
  categoryId: z.uuid(),
  brand: z.string(),
  modelName: z.string(),
  isBookable: z.boolean(),
  accessories: z.array(z.string()),
});
export type ProductModel = z.infer<typeof productModelSchema>;

/** Reference data for every dropdown, in one response: all three lists are small and bounded. */
export const catalogSchema = z.strictObject({
  categories: z.array(categorySchema),
  models: z.array(productModelSchema),
  locations: z.array(locationSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const createCategoryBodySchema = z.strictObject({
  name: text(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, 'Use 2 to 4 letters'),
});

export const createLocationBodySchema = z.strictObject({
  name: text(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,24}$/, 'Use 2 to 24 letters, digits or dashes'),
  kind: z.enum(LOCATION_KINDS),
  parentId: z.uuid().nullable(),
});

export const createModelBodySchema = z.strictObject({
  categoryId: z.uuid(),
  brand: text(60),
  modelName: text(80),
  isBookable: z.boolean().default(true),
  accessories: z.array(text(60)).max(30).default([]),
});

export const assetSchema = z.strictObject({
  id: z.uuid(),
  assetCode: z.string(),
  serialNumber: z.string(),
  status: z.enum(ASSET_STATUSES),
  condition: z.enum(CONDITION_GRADES),
  ownership: z.enum(['owned', 'vendor_consigned']),
  ownerName: z.string().nullable(),
  notes: z.string().nullable(),
  registeredAt: z.iso.datetime({ offset: true }),
  model: z.strictObject({
    id: z.uuid(),
    brand: z.string(),
    modelName: z.string(),
    categoryId: z.uuid(),
    categoryCode: z.string(),
    categoryName: z.string(),
  }),
  location: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
});
export type Asset = z.infer<typeof assetSchema>;

export const movementSchema = z.strictObject({
  id: z.uuid(),
  type: z.string(),
  fromStatus: z.enum(ASSET_STATUSES),
  toStatus: z.enum(ASSET_STATUSES),
  fromLocation: z.string().nullable(),
  toLocation: z.string().nullable(),
  actorName: z.string(),
  note: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type Movement = z.infer<typeof movementSchema>;

export const assetDetailSchema = z.strictObject({
  asset: assetSchema,
  accessories: z.array(z.string()),
  movements: z.array(movementSchema),
});
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const ASSET_SORTS = ['code', '-code', 'newest'] as const;

/**
 * Server-side search, filters and sort for the units list, so a list of any size returns one
 * page. Retired units are left out unless the status filter asks for them.
 */
export const assetListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  sort: z.enum(ASSET_SORTS).default('code'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export const assetPageSchema = z.strictObject({
  items: z.array(assetSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export const assetCodeParamsSchema = z.strictObject({
  code: z
    .string()
    .toUpperCase()
    .regex(/^NTP-[A-Z]{2,4}-\d{5}$/),
});

export const registerAssetBodySchema = z.strictObject({
  productModelId: z.uuid(),
  serialNumber: z.string().trim().toUpperCase().min(2).max(60),
  locationId: z.uuid(),
  condition: z.enum(CONDITION_GRADES).default('a'),
  ownership: z.enum(['owned', 'vendor_consigned']).default('owned'),
  ownerName: optionalText(120).default(null),
  notes: optionalText(1000).default(null),
});
export type RegisterAssetBody = z.infer<typeof registerAssetBodySchema>;

export const editAssetBodySchema = z
  .strictObject({
    serialNumber: z.string().trim().toUpperCase().min(2).max(60),
    condition: z.enum(CONDITION_GRADES),
    ownership: z.enum(['owned', 'vendor_consigned']),
    ownerName: optionalText(120),
    notes: optionalText(1000),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Change at least one field');
export type EditAssetBody = z.infer<typeof editAssetBodySchema>;

export const moveAssetBodySchema = z.strictObject({ locationId: z.uuid() });
export const reasonBodySchema = z.strictObject({ reason: text(500) });

export const moveAssetsBodySchema = z.strictObject({
  codes: z
    .array(
      z
        .string()
        .toUpperCase()
        .regex(/^NTP-[A-Z]{2,4}-\d{5}$/),
    )
    .min(1)
    .max(MAX_PAGE_SIZE),
  locationId: z.uuid(),
});

/** A batch reports each unit it skipped and why, so a short count is never a mystery. */
export const batchResultSchema = z.strictObject({
  done: z.array(z.string()),
  skipped: z.array(z.strictObject({ code: z.string(), reason: z.string() })),
});
export type BatchResult = z.infer<typeof batchResultSchema>;
