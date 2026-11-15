import type { Role } from './types.js';

import { can as canFor, type Action as AnyAction } from '@wms/contracts/client';

/**
 * The permission table itself lives in `@wms/contracts`, shared with the API, so the screen
 * and the server can never disagree about who may do what. This file keeps the labels.
 */
export type Action = Extract<
  AnyAction,
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
  | 'settings.manage'
>;

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

/** Label for any account role, partner roles included (they appear on the portal). */
export function roleLabel(role: Role | 'partner_admin' | 'partner_member'): string {
  if (role === 'partner_admin') return 'Partner administrator';
  if (role === 'partner_member') return 'Partner member';
  return ROLE_LABELS[role];
}

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

export function can(role: Role, action: Action): boolean {
  return canFor(role, action);
}
