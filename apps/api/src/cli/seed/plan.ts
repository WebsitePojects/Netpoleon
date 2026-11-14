import { CatalogueBuilder, type Catalogue } from './catalogue.js';
import { SeedClock } from './clock.js';
import { BORROWERS, END_CUSTOMERS, PURPOSES, REJECTION_REASONS, STAFF } from './dataset.js';
import { LendingRecorder, type Borrower, type Transaction } from './lending.js';
import { SeededRandom } from './random.js';
import type { SeedPlan, StaffUserRow } from './rows.js';
import type { UnitTimeline } from './timeline.js';

/** Fixed, so every machine and every test run builds the same dataset for the same instant. */
const RANDOM_SEED = 20261114;

/** Past loans all end before this, so they never collide with the loans open today. */
const HISTORY_ENDS_BEFORE_DAYS_AGO = 44;

/** The audit trail is seeded with this many days of movements, as in the browser demo. */
const AUDIT_DAYS = 45;

const MANILA_OFFSET_MS = 8 * 3_600_000;

/**
 * How many units are dealt into each current state. Together with the completed loans every
 * unit may have had, this produces every transaction stage the console shows.
 */
const CURRENT_STATES = {
  onDemo: 96,
  onDemoOverdue: 9,
  onDemoExtended: 3,
  returned: 46,
  returnedMissingAccessory: 5,
  underInspection: 28,
  forRepair: 6,
  recentlyRestocked: 7,
  awaitingPickup: 5,
  expired: 3,
  cancelledAfterApproval: 2,
  retired: 3,
} as const;

/** Requests that never reserved a unit. */
const UNASSIGNED_REQUESTS = { pending: 9, rejected: 4, cancelled: 2 } as const;

/**
 * Builds the whole development dataset in memory, dated relative to `now`. Pure: the same
 * `now` gives the same rows, ids included.
 */
export function buildSeedPlan(now: Date): SeedPlan {
  return new SeedPlanBuilder(now).build();
}

class SeedPlanBuilder {
  private readonly random = new SeededRandom(RANDOM_SEED);
  private readonly clock: SeedClock;
  private readonly plan: SeedPlan = {
    locations: [],
    productModels: [],
    modelAccessories: [],
    partnerOrgs: [],
    staffUsers: [],
    assets: [],
    loanRequests: [],
    loanRequestItems: [],
    reservations: [],
    loans: [],
    loanItems: [],
    loanExtensions: [],
    movements: [],
    inspections: [],
    repairTickets: [],
    auditEntries: [],
    counters: [],
  };
  private readonly borrowers: Borrower[] = [];

  constructor(now: Date) {
    this.clock = new SeedClock(now);
  }

  build(): SeedPlan {
    const staffId = this.staffUsers();
    this.partnerOrgs();
    const catalogue = new CatalogueBuilder({
      random: this.random,
      clock: this.clock,
      movements: this.plan.movements,
      registrarUserId: staffId('marco'),
    }).build();
    Object.assign(this.plan, {
      locations: catalogue.locations,
      productModels: catalogue.productModels,
      modelAccessories: catalogue.modelAccessories,
      assets: catalogue.assets,
    });

    const lending = new LendingRecorder({
      random: this.random,
      sinks: this.plan,
      areas: catalogue.areas,
      staff: {
        filer: staffId('marco'),
        deciders: [staffId('tina'), staffId('lara')],
        warehouse: staffId('marco'),
      },
    });
    const scenarios = new Scenarios(this.random, this.clock, lending, this.borrowers);
    scenarios.completedLoans(catalogue.units);
    scenarios.currentStates(catalogue.units, staffId('tina'));
    scenarios.unassignedRequests(catalogue);

    this.numberRequests();
    this.plan.movements.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    this.auditTrail();
    this.counters(catalogue);
    return this.plan;
  }

