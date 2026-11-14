import type { WorkAreas } from './catalogue.js';
import { SeedClock } from './clock.js';
import type { SeededRandom } from './random.js';
import type {
  InspectionRow,
  LoanExtensionRow,
  LoanItemRow,
  LoanRequestItemRow,
  LoanRequestRow,
  LoanRow,
  RepairTicketRow,
  ReservationRow,
} from './rows.js';
import type { UnitTimeline } from './timeline.js';

/**
 * The default of setting booking.buffer_days (migration 0010). A reservation covers
 * [needed_from, needed_until + 1 + buffer) so the unit is inspected before its next loan (D5).
 */
export const BUFFER_DAYS = 2;

export interface Borrower {
  partnerOrgId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/** Who does what. The filer is never a decider: loan_requests_filer_cannot_decide. */
export interface StaffIds {
  filer: string;
  deciders: readonly string[];
  warehouse: string;
}

interface Assignment {
  unit: UnitTimeline;
  reservation: ReservationRow;
  loanItem: LoanItemRow | null;
}

/** One borrowing from request to close: the rows it owns, kept together while it is built. */
export interface Transaction {
  request: LoanRequestRow;
  item: LoanRequestItemRow;
  assignments: Assignment[];
  loan: LoanRow | null;
}

/** The tables a transaction writes to; the plan owns the arrays. */
export interface LendingSinks {
  loanRequests: LoanRequestRow[];
  loanRequestItems: LoanRequestItemRow[];
  reservations: ReservationRow[];
  loans: LoanRow[];
  loanItems: LoanItemRow[];
  loanExtensions: LoanExtensionRow[];
  inspections: InspectionRow[];
  repairTickets: RepairTicketRow[];
}

/**
 * Records each step of the lifecycle the way the API will (plan D2, D4-D8, R4): status changes
 * go through the unit's timeline, reservations follow the unit, and a decision is written by
 * someone other than the filer.
 */
export class LendingRecorder {
  private readonly random: SeededRandom;
  private readonly sinks: LendingSinks;
  private readonly areas: WorkAreas;
  private readonly staff: StaffIds;

  constructor(opts: {
    random: SeededRandom;
    sinks: LendingSinks;
    areas: WorkAreas;
    staff: StaffIds;
  }) {
    this.random = opts.random;
    this.sinks = opts.sinks;
    this.areas = opts.areas;
    this.staff = opts.staff;
  }

  file(opts: {
    productModelId: string;
    borrower: Borrower;
    neededFrom: string;
    neededUntil: string;
    purpose: string;
    endCustomer: string | null;
    filedAt: Date;
    quantity?: number;
  }): Transaction {
    const { borrower } = opts;
    const request: LoanRequestRow = {
      id: this.random.uuidV7(opts.filedAt),
      requestNo: '',
      partnerOrgId: borrower.partnerOrgId,
      filedByUserId: this.staff.filer,
      contactName: borrower.contactName,
      contactEmail: borrower.contactEmail,
      contactPhone: borrower.contactPhone,
      neededFrom: opts.neededFrom,
      neededUntil: opts.neededUntil,
      purpose: opts.purpose,
      endCustomer: opts.endCustomer,
      status: 'submitted',
      decidedByUserId: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: opts.filedAt,
    };
    const item: LoanRequestItemRow = {
      id: this.random.uuidV7(opts.filedAt),
      loanRequestId: request.id,
      partnerOrgId: borrower.partnerOrgId,
      productModelId: opts.productModelId,
      quantityRequested: opts.quantity ?? 1,
      quantityAssigned: 0,
      createdAt: opts.filedAt,
    };
    this.sinks.loanRequests.push(request);
    this.sinks.loanRequestItems.push(item);
    return { request, item, assignments: [], loan: null };
  }

