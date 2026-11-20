import { z } from 'zod';

/** Postgres enum `user_role` (0001). Partner roles exist for the later portal slice. */
export const ROLES = [
  'admin',
  'manager',
  'warehouse',
  'auditor',
  'partner_admin',
  'partner_member',
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** The roles a console user can hold; `users_kind_role_org_consistent` ties them to kind staff. */
export const STAFF_ROLES = ['admin', 'manager', 'warehouse', 'auditor'] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Every guarded action. The server checks these; the console only uses them to hide buttons. */
export const ACTIONS = [
  'unit.register',
  'unit.edit',
  'unit.move',
  'unit.repair',
  'unit.retire',
  'loan.request',
  'loan.decide',
  'loan.extend',
  'loan.cancel',
  'loan.release',
  'loan.receive',
  'loan.backdate',
  'inspection.perform',
  'reports.export',
  'users.manage',
  'settings.manage',
  'audit.read',
  'catalog.manage',
  'partners.manage',
] as const;
export const actionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof actionSchema>;

export const ACTION_LABELS: Readonly<Record<Action, string>> = Object.freeze({
  'unit.register': 'Register units',
  'unit.edit': 'Edit unit details',
  'unit.move': 'Move units between shelves',
  'unit.repair': 'Send to and return from repair',
  'unit.retire': 'Retire units',
  'loan.request': 'File borrowing requests',
  'loan.decide': 'Approve or reject requests',
  'loan.extend': 'Extend loans',
  'loan.cancel': 'Cancel requests',
  'loan.release': 'Release units',
  'loan.receive': 'Receive returns',
  'loan.backdate': 'Record loans that were out before go-live',
  'inspection.perform': 'Inspect and restock',
  'reports.export': 'Export reports',
  'users.manage': 'Manage users',
  'settings.manage': 'Change settings',
  'audit.read': 'Read the full audit trail',
  'catalog.manage': 'Manage categories, models and locations',
  'partners.manage': 'Manage partner companies',
});

export const ROLE_LABELS: Readonly<Record<Role, string>> = Object.freeze({
  admin: 'Administrator',
  manager: 'Manager',
  warehouse: 'Warehouse',
  auditor: 'Auditor',
  partner_admin: 'Partner administrator',
  partner_member: 'Partner member',
});

export const ROLE_SUMMARIES: Readonly<Record<Role, string>> = Object.freeze({
  admin: 'Everything, plus users and settings',
  manager: 'Approves requests, extends loans, sees all reports',
  warehouse: 'Registers, stocks, releases, receives, inspects',
  auditor: 'Reads everything, changes nothing',
  partner_admin: 'Partner portal: requests for their company and its members',
  partner_member: 'Partner portal: their own requests',
});

const WAREHOUSE_ACTIONS: readonly Action[] = [
  'unit.register',
  'unit.edit',
  'unit.move',
  'unit.repair',
  'loan.request',
  'loan.release',
  'loan.receive',
  'inspection.perform',
  'reports.export',
  'catalog.manage',
];

const MANAGER_ACTIONS: readonly Action[] = [
  'loan.request',
  'loan.decide',
  'loan.extend',
  'loan.cancel',
  'reports.export',
  'audit.read',
  'partners.manage',
];

const AUDITOR_ACTIONS: readonly Action[] = ['reports.export', 'audit.read'];

/**
 * The one grant table. A pair that is not listed is denied, so a new action is closed to
 * everyone until someone grants it here. Partner roles are granted nothing: the portal is a
 * later slice with its own surface, and nothing in the console may open to them by accident.
 */
const GRANTS: Readonly<Record<Role, readonly Action[]>> = Object.freeze({
  admin: Object.freeze([...ACTIONS]),
  manager: Object.freeze([...MANAGER_ACTIONS]),
  warehouse: Object.freeze([...WAREHOUSE_ACTIONS]),
  auditor: Object.freeze([...AUDITOR_ACTIONS]),
  partner_admin: Object.freeze([]),
  partner_member: Object.freeze([]),
});

/**
 * Whether `role` may perform `action`. Fails closed on values that are not in the table, so a
 * role or action read from an untyped source (a stale session row, a cast) is denied.
 */
export function can(role: Role, action: Action): boolean {
  if (!Object.hasOwn(GRANTS, role)) return false;
  return GRANTS[role].includes(action);
}

/** The actions `role` may perform, in `ACTIONS` order; sent to the console at bootstrap. */
export function permissionsFor(role: Role): Action[] {
  return ACTIONS.filter((action) => can(role, action));
}
