import { daysBetween, monthKeyOf, toDateKey } from '../lib/dates.js';
import type { Loan, Movement, Unit, UnitStatus, WmsState } from './types.js';

export const STATUS_LABELS: Record<UnitStatus, string> = {
  in_stock: 'Available',
  on_demo: 'On Demo',
  returned: 'Returned',
  under_inspection: 'Under Inspection',
  for_repair: 'For Repair',
  retired: 'Retired',
};

/** Statuses in the order the proposal's charts list them. */
export const ACTIVE_STATUSES: UnitStatus[] = [
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
];

export const LOAN_STATUS_LABELS: Record<Loan['status'], string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  released: 'On Demo',
  returned: 'Returned',
  closed: 'Closed',
};

export const MOVEMENT_LABELS: Record<Movement['type'], string> = {
  registered: 'Registered',
  stocked: 'Stocked',
  moved: 'Moved',
  reserved: 'Reserved',
  reservation_cancelled: 'Reservation cancelled',
  released: 'Release',
  returned: 'Return',
  inspection_started: 'Inspection',
  restocked: 'Restock',
  sent_to_repair: 'Sent to repair',
  repaired: 'Repaired',
  retired: 'Retired',
};

export type StatusCounts = Record<UnitStatus, number> & { total: number };

export function countByStatus(units: Unit[]): StatusCounts {
  const counts: StatusCounts = {
    in_stock: 0,
    on_demo: 0,
    returned: 0,
    under_inspection: 0,
    for_repair: 0,
    retired: 0,
    total: 0,
  };
  for (const unit of units) {
    counts[unit.status] += 1;
    if (unit.status !== 'retired') counts.total += 1;
  }
  return counts;
}

/** Whole days a released loan is past its return date; 0 when it is not late. */
export function daysOverdue(loan: Loan, today: string): number {
  if (loan.status !== 'released') return 0;
  return Math.max(0, daysBetween(loan.dueDate, today));
}

export function missingAccessories(loan: Loan): string[] {
  if (!loan.returnedAt) return [];
  return loan.accessoriesOut.filter((item) => !loan.accessoriesBack.includes(item));
}

export type AlertKind = 'overdue' | 'missing_accessory' | 'for_inspection' | 'ready';

export interface Alert {
  /** Stable across renders, so "read" survives: kind plus the record it is about. */
  id: string;
  kind: AlertKind;
  title: string;
  unitCode: string;
  message: string;
  /** Calendar date or timestamp the alert refers to. */
  date: string;
  href: string;
  read: boolean;
}

export const ALERT_TITLES: Record<AlertKind, string> = {
  overdue: 'Overdue return',
  missing_accessory: 'Returned with missing accessory',
  for_inspection: 'For inspection',
  ready: 'Available for redeployment',
};

const READY_ALERT_WINDOW_DAYS = 7;

/**
 * Alerts are derived from the records, never stored: an overdue alert disappears by itself
 * the moment the unit is received, so an alert can never be stale.
 */
export function buildAlerts(state: WmsState, now: Date): Alert[] {
  const today = toDateKey(now);
  const read = new Set(state.readAlertIds);
  const unitByCode = new Map(state.units.map((unit) => [unit.code, unit]));
  const alerts: Omit<Alert, 'read' | 'title'>[] = [];

  for (const loan of state.loans) {
    const unitCode = loan.unitCode ?? '';
    const late = daysOverdue(loan, today);
    if (late > 0) {
      alerts.push({
        id: `overdue:${loan.number}`,
        kind: 'overdue',
        unitCode,
        message: `Demo unit is ${late} day${late === 1 ? '' : 's'} overdue for return from ${loan.borrower.company}.`,
        date: loan.dueDate,
        href: `/borrow/${loan.number}`,
      });
    }
    const missing = missingAccessories(loan);
    // Shown until the unit has been inspected, which is when someone has dealt with it.
    if (missing.length > 0 && loan.status === 'returned') {
      alerts.push({
        id: `missing:${loan.number}`,
        kind: 'missing_accessory',
        unitCode,
        message: `Returned by ${loan.borrower.company} but missing ${missing.join(', ').toLowerCase()}.`,
        date: loan.returnedAt ?? loan.dueDate,
        href: `/borrow/${loan.number}`,
      });
    }
  }

  for (const unit of state.units) {
    if (unit.status === 'returned') {
      alerts.push({
        id: `inspect:${unit.code}`,
        kind: 'for_inspection',
        unitCode: unit.code,
        message: 'Unit tagged for functional check and testing.',
        date: lastMovementAt(state, unit.code) ?? unit.registeredAt,
        href: '/inspection',
      });
    }
  }

  const readyFrom = new Date(now.getTime() - READY_ALERT_WINDOW_DAYS * 86_400_000).toISOString();
  for (const inspection of state.inspections) {
    if (inspection.at < readyFrom || inspection.outcome === 'repair') continue;
    const unit = unitByCode.get(inspection.unitCode);
    if (!unit || unit.status !== 'in_stock' || unit.reservedFor) continue;
    alerts.push({
      id: `ready:${inspection.id}`,
      kind: 'ready',
      unitCode: unit.code,
      message: 'Inspection completed. Ready for redeployment.',
      date: inspection.at,
      href: `/units/${unit.code}`,
    });
  }

  const order: AlertKind[] = ['overdue', 'missing_accessory', 'for_inspection', 'ready'];
  return alerts
    .map((alert) => ({ ...alert, title: ALERT_TITLES[alert.kind], read: read.has(alert.id) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.date.localeCompare(a.date));
}

function lastMovementAt(state: WmsState, unitCode: string): string | null {
  for (let index = state.movements.length - 1; index >= 0; index -= 1) {
    const movement = state.movements[index];
    if (movement?.unitCode === unitCode) return movement.at;
  }
  return null;
}

export interface MonthlyMovement {
  month: string;
  released: number;
  returned: number;
  restocked: number;
  inspection: number;
}

/** Movement counts for the last `months` calendar months, oldest first. */
export function movementsByMonth(
  movements: Movement[],
  now: Date,
  months: number,
): MonthlyMovement[] {
  const rows = new Map<string, MonthlyMovement>();
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const month = toDateKey(new Date(now.getFullYear(), now.getMonth() - offset, 1)).slice(0, 7);
    rows.set(month, { month, released: 0, returned: 0, restocked: 0, inspection: 0 });
  }
  for (const movement of movements) {
    const row = rows.get(monthKeyOf(movement.at));
    if (!row) continue;
    if (movement.type === 'released') row.released += 1;
    else if (movement.type === 'returned') row.returned += 1;
    else if (movement.type === 'restocked') row.restocked += 1;
    else if (movement.type === 'inspection_started') row.inspection += 1;
  }
  return [...rows.values()];
}

export function modelKey(unit: Pick<Unit, 'brand' | 'model'>): string {
  return `${unit.brand}|${unit.model}`;
}

export interface ModelAvailability {
  key: string;
  brand: string;
  model: string;
  categoryCode: string;
  total: number;
  free: number;
}

/** One row per model with how many units could be assigned right now. */
export function modelAvailability(units: Unit[]): ModelAvailability[] {
  const rows = new Map<string, ModelAvailability>();
  for (const unit of units) {
    if (unit.status === 'retired') continue;
    const key = modelKey(unit);
    const row = rows.get(key) ?? {
      key,
      brand: unit.brand,
      model: unit.model,
      categoryCode: unit.categoryCode,
      total: 0,
      free: 0,
    };
    row.total += 1;
    if (unit.status === 'in_stock' && !unit.reservedFor) row.free += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
