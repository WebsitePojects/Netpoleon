import type { AssetStatus, ConditionGrade } from '@wms/contracts';
import { MOVEMENT_LABELS, STATUS_LABELS } from '../data/selectors.js';

/** Every unit status the system can hold, the demo's and the database's. */
export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  ...STATUS_LABELS,
  registered: 'Registered',
  lost: 'Lost',
};

/** Statuses a person can filter the units list by, in the proposal's order. */
export const FILTER_STATUSES: AssetStatus[] = [
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
  'lost',
  'retired',
];

export const GRADE_LABELS: Record<ConditionGrade, string> = {
  a: 'A · Like new',
  b: 'B · Light wear',
  c: 'C · Heavy wear',
  d: 'D · For parts',
};

export const GRADE_OPTIONS = (Object.keys(GRADE_LABELS) as ConditionGrade[]).map((grade) => ({
  value: grade,
  label: GRADE_LABELS[grade],
}));

const API_MOVEMENTS: Record<string, string> = {
  relocated: 'Moved',
  marked_lost: 'Marked lost',
  found: 'Found',
};

/** Label for a movement type from either the demo ledger or the database. */
export function movementLabel(type: string): string {
  return (MOVEMENT_LABELS as Record<string, string>)[type] ?? API_MOVEMENTS[type] ?? type;
}
