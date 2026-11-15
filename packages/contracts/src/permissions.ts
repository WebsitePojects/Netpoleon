/**
 * The one permission table (foundation spec section 9). The API checks it on every route and
 * the web app reads it to hide what a role cannot do. An action missing from a role's list is
 * denied: there is no default allow.
 */

export const STAFF_ROLES = ['admin', 'manager', 'warehouse', 'auditor'] as const;
export const PARTNER_ROLES = ['partner_admin', 'partner_member'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type PartnerRole = (typeof PARTNER_ROLES)[number];
export type Role = StaffRole | PartnerRole;

export const ACTIONS = [
  'unit.view',
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
  'inspection.perform',
  'reports.view',
  'reports.export',
  'users.view',
  'users.manage',
  'partners.view',
  'partners.manage',
  'settings.manage',
  'audit.view',
  'portal.book',
  'portal.team',
] as const;
export type Action = (typeof ACTIONS)[number];

const STAFF_READ: Action[] = [
  'unit.view',
  'reports.view',
  'reports.export',
  'users.view',
  'partners.view',
  'audit.view',
];

const GRANTS: Record<Role, ReadonlySet<Action>> = {
  admin: new Set(ACTIONS.filter((action) => !action.startsWith('portal.'))),
  manager: new Set<Action>([
    ...STAFF_READ,
    'loan.request',
    'loan.decide',
    'loan.extend',
    'loan.cancel',
  ]),
  warehouse: new Set<Action>([
    ...STAFF_READ,
    'unit.register',
    'unit.edit',
    'unit.move',
    'unit.repair',
    'loan.request',
    'loan.release',
    'loan.receive',
    'inspection.perform',
  ]),
  auditor: new Set<Action>(STAFF_READ),
  partner_admin: new Set<Action>(['portal.book', 'portal.team']),
  partner_member: new Set<Action>(['portal.book']),
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].has(action);
}

export function isStaffRole(role: Role): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}
