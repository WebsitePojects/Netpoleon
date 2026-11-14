/**
 * The rows the seed writes, one interface per table, named after the table's columns. The plan
 * builds them in memory (ids included, so rows can reference each other before anything is
 * written) and the writer inserts them in bulk.
 */

import type { OrgType, StaffRole } from './dataset.js';

export type AssetStatus =
  | 'registered'
  | 'in_stock'
  | 'on_demo'
  | 'returned'
  | 'under_inspection'
  | 'for_repair'
  | 'retired';

export type MovementType =
  | 'registered'
  | 'stocked'
  | 'relocated'
  | 'released'
  | 'returned'
  | 'inspection_started'
  | 'restocked'
  | 'sent_to_repair'
  | 'retired';

export type ConditionGrade = 'a' | 'b' | 'c' | 'd';

export interface LocationRow {
  id: string;
  parentId: string | null;
  kind: 'site' | 'room' | 'shelf';
  code: string;
  name: string;
}

export interface ProductModelRow {
  id: string;
  categoryCode: string;
  brand: string;
  modelName: string;
}

export interface ModelAccessoryRow {
  id: string;
  productModelId: string;
  name: string;
}

export interface PartnerOrgRow {
  id: string;
  name: string;
  type: OrgType;
}

export interface StaffUserRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  title: string;
  role: StaffRole;
}

export interface AssetRow {
  id: string;
  assetCode: string;
  serialNumber: string;
  productModelId: string;
  condition: ConditionGrade;
  notes: string | null;
  retiredAt: Date | null;
  createdAt: Date;
}

export type RequestStatus =
  'submitted' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'fulfilled';

export interface LoanRequestRow {
  id: string;
  /** Assigned once every request exists, in filing order (see SeedPlanBuilder.number). */
  requestNo: string;
  partnerOrgId: string;
  filedByUserId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  neededFrom: string;
  neededUntil: string;
  purpose: string;
  endCustomer: string | null;
  status: RequestStatus;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}

export interface LoanRequestItemRow {
  id: string;
  loanRequestId: string;
  partnerOrgId: string;
  productModelId: string;
  quantityRequested: number;
  quantityAssigned: number;
  createdAt: Date;
}

export type ReservationStatus = 'active' | 'released' | 'completed' | 'cancelled' | 'expired';

export interface ReservationRow {
  id: string;
  assetId: string;
  loanRequestItemId: string;
  /** Half-open text form, `[from,until)`. */
  period: string;
  status: ReservationStatus;
  createdAt: Date;
}

export interface LoanRow {
  id: string;
  /** Copied from the request once it is numbered (D2: one number per transaction). */
  loanNo: string;
  loanRequestId: string;
  partnerOrgId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  releasedByUserId: string;
  releasedAt: Date;
  dueDate: string;
  closedAt: Date | null;
}

export interface LoanItemRow {
  id: string;
  loanId: string;
  partnerOrgId: string;
  assetId: string;
  reservationId: string;
  releasedAt: Date;
  returnedAt: Date | null;
  accessoriesOut: string[];
  accessoriesBack: string[] | null;
}

export interface LoanExtensionRow {
  id: string;
  loanId: string;
  partnerOrgId: string;
  requestedByUserId: string;
  requestedDueDate: string;
  reason: string;
  decidedByUserId: string;
  decidedAt: Date;
  createdAt: Date;
}

export interface MovementRow {
  id: string;
  assetId: string;
  movementType: MovementType;
  fromStatus: AssetStatus;
  toStatus: AssetStatus;
  toLocationId: string | null;
  actorUserId: string;
  loanItemId: string | null;
  note: string;
  occurredAt: Date;
}

export interface InspectionChecklist {
  powersOn: boolean;
  portsWork: boolean;
  noPhysicalDamage: boolean;
  factoryReset: boolean;
  accessoriesComplete: boolean;
}

export interface InspectionRow {
  id: string;
  loanItemId: string;
  assetId: string;
  inspectorUserId: string;
  condition: ConditionGrade;
  checklist: InspectionChecklist;
  missingAccessories: string[];
  notes: string;
  outcome: 'restock' | 'repair';
  createdAt: Date;
}

export interface RepairTicketRow {
  id: string;
  assetId: string;
  openedByUserId: string;
  problem: string;
  openedAt: Date;
}

export interface AuditRow {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
}

export interface CounterRow {
  prefix: string;
  value: number;
}

export interface SeedPlan {
  locations: LocationRow[];
  productModels: ProductModelRow[];
  modelAccessories: ModelAccessoryRow[];
  partnerOrgs: PartnerOrgRow[];
  staffUsers: StaffUserRow[];
  assets: AssetRow[];
  loanRequests: LoanRequestRow[];
  loanRequestItems: LoanRequestItemRow[];
  reservations: ReservationRow[];
  loans: LoanRow[];
  loanItems: LoanItemRow[];
  loanExtensions: LoanExtensionRow[];
  /** In the order they must be inserted: each unit's moves are in time order. */
  movements: MovementRow[];
  inspections: InspectionRow[];
  repairTickets: RepairTicketRow[];
  auditEntries: AuditRow[];
  counters: CounterRow[];
}
