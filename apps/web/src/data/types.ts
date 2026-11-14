/**
 * Shapes of the demo data. They follow the foundation spec's tables closely enough that
 * replacing the demo store with API calls later does not reshape the screens.
 */

export type UnitStatus =
  'in_stock' | 'on_demo' | 'returned' | 'under_inspection' | 'for_repair' | 'retired';

export type ConditionGrade = 'A' | 'B' | 'C';

export interface Category {
  /** Short code used inside asset codes, for example `SW`. */
  code: string;
  name: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  zone: string;
  /** A shelf holds stock; an area is a work zone such as QA; a site is outside the warehouse. */
  kind: 'shelf' | 'area' | 'site';
}

export interface Unit {
  /** System asset code, `NTP-<category>-<5 digits>`. Identifies exactly one unit. */
  code: string;
  categoryCode: string;
  brand: string;
  model: string;
  serial: string;
  status: UnitStatus;
  locationId: string;
  condition: ConditionGrade;
  /** Accessories the unit ships with; the release and return checklists are built from this. */
  accessories: string[];
  registeredAt: string;
  /** Loan number holding this unit between approval and release, or null. */
  reservedFor: string | null;
  notes: string;
}

export type LoanStatus =
  'pending' | 'approved' | 'rejected' | 'cancelled' | 'released' | 'returned' | 'closed';

export interface Borrower {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export interface Loan {
  /** `BRR-<year>-<5 digits>`. */
  number: string;
  status: LoanStatus;
  /** What was asked for. The physical unit is chosen at approval. */
  categoryCode: string;
  brand: string;
  model: string;
  unitCode: string | null;
  borrower: Borrower;
  purpose: string;
  requestedAt: string;
  filedBy: string;
  /** Calendar dates, `YYYY-MM-DD`. */
  startDate: string;
  dueDate: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  releasedBy: string | null;
  releasedAt: string | null;
  accessoriesOut: string[];
  receivedBy: string | null;
  returnedAt: string | null;
  accessoriesBack: string[];
  returnNote: string;
}

export type MovementType =
  | 'registered'
  | 'stocked'
  | 'moved'
  | 'reserved'
  | 'reservation_cancelled'
  | 'released'
  | 'returned'
  | 'inspection_started'
  | 'restocked'
  | 'sent_to_repair'
  | 'repaired'
  | 'retired';

export interface Movement {
  id: number;
  at: string;
  unitCode: string;
  type: MovementType;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus;
  /** Username of the staff member who did it. */
  by: string;
  loanNumber: string | null;
  note: string;
}

export type InspectionOutcome = 'restock' | 'repair' | 'reassign';

export interface InspectionChecklist {
  powersOn: boolean;
  portsWork: boolean;
  noPhysicalDamage: boolean;
  factoryReset: boolean;
  accessoriesComplete: boolean;
}

export interface Inspection {
  id: number;
  at: string;
  unitCode: string;
  loanNumber: string | null;
  inspector: string;
  grade: ConditionGrade;
  checklist: InspectionChecklist;
  notes: string;
  outcome: InspectionOutcome;
}

export type Role = 'admin' | 'manager' | 'warehouse' | 'auditor';

export interface User {
  username: string;
  name: string;
  email: string;
  title: string;
  role: Role;
  active: boolean;
  lastActiveAt: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface Settings {
  companyName: string;
  warehouseName: string;
  timezone: string;
  defaultLoanDays: number;
  maxLoanDays: number;
  turnaroundBufferDays: number;
  pickupGraceDays: number;
  notifyOverdue: boolean;
  notifyMissingAccessory: boolean;
  notifyForInspection: boolean;
  notifyReadyForRedeployment: boolean;
  overdueReminderDays: number;
  labelSize: '50x25' | '70x35' | '100x50';
  labelShowsSerial: boolean;
  sessionMinutes: number;
  passwordMinLength: number;
  lockAfterFailedAttempts: number;
}

export interface WmsState {
  /** Bumped when the stored shape changes, so an old browser copy is discarded, not misread. */
  version: number;
  seededOn: string;
  categories: Category[];
  locations: StorageLocation[];
  units: Unit[];
  loans: Loan[];
  movements: Movement[];
  inspections: Inspection[];
  users: User[];
  audit: AuditEntry[];
  settings: Settings;
  readAlertIds: string[];
  counters: { loan: number; movement: number; inspection: number; audit: number };
}