  /** Assigns one unit per entry in `units` and reserves each for the requested dates. */
  approve(tx: Transaction, units: readonly UnitTimeline[], at: Date): void {
    this.decide(tx, 'approved', at, null);
    const period = `[${tx.request.neededFrom},${SeedClock.addDays(tx.request.neededUntil, 1 + BUFFER_DAYS)})`;
    for (const unit of units) {
      const reservation: ReservationRow = {
        id: this.random.uuidV7(at),
        assetId: unit.asset.id,
        loanRequestItemId: tx.item.id,
        period,
        status: 'active',
        createdAt: at,
      };
      this.sinks.reservations.push(reservation);
      tx.assignments.push({ unit, reservation, loanItem: null });
    }
    tx.item.quantityAssigned = units.length;
  }

  reject(tx: Transaction, at: Date, reason: string): void {
    this.decide(tx, 'rejected', at, reason);
  }

  /**
   * R4: a cancellation never writes decided_by_user_id (the filer-cannot-decide CHECK would
   * raise when the filer cancels); who and why go to decision_note.
   */
  cancel(tx: Transaction, reason: string): void {
    tx.request.status = 'cancelled';
    tx.request.decisionNote = `Cancelled by the requester: ${reason}`;
    for (const { reservation } of tx.assignments) {
      reservation.status = 'cancelled';
    }
  }

  /** Not collected within the pickup grace period: the worker's expiry sweep. */
  expire(tx: Transaction): void {
    tx.request.status = 'expired';
    for (const { reservation } of tx.assignments) {
      reservation.status = 'expired';
    }
  }

  /** Scans every assigned unit out on one loan that reuses the request's number (D2). */
  release(tx: Transaction, at: Date): void {
    const loan: LoanRow = {
      id: this.random.uuidV7(at),
      loanNo: '',
      loanRequestId: tx.request.id,
      partnerOrgId: tx.request.partnerOrgId,
      contactName: tx.request.contactName,
      contactEmail: tx.request.contactEmail,
      contactPhone: tx.request.contactPhone,
      releasedByUserId: this.staff.warehouse,
      releasedAt: at,
      dueDate: tx.request.neededUntil,
      closedAt: null,
    };
    this.sinks.loans.push(loan);
    tx.loan = loan;
    for (const assignment of tx.assignments) {
      const loanItem: LoanItemRow = {
        id: this.random.uuidV7(at),
        loanId: loan.id,
        partnerOrgId: loan.partnerOrgId,
        assetId: assignment.unit.asset.id,
        reservationId: assignment.reservation.id,
        releasedAt: at,
        returnedAt: null,
        accessoriesOut: [...assignment.unit.accessories],
        accessoriesBack: null,
      };
      this.sinks.loanItems.push(loanItem);
      assignment.loanItem = loanItem;
      assignment.reservation.status = 'released';
      assignment.unit.move('released', 'on_demo', at, this.staff.warehouse, {
        toLocationId: this.areas.clientSite,
        loanItemId: loanItem.id,
        // Never the contact's name: movements are append-only and could not be anonymised.
        note: 'Released on demo',
      });
    }
    // Every assigned unit has gone out.
    tx.request.status = 'fulfilled';
  }

  /** D6: a manager moves the due date and the reservation widens with it. */
  extend(tx: Transaction, newDueDate: string, at: Date): void {
    const loan = this.loanOf(tx);
    this.sinks.loanExtensions.push({
      id: this.random.uuidV7(at),
      loanId: loan.id,
      partnerOrgId: loan.partnerOrgId,
      requestedByUserId: this.staff.filer,
      requestedDueDate: newDueDate,
      reason: 'Customer evaluation extended by one week',
      decidedByUserId: this.decider(),
      decidedAt: at,
      createdAt: at,
    });
    for (const { reservation } of tx.assignments) {
      reservation.period = `[${tx.request.neededFrom},${SeedClock.addDays(newDueDate, 1 + BUFFER_DAYS)})`;
    }
  }