  /** Creates the demo staff; returns a lookup of their ids by username. */
  private staffUsers(): (username: string) => string {
    const ids = new Map<string, string>();
    const createdAt = this.clock.workingHour(540, this.random);
    for (const spec of STAFF) {
      const row: StaffUserRow = {
        id: this.random.uuidV7(createdAt),
        username: spec.username,
        email: `${spec.username}@netpoleon.example`,
        fullName: spec.fullName,
        title: spec.title,
        role: spec.role,
      };
      this.plan.staffUsers.push(row);
      ids.set(spec.username, row.id);
    }
    return (username) => {
      const id = ids.get(username);
      if (!id) {
        throw new Error(`Seed bug: no demo user named ${username}.`);
      }
      return id;
    };
  }

  private partnerOrgs(): void {
    for (const spec of BORROWERS) {
      const id = this.random.uuidV7(this.clock.workingHour(400, this.random));
      this.plan.partnerOrgs.push({ id, name: spec.company, type: spec.companyType });
      const local = spec.contactName.toLowerCase().replace(/[^a-z]+/g, '.');
      // 0917 000 xxxx: an unassigned-looking block, so no demo row is a real person's number.
      const suffix = String(
        1000 + ((spec.contactName.length * 733 + spec.company.length * 97) % 9000),
      );
      this.borrowers.push({
        partnerOrgId: id,
        contactName: spec.contactName,
        contactEmail: `${local}@${spec.domain}`,
        contactPhone: `0917 000 ${suffix}`,
      });
    }
  }

  /** D2: `BRR-<year>-<5 digits>`, numbered per filing year in filing order. */
  private numberRequests(): void {
    const requests = [...this.plan.loanRequests].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const sequenceByPrefix = new Map<string, number>();
    for (const request of requests) {
      const prefix = requestNoPrefix(request.createdAt);
      const sequence = (sequenceByPrefix.get(prefix) ?? 0) + 1;
      sequenceByPrefix.set(prefix, sequence);
      request.requestNo = `${prefix}-${String(sequence).padStart(5, '0')}`;
    }
    const numberOf = new Map(requests.map((request) => [request.id, request.requestNo]));
    for (const loan of this.plan.loans) {
      loan.loanNo = numberOf.get(loan.loanRequestId) ?? '';
    }
    for (const [prefix, value] of sequenceByPrefix) {
      this.plan.counters.push({ prefix, value });
    }
  }

  private auditTrail(): void {
    const from = this.clock.now.getTime() - AUDIT_DAYS * 86_400_000;
    for (const movement of this.plan.movements) {
      if (movement.occurredAt.getTime() < from) {
        continue;
      }
      this.plan.auditEntries.push({
        id: this.random.uuidV7(movement.occurredAt),
        actorUserId: movement.actorUserId,
        action: `unit.${movement.movementType}`,
        targetType: 'asset',
        targetId: movement.assetId,
        occurredAt: movement.occurredAt,
      });
    }
  }

  /** R17: the next code the API hands out must follow the last one seeded. */
  private counters(catalogue: Catalogue): void {
    for (const [prefix, value] of catalogue.lastAssetSequence) {
      this.plan.counters.push({ prefix, value });
    }
  }
}

/** The counters prefix for request numbers filed at `filedAt`: `BRR-<Manila year>`. */
export function requestNoPrefix(filedAt: Date): string {
  return `BRR-${new Date(filedAt.getTime() + MANILA_OFFSET_MS).getUTCFullYear()}`;
}

/** The stories that put units and requests into each state. */
class Scenarios {
  private readonly random: SeededRandom;
  private readonly clock: SeedClock;
  private readonly lending: LendingRecorder;
  private readonly borrowers: readonly Borrower[];

  constructor(
    random: SeededRandom,
    clock: SeedClock,
    lending: LendingRecorder,
    borrowers: readonly Borrower[],
  ) {
    this.random = random;
    this.clock = clock;
    this.lending = lending;
    this.borrowers = borrowers;
  }

