import { z } from 'zod';
import {
  conditionGradeSchema,
  countSchema,
  idSchema,
  optionalNote,
  REASON_MAX,
  searchSchema,
  text,
  timestampSchema,
  userRefSchema,
} from './common.js';
import { plainPageQuery, paged } from './pagination.js';
import { unitSchema } from './units.js';

/** The three queues of the inspection screen, one per physical status. */
export const INSPECTION_QUEUES = ['returned', 'under_inspection', 'for_repair'] as const;
export const inspectionQueueSchema = z.enum(INSPECTION_QUEUES);
export type InspectionQueue = z.infer<typeof inspectionQueueSchema>;

export const inspectionQueueQuery = plainPageQuery.extend({
  status: inspectionQueueSchema.default('returned'),
  q: searchSchema.optional(),
});
export type InspectionQueueQuery = z.infer<typeof inspectionQueueQuery>;

export const inspectionQueueItemSchema = z.object({
  unit: unitSchema,
  /** The loan the unit came back from; null for a unit sent to repair from the shelf. */
  transactionNumber: z.string().nullable(),
  company: z.string().nullable(),
  returnedAt: timestampSchema.nullable(),
  missingAccessories: z.array(z.string()),
  /** The note on the movement that put the unit in this queue (return note, repair fault). */
  note: z.string().nullable(),
  /** When the unit entered its current status. */
  since: timestampSchema,
  /** The shelf it last stood on, offered as the restock default. */
  lastShelfId: idSchema.nullable(),
});
export type InspectionQueueItem = z.infer<typeof inspectionQueueItemSchema>;

export const inspectionQueueResponse = paged(inspectionQueueItemSchema).extend({
  counts: z.record(inspectionQueueSchema, countSchema),
});
export type InspectionQueuePage = z.infer<typeof inspectionQueueResponse>;

export const inspectionChecklistSchema = z.strictObject({
  powersOn: z.boolean(),
  portsWork: z.boolean(),
  noPhysicalDamage: z.boolean(),
  factoryReset: z.boolean(),
  accessoriesComplete: z.boolean(),
});
export type InspectionChecklist = z.infer<typeof inspectionChecklistSchema>;

/**
 * The inspection result. Restock and reassign put the unit on a shelf (so a shelf is required);
 * repair and retire need a reason. A unit still "returned" is started automatically.
 */
export const recordInspectionBody = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.enum(['restock', 'reassign']),
    grade: conditionGradeSchema,
    checklist: inspectionChecklistSchema,
    notes: optionalNote(),
    locationId: idSchema,
  }),
  z.strictObject({
    outcome: z.enum(['repair', 'retire']),
    grade: conditionGradeSchema,
    checklist: inspectionChecklistSchema,
    notes: optionalNote(),
    reason: text(REASON_MAX),
  }),
]);
export type RecordInspectionBody = z.infer<typeof recordInspectionBody>;

export const inspectionSchema = z.object({
  id: idSchema,
  at: timestampSchema,
  unitCode: z.string(),
  transactionNumber: z.string().nullable(),
  inspector: userRefSchema.nullable(),
  grade: conditionGradeSchema,
  checklist: z.record(z.string(), z.boolean()),
  missingAccessories: z.array(z.string()),
  notes: z.string().nullable(),
  outcome: z.enum(['restock', 'repair', 'reassign', 'retire']),
});
export type Inspection = z.infer<typeof inspectionSchema>;