  /** Receives every unit of the loan; `missingAccessory` keeps the first accessory back. */
  receiveAll(tx: Transaction, at: Date, missingAccessory: boolean): void {
    const loan = this.loanOf(tx);
    for (const assignment of tx.assignments) {
      const loanItem = this.loanItemOf(assignment);
      const missing = missingAccessory ? assignment.unit.accessories.slice(0, 1) : [];
      loanItem.accessoriesBack = assignment.unit.accessories.filter(
        (name) => !missing.includes(name),
      );
      const returnedAt = assignment.unit.move('returned', 'returned', at, this.staff.warehouse, {
        toLocationId: this.areas.receiving,
        loanItemId: loanItem.id,
        note:
          missing.length > 0
            ? `Returned with missing ${missing.join(', ').toLowerCase()}`
            : 'Returned complete with accessories',
      });
      loanItem.returnedAt = returnedAt;
      // D8: the loan closes when its last unit is back.
      loan.closedAt = returnedAt;
    }
  }

  startInspection(tx: Transaction, at: Date): void {
    for (const { unit } of tx.assignments) {
      unit.move('inspection_started', 'under_inspection', at, this.staff.warehouse, {
        toLocationId: this.areas.qa,
        note: 'Functional check and testing',
      });
    }
  }

  /** The inspection outcome ends the reservation, so the unit is bookable again (D8). */
  inspect(tx: Transaction, at: Date, outcome: InspectionRow['outcome']): void {
    for (const assignment of tx.assignments) {
      const { unit, reservation } = assignment;
      const loanItem = this.loanItemOf(assignment);
      const back = loanItem.accessoriesBack ?? [];
      const missing = loanItem.accessoriesOut.filter((name) => !back.includes(name));
      const fails = outcome === 'repair';
      const inspectedAt = fails
        ? unit.move('sent_to_repair', 'for_repair', at, this.staff.warehouse, {
            toLocationId: this.areas.repairBench,
            note: 'Tagged for repair',
          })
        : unit.move('restocked', 'in_stock', at, this.staff.warehouse, {
            toLocationId: unit.pickShelf(),
            note: 'Restocked after inspection',
          });
      if (fails) {
        unit.asset.condition = 'c';
        this.sinks.repairTickets.push({
          id: this.random.uuidV7(inspectedAt),
          assetId: unit.asset.id,
          openedByUserId: this.staff.warehouse,
          problem: 'Fails the power-on test.',
          openedAt: inspectedAt,
        });
      }
      this.sinks.inspections.push({
        id: this.random.uuidV7(inspectedAt),
        loanItemId: loanItem.id,
        assetId: unit.asset.id,
        inspectorUserId: this.staff.warehouse,
        condition: unit.asset.condition,
        checklist: {
          powersOn: !fails,
          portsWork: !fails,
          noPhysicalDamage: true,
          factoryReset: true,
          accessoriesComplete: missing.length === 0,
        },
        missingAccessories: missing,
        notes: fails ? 'Fails power-on test. Tagged for repair.' : 'Passed all checks.',
        outcome,
        createdAt: inspectedAt,
      });
      reservation.status = 'completed';
    }
  }

  private decide(
    tx: Transaction,
    status: 'approved' | 'rejected',
    at: Date,
    note: string | null,
  ): void {
    tx.request.status = status;
    tx.request.decidedByUserId = this.decider();
    tx.request.decidedAt = at;
    tx.request.decisionNote = note;
  }

  private decider(): string {
    return this.random.pick(this.staff.deciders);
  }

  private loanOf(tx: Transaction): LoanRow {
    if (!tx.loan) {
      throw new Error(
        `Seed bug: request filed at ${tx.request.createdAt.toISOString()} has no loan.`,
      );
    }
    return tx.loan;
  }

  private loanItemOf(assignment: Assignment): LoanItemRow {
    if (!assignment.loanItem) {
      throw new Error(`Seed bug: ${assignment.unit.asset.assetCode} was never released.`);
    }
    return assignment.loanItem;
  }
}