  /** Back-to-back past loans per unit over the last seven months, all inspected and restocked. */
  completedLoans(units: readonly UnitTimeline[]): void {
    for (const unit of units) {
      let startDaysAgo = this.random.between(120, 205);
      while (this.random.chance(0.5)) {
        const length = this.random.pick([5, 7, 10, 14, 14, 21]);
        const returnDaysAgo = startDaysAgo - length + this.random.between(-1, 2);
        if (returnDaysAgo < HISTORY_ENDS_BEFORE_DAYS_AGO) {
          break;
        }
        const tx = this.lend(unit, startDaysAgo, length);
        this.lending.receiveAll(tx, this.at(returnDaysAgo), this.random.chance(0.06));
        this.lending.startInspection(tx, this.at(returnDaysAgo - 1));
        this.lending.inspect(tx, this.at(returnDaysAgo - 2), 'restock');
        startDaysAgo = returnDaysAgo - this.random.between(6, 40);
      }
    }
  }

  /** Deals distinct units into each state a unit can be in today. */
  currentStates(units: readonly UnitTimeline[], managerId: string): void {
    const pool = this.random.shuffle(units);
    const deal = (count: number): UnitTimeline[] => {
      if (pool.length < count) {
        throw new Error(`Seed bug: wanted ${count} more units, ${pool.length} left.`);
      }
      return pool.splice(0, count);
    };
    const n = CURRENT_STATES;

    deal(n.onDemo).forEach((unit, index) => {
      const overdue = index < n.onDemoOverdue;
      const length = overdue ? 14 : this.random.pick([14, 21, 30]);
      const startDaysAgo = overdue
        ? length + this.random.between(1, 12)
        : this.random.between(1, Math.min(length - 1, 13));
      const tx = this.lend(unit, startDaysAgo, length);
      if (!overdue && index < n.onDemoOverdue + n.onDemoExtended) {
        const due = tx.request.neededUntil;
        this.lending.extend(tx, SeedClock.addDays(due, 7), this.at(startDaysAgo - 1));
      }
    });

    deal(n.returned).forEach((unit, index) => {
      const returnDaysAgo = this.random.between(0, 4);
      const tx = this.lend(unit, returnDaysAgo + 14, 14);
      this.lending.receiveAll(tx, this.at(returnDaysAgo), index < n.returnedMissingAccessory);
    });

    deal(n.underInspection).forEach((unit) => {
      const returnDaysAgo = this.random.between(2, 7);
      const tx = this.lend(unit, returnDaysAgo + 10, 10);
      this.lending.receiveAll(tx, this.at(returnDaysAgo), false);
      this.lending.startInspection(tx, this.at(returnDaysAgo - 1));
    });

    deal(n.forRepair).forEach((unit) => this.inspectedRecently(unit, 8, 20, 14, 'repair'));
    deal(n.recentlyRestocked).forEach((unit) => this.inspectedRecently(unit, 3, 6, 7, 'restock'));

    deal(n.awaitingPickup).forEach((unit) => {
      const tx = this.request(unit.asset.productModelId, -this.random.between(0, 2), 14, 1, 3);
      this.lending.approve(tx, [unit], this.at(0));
    });

    deal(n.expired).forEach((unit) => {
      const startDaysAgo = this.random.between(6, 8);
      const tx = this.request(
        unit.asset.productModelId,
        startDaysAgo,
        7,
        startDaysAgo + 2,
        startDaysAgo + 4,
      );
      this.lending.approve(tx, [unit], this.at(startDaysAgo + 1));
      this.lending.expire(tx);
    });

    deal(n.cancelledAfterApproval).forEach((unit) => {
      const tx = this.request(unit.asset.productModelId, -this.random.between(3, 6), 7, 3, 5);
      this.lending.approve(tx, [unit], this.at(2));
      this.lending.cancel(tx, 'the customer postponed the evaluation.');
    });

    deal(n.retired).forEach((unit) => {
      const retiredAt = unit.move(
        'retired',
        'retired',
        this.at(this.random.between(10, 30)),
        managerId,
        {
          note: 'End of life: retired from the demo pool',
        },
      );
      unit.asset.retiredAt = retiredAt;
    });
  }

