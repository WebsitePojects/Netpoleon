import type {
  AlertKind,
  AssetStatus,
  ConditionGrade,
  MovementType,
  TransactionStage,
} from '@wms/contracts';

/** Words the screens use for the API's values. One place, so every screen says the same. */

export const STATUS_LABELS: Readonly<Record<AssetStatus, string>> = {
  registered: 'Registered',
  in_stock: 'Available',
  on_demo: 'On Demo',
  returned: 'Returned',
  under_inspection: 'Under Inspection',
  for_repair: 'For Repair',
  retired: 'Retired',
  lost: 'Lost',
};

/** Colour token of each status; a status with no colour of its own borrows the nearest. */
export const STATUS_TONES: Readonly<Record<AssetStatus, string>> = {
  registered: 'in_stock',
  in_stock: 'in_stock',
  on_demo: 'on_demo',
  returned: 'returned',
  under_inspection: 'under_inspection',
  for_repair: 'for_repair',
  retired: 'retired',
  lost: 'for_repair',
};

/** Statuses in the order the proposal's charts list them. */
export const ACTIVE_STATUSES: readonly AssetStatus[] = [
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
];

export const STAGE_LABELS: Readonly<Record<TransactionStage, string>> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
  released: 'On Demo',
  returned: 'Returned',
  closed: 'Closed',
};

export const STAGE_TONES: Readonly<Record<TransactionStage, string>> = {
  pending: 'for_repair',
  approved: 'in_stock',
  released: 'on_demo',
  returned: 'returned',
  closed: 'retired',
  rejected: 'under_inspection',
  cancelled: 'under_inspection',
  expired: 'under_inspection',
};

export const MOVEMENT_LABELS: Readonly<Record<MovementType, string>> = {
  registered: 'Registered',
  stocked: 'Stocked',
  relocated: 'Moved',
  released: 'Release',
  returned: 'Return',
  inspection_started: 'Inspection',
  restocked: 'Restock',
  sent_to_repair: 'Sent to repair',
  repaired: 'Repaired',
  retired: 'Retired',
  marked_lost: 'Marked lost',
  found: 'Found',
};

export const CONDITION_LABELS: Readonly<Record<ConditionGrade, string>> = {
  a: 'A · Like new',
  b: 'B · Light wear',
  c: 'C · Heavy wear',
  d: 'D · Damaged',
};

export const ALERT_TITLES: Readonly<Record<AlertKind, string>> = {
  overdue: 'Overdue return',
  missing_accessory: 'Returned with missing accessory',
  for_inspection: 'For inspection',
  ready: 'Available for redeployment',
  needs_reassignment: 'Booking needs a substitute',
};

export function grade(value: ConditionGrade): string {
  return value.toUpperCase();
}
