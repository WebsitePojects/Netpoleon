import type { Role } from './types.js';

/** Every guarded action in the console. An action missing from a role's list is denied. */
export type Action =
  | 'unit.register'
  | 'unit.edit'
  | 'unit.move'
  | 'unit.repair'
  | 'unit.retire'
  | 'loan.request'
  | 'loan.decide'
  | 'loan.extend'
  | 'loan.cancel'
  | 'loan.release'
  | 'loan.receive'
  | 'inspection.perform'
  | 'reports.export'
  | 'users.manage'
  | 'partners.manage'
  | 'settings.manage';

export const ACTION_LABELS: Record<Action, string> = {
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
  'inspection.perform': 'Inspect and restock',
  'reports.export': 'Export reports',
  'users.manage': 'Manage users',
  'partners.manage': 'Manage partner companies',
  'settings.manage': 'Change settings',
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  warehouse: 'Warehouse',
  auditor: 'Auditor',
};

export const ROLE_SUMMARIES: Record<Role, string> = {
  admin: 'Everything, plus users, partner companies and settings',
  manager: 'Approves requests, extends loans, sees all reports',
  warehouse: 'Registers, stocks, releases, receives, inspects',
  auditor: 'Reads everything, changes nothing',
};

const WAREHOUSE_ACTIONS: Action[] = [
  'unit.register',
  'unit.edit',
  'unit.move',
  'unit.repair',
  'loan.request',
  'loan.release',
  'loan.receive',
  'inspection.perform',
  'reports.export',
];

const MANAGER_ACTIONS: Action[] = [
  'loan.request',
  'loan.decide',
  'loan.extend',
  'loan.cancel',
  'reports.export',
];

const GRANTS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set(Object.keys(ACTION_LABELS) as Action[]),
  manager: new Set(MANAGER_ACTIONS),
  warehouse: new Set(WAREHOUSE_ACTIONS),
  auditor: new Set<Action>(['reports.export']),
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].has(action);
}
