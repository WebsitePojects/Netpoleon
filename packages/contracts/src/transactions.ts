import { z } from 'zod';
import {
  accessoryListSchema,
  assetCodeSchema,
  BULK_MAX,
  companyRefSchema,
  conditionGradeSchema,
  contactSchema,
  countSchema,
  dateKeySchema,
  emailSchema,
  idSchema,
  locationRefSchema,
  MAX_UNITS_PER_REQUEST,
  modelRefSchema,
  multilineText,
  NAME_MAX,
  optionalNote,
  orgTypeSchema,
  phoneSchema,
  queryList,
  REASON_MAX,
  reservationStatusSchema,
  searchSchema,
  SHORT_TEXT_MAX,
  text,
  timestampSchema,
  transactionNumberSchema,
  transactionStageSchema,
  TRANSACTION_STAGES,
  uniqueArray,
  userRefSchema,
} from './common.js';
import { pageQuery, paged, sortQuery } from './pagination.js';

/**
 * One borrowing from request to return (plan D3): a server-built read model over the request,
 * its reservations, the loan and the loan items. `stage` comes from the database view.
 */
export const transactionSchema = z.object({
  number: z.string(),
  stage: transactionStageSchema,
  company: companyRefSchema,
  contact: contactSchema,
  model: modelRefSchema,
  quantityRequested: countSchema,
  quantityAssigned: countSchema,
  /** Units assigned to the request, in the order they were assigned. */
  unitCodes: z.array(z.string()),
  neededFrom: dateKeySchema,
  neededUntil: dateKeySchema,
  /** The return date in force: the needed-until date, moved by any approved extension. */
  dueDate: dateKeySchema,
  isOverdue: z.boolean(),
  daysOverdue: countSchema,
  purpose: z.string(),
  endCustomer: z.string().nullable(),
  filedBy: userRefSchema.nullable(),
  requestedAt: timestampSchema,
  decidedBy: userRefSchema.nullable(),
  decidedAt: timestampSchema.nullable(),
  decisionNote: z.string().nullable(),
  releasedBy: userRefSchema.nullable(),
  releasedAt: timestampSchema.nullable(),
  itemsReleased: countSchema,
  itemsReturned: countSchema,
  updatedAt: timestampSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionUnitSchema = z.object({
  assetCode: z.string(),
  serial: z.string(),
  status: z.string(),
  reservationStatus: reservationStatusSchema,
  releasedAt: timestampSchema.nullable(),
  returnedAt: timestampSchema.nullable(),
  accessoriesOut: z.array(z.string()),
  accessoriesBack: z.array(z.string()).nullable(),
  /** Out but not back; empty until the unit is returned. */
  missingAccessories: z.array(z.string()),
  receivedBy: userRefSchema.nullable(),
  returnNote: z.string().nullable(),
});
export type TransactionUnit = z.infer<typeof transactionUnitSchema>;

export const extensionSchema = z.object({
  requestedDueDate: dateKeySchema,
  reason: z.string(),
  status: z.enum(['requested', 'approved', 'rejected']),
  by: userRefSchema.nullable(),
  at: timestampSchema,
});
export type Extension = z.infer<typeof extensionSchema>;

export const transactionDetailSchema = transactionSchema.extend({
  /** The model's accessory list: the release checklist. */
  accessories: z.array(z.string()),
  units: z.array(transactionUnitSchema),
  extensions: z.array(extensionSchema),
  /** Turnaround buffer in force, so the screen can show the reserved range honestly. */
  bufferDays: countSchema,
});
export type TransactionDetail = z.infer<typeof transactionDetailSchema>;

export const TRANSACTION_SORTS = [
  'number',
  'requestedAt',
  'neededFrom',
  'dueDate',
  'company',
] as const;
export const DUE_FILTERS = ['overdue', 'week'] as const;
const transactionFilters = {
  q: searchSchema.optional(),
  stage: queryList(TRANSACTION_STAGES).optional(),
  due: z.enum(DUE_FILTERS).optional(),
  company: idSchema.optional(),
  unit: assetCodeSchema.optional(),
};
export const listTransactionsQuery = pageQuery(TRANSACTION_SORTS).extend(transactionFilters);
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
export const listTransactionsResponse = paged(transactionSchema);
export const exportTransactionsQuery = sortQuery(TRANSACTION_SORTS).extend(transactionFilters);
export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuery>;

/** Tab counts for the Borrow / Return screen, from one grouped query. */
export const stageCountsResponse = z.record(transactionStageSchema, countSchema);
export type StageCounts = z.infer<typeof stageCountsResponse>;

/** An existing company by id, or a new one by name and type (plan R1). */
export const companyChoiceSchema = z.union([
  z.strictObject({ id: idSchema }),
  z.strictObject({ name: text(NAME_MAX), type: orgTypeSchema }),
]);
export type CompanyChoice = z.infer<typeof companyChoiceSchema>;

export const createTransactionBody = z
  .strictObject({
    company: companyChoiceSchema,
    contact: z.strictObject({ name: text(NAME_MAX), email: emailSchema, phone: phoneSchema }),
    modelId: idSchema,
    quantity: z.int().min(1).max(MAX_UNITS_PER_REQUEST).default(1),
    neededFrom: dateKeySchema,
    neededUntil: dateKeySchema,
    purpose: text(SHORT_TEXT_MAX),
    endCustomer: text(SHORT_TEXT_MAX).nullable().default(null),
  })
  .refine((body) => body.neededUntil >= body.neededFrom, {
    error: 'must not be before neededFrom',
    path: ['neededUntil'],
  });
export type CreateTransactionBody = z.infer<typeof createTransactionBody>;

export const approveTransactionBody = z.strictObject({
  assetCodes: uniqueArray(assetCodeSchema, MAX_UNITS_PER_REQUEST),
});
export type ApproveTransactionBody = z.infer<typeof approveTransactionBody>;

export const transactionReasonBody = z.strictObject({ reason: multilineText(REASON_MAX) });
export type TransactionReasonBody = z.infer<typeof transactionReasonBody>;

/** Release scans each unit out and records the accessories that went with it. */
export const releaseTransactionBody = z.strictObject({
  items: z
    .array(z.strictObject({ scannedCode: assetCodeSchema, accessoriesOut: accessoryListSchema }))
    .min(1)
    .max(MAX_UNITS_PER_REQUEST)
    .refine((items) => new Set(items.map((item) => item.scannedCode)).size === items.length, {
      error: 'must not scan a unit twice',
    }),
});
export type ReleaseTransactionBody = z.infer<typeof releaseTransactionBody>;

/** Units come back one at a time: scan, tick what came back, note anything wrong. */
export const returnTransactionBody = z.strictObject({
  scannedCode: assetCodeSchema,
  accessoriesBack: accessoryListSchema,
  note: optionalNote(),
});
export type ReturnTransactionBody = z.infer<typeof returnTransactionBody>;

export const extendTransactionBody = z.strictObject({
  newDueDate: dateKeySchema,
  reason: multilineText(REASON_MAX),
});
export type ExtendTransactionBody = z.infer<typeof extendTransactionBody>;

export const bulkRejectBody = z.strictObject({
  numbers: uniqueArray(transactionNumberSchema, BULK_MAX),
  reason: multilineText(REASON_MAX),
});
export type BulkRejectBody = z.infer<typeof bulkRejectBody>;

/** Units an approver can assign for the request's window, read fresh when the dialog opens (R6). */
export const candidateUnitSchema = z.object({
  code: z.string(),
  serial: z.string(),
  status: z.string(),
  condition: conditionGradeSchema,
  location: locationRefSchema.nullable(),
});
export const candidatesResponse = z.object({
  units: z.array(candidateUnitSchema),
  /** Other pending requests for the same model whose dates overlap: first approved wins. */
  competingPendingCount: countSchema,
});
export type Candidates = z.infer<typeof candidatesResponse>;