  /** Requests decided without a unit, or not decided yet; they hold no stock. */
  unassignedRequests(catalogue: Catalogue): void {
    const modelIds = catalogue.productModels.map((model) => model.id);
    const n = UNASSIGNED_REQUESTS;

    for (let index = 0; index < n.pending; index += 1) {
      const quantity = this.random.chance(0.25) ? 2 : 1;
      const length = this.random.pick([7, 14, 21]);
      this.request(this.random.pick(modelIds), -this.random.between(1, 6), length, 0, 2, quantity);
    }
    for (let index = 0; index < n.rejected; index += 1) {
      const filedDaysAgo = this.random.between(5, 15);
      const tx = this.request(
        this.random.pick(modelIds),
        filedDaysAgo - 3,
        14,
        filedDaysAgo,
        filedDaysAgo,
      );
      this.lending.reject(tx, this.at(filedDaysAgo - 1), this.random.pick(REJECTION_REASONS));
    }
    for (let index = 0; index < n.cancelled; index += 1) {
      const filedDaysAgo = this.random.between(2, 6);
      const tx = this.request(this.random.pick(modelIds), -3, 7, filedDaysAgo, filedDaysAgo);
      this.lending.cancel(tx, 'no longer needed.');
    }
  }

  /** Lent, returned, inspected; the outcome decides whether it is back on a shelf. */
  private inspectedRecently(
    unit: UnitTimeline,
    minReturnDaysAgo: number,
    maxReturnDaysAgo: number,
    length: number,
    outcome: 'restock' | 'repair',
  ): void {
    const returnDaysAgo = this.random.between(minReturnDaysAgo, maxReturnDaysAgo);
    const tx = this.lend(unit, returnDaysAgo + length, length);
    this.lending.receiveAll(tx, this.at(returnDaysAgo), false);
    this.lending.startInspection(tx, this.at(returnDaysAgo - 1));
    this.lending.inspect(tx, this.at(returnDaysAgo - 2), outcome);
  }

  /** Filed a few days ahead, approved the day before, released on the start date. */
  private lend(unit: UnitTimeline, startDaysAgo: number, length: number): Transaction {
    const tx = this.request(
      unit.asset.productModelId,
      startDaysAgo,
      length,
      startDaysAgo + 2,
      startDaysAgo + 5,
    );
    this.lending.approve(tx, [unit], this.at(startDaysAgo + 1));
    this.lending.release(tx, this.at(startDaysAgo));
    return tx;
  }

  /**
   * Files a request for `length` days starting `startDaysAgo` days ago (negative: in the
   * future), filed between `filedMinDaysAgo` and `filedMaxDaysAgo` days ago.
   */
  private request(
    productModelId: string,
    startDaysAgo: number,
    length: number,
    filedMinDaysAgo: number,
    filedMaxDaysAgo: number,
    quantity = 1,
  ): Transaction {
    return this.lending.file({
      productModelId,
      borrower: this.random.pick(this.borrowers),
      neededFrom: this.clock.date(startDaysAgo),
      neededUntil: this.clock.date(startDaysAgo - length),
      purpose: this.random.pick(PURPOSES),
      endCustomer: this.random.chance(0.6) ? this.random.pick(END_CUSTOMERS) : null,
      filedAt: this.at(this.random.between(filedMinDaysAgo, filedMaxDaysAgo)),
      quantity,
    });
  }

  private at(daysAgo: number): Date {
    return this.clock.workingHour(daysAgo, this.random);
  }
}
