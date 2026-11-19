import { z } from 'zod';
import {
  accessoryListSchema,
  categoryCodeSchema,
  categoryRefSchema,
  countSchema,
  dateKeySchema,
  idSchema,
  locationKindSchema,
  locationRefSchema,
  NAME_MAX,
  rangeShape,
  text,
  withRange,
} from './common.js';

// ---------------------------------------------------------------------------------------------
// Categories. Reference data: sent at bootstrap, cached by the client for minutes.
// ---------------------------------------------------------------------------------------------

export const categorySchema = categoryRefSchema;
export type Category = z.infer<typeof categorySchema>;

/** The settings screen lists categories with how many units each holds (retired excluded). */
export const categoryWithCountSchema = categorySchema.extend({ unitCount: countSchema });
export type CategoryWithCount = z.infer<typeof categoryWithCountSchema>;

export const listCategoriesResponse = z.array(categoryWithCountSchema);

/** The code becomes part of every asset code in the category, so it is fixed once created. */
export const createCategoryBody = z.strictObject({
  name: text(NAME_MAX),
  code: categoryCodeSchema,
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

// ---------------------------------------------------------------------------------------------
// Product models. Accessories belong to the model (plan R11); every unit of it shows that list.
// ---------------------------------------------------------------------------------------------

export const modelSchema = z.object({
  id: idSchema,
  brand: z.string(),
  name: z.string(),
  category: categoryRefSchema,
  /** A model that is not bookable cannot be requested; its units can still be lent if assigned. */
  isBookable: z.boolean(),
  accessories: z.array(z.string()),
});
export type Model = z.infer<typeof modelSchema>;

/** Every model at once: the catalogue is dozens of rows, not thousands, and the forms need all. */
export const listModelsResponse = z.array(modelSchema);

export const createModelBody = z.strictObject({
  categoryId: idSchema,
  brand: text(NAME_MAX),
  name: text(NAME_MAX),
  isBookable: z.boolean().default(true),
  accessories: accessoryListSchema.default([]),
});
export type CreateModelBody = z.infer<typeof createModelBody>;

/**
 * Units of each bookable model free for a window. `from`/`until` are the dates the borrower
 * needs the unit; the server widens the window by `booking.buffer_days` before asking the
 * database (plan R6), so this matches what an approval would find.
 */
export const modelAvailabilityQuery = withRange(z.strictObject(rangeShape));
export type ModelAvailabilityQuery = z.infer<typeof modelAvailabilityQuery>;

export const modelAvailabilitySchema = z.object({
  modelId: idSchema,
  unitsFree: countSchema,
  /** Units of the model that are not retired or lost, for "3 of 5 free". */
  unitsTotal: countSchema,
});
export type ModelAvailability = z.infer<typeof modelAvailabilitySchema>;

export const modelAvailabilityResponse = z.object({
  from: dateKeySchema,
  until: dateKeySchema,
  items: z.array(modelAvailabilitySchema),
});
export type ModelAvailabilityResponse = z.infer<typeof modelAvailabilityResponse>;

// ---------------------------------------------------------------------------------------------
// Locations: the site -> room -> shelf tree (plan D13).
// ---------------------------------------------------------------------------------------------

export const locationSchema = locationRefSchema.extend({
  code: z.string(),
  parentId: idSchema.nullable(),
});
export type Location = z.infer<typeof locationSchema>;

/** Units currently at the location, retired excluded, as the settings screen shows. */
export const locationWithCountSchema = locationSchema.extend({ unitCount: countSchema });
export type LocationWithCount = z.infer<typeof locationWithCountSchema>;

export const listLocationsResponse = z.array(locationWithCountSchema);

/** Upper case so codes printed on shelf labels read the same everywhere. */
export const LOCATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
export const locationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(LOCATION_CODE_PATTERN, { error: 'must be up to 32 letters, digits or dashes' });

/**
 * A site has no parent; a room sits in a site; a shelf sits in a room. The server checks the
 * parent's kind, because the schema cannot see the tree.
 */
export const createLocationBody = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal(locationKindSchema.enum.site),
    code: locationCodeSchema,
    name: text(NAME_MAX),
  }),
  z.strictObject({
    kind: z.enum([locationKindSchema.enum.room, locationKindSchema.enum.shelf]),
    code: locationCodeSchema,
    name: text(NAME_MAX),
    parentId: idSchema,
  }),
]);
export type CreateLocationBody = z.infer<typeof createLocationBody>;
