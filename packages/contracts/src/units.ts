import { z } from 'zod';
import {
  assetCodeSchema,
  assetStatusSchema,
  ASSET_STATUSES,
  BULK_MAX,
  conditionGradeSchema,
  dateKeySchema,
  idSchema,
  locationRefSchema,
  movementTypeSchema,
  NOTE_MAX,
  optionalNote,
  queryList,
  REASON_MAX,
  reservationStatusSchema,
  multilineText,
  searchSchema,
  serialSchema,
  timestampSchema,
  uniqueArray,
  userRefSchema,
} from './common.js';
import { cursorPaged, pageQuery, paged, sortQuery } from './pagination.js';

/**
 * One physical unit. Field names follow the console's existing screens (`code`, `brand`,
 * `model`, `categoryCode`) so the pages keep their shape when the demo store is replaced.
 */
export const unitSchema = z.object({
  code: z.string(),
  serial: z.string(),
  status: assetStatusSchema,
  condition: conditionGradeSchema,
  modelId: idSchema,
  brand: z.string(),
  model: z.string(),
  categoryCode: z.string(),
  location: locationRefSchema.nullable(),
  /** The model's accessory list: what the release and return checklists are built from. */
  accessories: z.array(z.string()),
  notes: z.string().nullable(),
  /** Transaction holding this unit from approval until release, or null. Derived, never stored. */
  reservedFor: z.string().nullable(),
  registeredAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Unit = z.infer<typeof unitSchema>;

export const UNIT_SORTS = ['code', 'model', 'status', 'location', 'updatedAt'] as const;
const unitFilters = {
  q: searchSchema.optional(),
  status: queryList(ASSET_STATUSES).optional(),
  category: z
    .string()
    .regex(/^[A-Z]{2,4}$/)
    .optional(),
  location: idSchema.optional(),
};
/** Retired and lost units are left out unless the status filter asks for them. */
export const listUnitsQuery = pageQuery(UNIT_SORTS).extend(unitFilters);
export type ListUnitsQuery = z.infer<typeof listUnitsQuery>;
export const listUnitsResponse = paged(unitSchema);
export const exportUnitsQuery = sortQuery(UNIT_SORTS).extend(unitFilters);
export type ExportUnitsQuery = z.infer<typeof exportUnitsQuery>;

export const movementSchema = z.object({
  id: idSchema,
  at: timestampSchema,
  unitCode: z.string(),
  type: movementTypeSchema,
  fromStatus: assetStatusSchema,
  toStatus: assetStatusSchema,
  fromLocation: z.string().nullable(),
  toLocation: z.string().nullable(),
  by: userRefSchema.nullable(),
  transactionNumber: z.string().nullable(),
  note: z.string().nullable(),
});
export type Movement = z.infer<typeof movementSchema>;
export const listMovementsResponse = cursorPaged(movementSchema);

export const unitReservationSchema = z.object({
  transactionNumber: z.string(),
  company: z.string(),
  from: dateKeySchema,
  /** Last day the borrower needs the unit (the stored range also covers the turnaround buffer). */
  until: dateKeySchema,
  status: reservationStatusSchema,
});
export type UnitReservation = z.infer<typeof unitReservationSchema>;

export const unitDetailSchema = unitSchema.extend({
  ownership: z.enum(['owned', 'vendor_consigned']),
  ownerName: z.string().nullable(),
  /** Reservations that still occupy the unit, soonest first. */
  reservations: z.array(unitReservationSchema),
  /** The newest movements; older ones come from the movements feed. */
  movements: z.array(movementSchema),
  movementsCursor: z.string().nullable(),
});
export type UnitDetail = z.infer<typeof unitDetailSchema>;

/** Registration shelves the unit in the same transaction (lifecycle steps 1 and 2). */
export const registerUnitBody = z.strictObject({
  modelId: idSchema,
  serial: serialSchema,
  condition: conditionGradeSchema.default('a'),
  locationId: idSchema,
  notes: optionalNote(),
});
export type RegisterUnitBody = z.infer<typeof registerUnitBody>;

export const updateUnitBody = z
  .strictObject({
    serial: serialSchema,
    condition: conditionGradeSchema,
    notes: optionalNote(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { error: 'must change at least one field' });
export type UpdateUnitBody = z.infer<typeof updateUnitBody>;

export const relocateUnitBody = z.strictObject({ locationId: idSchema, note: optionalNote() });
export type RelocateUnitBody = z.infer<typeof relocateUnitBody>;

export const reasonBody = z.strictObject({ reason: multilineText(REASON_MAX) });
export type ReasonBody = z.infer<typeof reasonBody>;

/** A repaired unit goes back through inspection, not straight to the shelf (plan R13). */
export const completeRepairBody = z.strictObject({ note: optionalNote(NOTE_MAX) });
export type CompleteRepairBody = z.infer<typeof completeRepairBody>;

export const bulkRelocateBody = z.strictObject({
  codes: uniqueArray(assetCodeSchema, BULK_MAX),
  locationId: idSchema,
});
export type BulkRelocateBody = z.infer<typeof bulkRelocateBody>;

/** Scan lookup: the scanner reads the system's asset code (spec section 6). */
export const scanQuery = z.strictObject({ code: assetCodeSchema });
