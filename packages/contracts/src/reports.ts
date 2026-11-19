import { z } from 'zod';
import {
  ASSET_STATUSES,
  conditionGradeSchema,
  countSchema,
  dateKeySchema,
  idSchema,
  monthKeySchema,
  MOVEMENT_TYPES,
  queryInt,
  queryList,
  rangeShape,
  timestampSchema,
  uniqueArray,
  withRange,
} from './common.js';
import { plainPageQuery, paged } from './pagination.js';
import { movementSchema } from './units.js';

/** Units per physical status; `total` excludes retired and lost units. */
export const statusCountsSchema = z.object({
  ...Object.fromEntries(ASSET_STATUSES.map((status) => [status, countSchema])),
  total: countSchema,
}) as z.ZodObject<Record<(typeof ASSET_STATUSES)[number] | 'total', typeof countSchema>>;
export type StatusCounts = z.infer<typeof statusCountsSchema>;

// ---------------------------------------------------------------------------------------------
// Alerts (plan R5): derived from the data at read time, so an alert disappears the moment its
// cause is fixed. Only "read" marks are stored, per person, keyed by the alert's stable key.
// ---------------------------------------------------------------------------------------------

export const ALERT_KINDS = [
  'overdue',
  'missing_accessory',
  'for_inspection',
  'ready',
  'needs_reassignment',
] as const;
export const alertKindSchema = z.enum(ALERT_KINDS);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const ALERT_KEY_PATTERN = /^[a-z_]{3,24}:[A-Za-z0-9:-]{1,80}$/;

export const alertSchema = z.object({
  key: z.string(),
  kind: alertKindSchema,
  title: z.string(),
  body: z.string(),
  assetCode: z.string().nullable(),
  transactionNumber: z.string().nullable(),
  at: timestampSchema,
  read: z.boolean(),
});
export type Alert = z.infer<typeof alertSchema>;

export const listAlertsQuery = z.strictObject({
  kind: queryList(ALERT_KINDS).optional(),
  limit: queryInt(1, 200).default(100),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuery>;

export const listAlertsResponse = z.object({
  items: z.array(alertSchema),
  counts: z.record(alertKindSchema, countSchema),
  unread: countSchema,
});
export type AlertList = z.infer<typeof listAlertsResponse>;

export const markAlertsReadBody = z.strictObject({
  keys: uniqueArray(z.string().regex(ALERT_KEY_PATTERN), 200),
});
export type MarkAlertsReadBody = z.infer<typeof markAlertsReadBody>;

export const unreadCountResponse = z.object({ unread: countSchema });

// ---------------------------------------------------------------------------------------------
// Dashboard: one request for the whole first screen.
// ---------------------------------------------------------------------------------------------

export const dueSoonSchema = z.object({
  number: z.string(),
  company: z.string(),
  contactName: z.string(),
  unitCodes: z.array(z.string()),
  brand: z.string(),
  model: z.string(),
  dueDate: dateKeySchema,
  daysOverdue: countSchema,
});
export type DueSoon = z.infer<typeof dueSoonSchema>;

export const dashboardResponse = z.object({
  counts: statusCountsSchema,
  /** In-stock units promised to an approved request that has not been collected yet. */
  reservedForPickup: countSchema,
  overdue: countSchema,
  categories: countSchema,
  recent: z.array(movementSchema),
  dueSoon: z.array(dueSoonSchema),
  alerts: listAlertsResponse,
});
export type Dashboard = z.infer<typeof dashboardResponse>;

// ---------------------------------------------------------------------------------------------
// Reports.
// ---------------------------------------------------------------------------------------------

export const monthlyMovementSchema = z.object({
  month: monthKeySchema,
  released: countSchema,
  returned: countSchema,
  restocked: countSchema,
  inspection: countSchema,
});
export type MonthlyMovement = z.infer<typeof monthlyMovementSchema>;

export const overviewQuery = z.strictObject({ months: queryInt(1, 24).default(12) });
export const overviewResponse = z.object({
  counts: statusCountsSchema,
  monthly: z.array(monthlyMovementSchema),
});
export type Overview = z.infer<typeof overviewResponse>;

/** The movement ledger, newest first, filtered by date and movement type. */
export const trackingQuery = withRange(
  plainPageQuery.extend({ ...rangeShape, type: queryList(MOVEMENT_TYPES).optional() }),
);
export type TrackingQuery = z.infer<typeof trackingQuery>;
export const trackingResponse = paged(movementSchema);

export const borrowerRowSchema = z.object({
  companyId: idSchema,
  company: z.string(),
  loans: countSchema,
  open: countSchema,
  overdue: countSchema,
  /** Returns that came back short of an accessory. */
  missing: countSchema,
  lastBorrowed: dateKeySchema,
});
export type BorrowerRow = z.infer<typeof borrowerRowSchema>;
export const borrowersQuery = withRange(z.strictObject(rangeShape));
export type BorrowersQuery = z.infer<typeof borrowersQuery>;
export const borrowersResponse = z.array(borrowerRowSchema);

export const agingResponse = z.object({
  /** Units by time since registration. */
  ages: z.array(z.object({ label: z.string(), value: countSchema })),
  grades: z.array(z.object({ grade: conditionGradeSchema, value: countSchema })),
  /** In-stock, unreserved units that have stood still the longest: redeployment candidates. */
  idle: z.array(
    z.object({
      code: z.string(),
      brand: z.string(),
      model: z.string(),
      location: z.string().nullable(),
      days: countSchema,
    }),
  ),
});
export type Aging = z.infer<typeof agingResponse>;

export const utilizationRowSchema = z.object({
  categoryCode: z.string(),
  categoryName: z.string(),
  total: countSchema,
  deployed: countSchema,
  available: countSchema,
});
export const utilizationResponse = z.array(utilizationRowSchema);
export type UtilizationRow = z.infer<typeof utilizationRowSchema>;
