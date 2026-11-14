import { addDays, daysBetween, toDateKey } from '../lib/dates.js';
import { can, type Action } from './permissions.js';
import {
  buildSeed,
  formatAssetCode,
  formatLoanNumber,
  LOCATION_IDS,
  STATE_VERSION,
} from './seed.js';
import type {
  Borrower,
  ConditionGrade,
  InspectionChecklist,
  InspectionOutcome,
  Loan,
  MovementType,
  Role,
  Settings,
  Unit,
  UnitStatus,
  User,
  WmsState,
} from './types.js';

/** A rule of the system was broken. The message is written for the person at the screen. */
export class WmsError extends Error {
  override readonly name = 'WmsError';
}

/** The slice of `Storage` the store needs, so tests can pass a plain in-memory object. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'wms-demo-state';

/**
 * The only legal status changes. A movement whose unit is not in one of the `from` statuses
 * is rejected, which is the browser-side mirror of the `asset_transitions` table.
 */
const TRANSITIONS: Record<MovementType, { from: UnitStatus[]; to: UnitStatus }> = {
  registered: { from: [], to: 'in_stock' },
  stocked: { from: ['in_stock'], to: 'in_stock' },
  moved: { from: ['in_stock'], to: 'in_stock' },
  reserved: { from: ['in_stock'], to: 'in_stock' },
  reservation_cancelled: { from: ['in_stock'], to: 'in_stock' },
  released: { from: ['in_stock'], to: 'on_demo' },
  returned: { from: ['on_demo'], to: 'returned' },
  inspection_started: { from: ['returned'], to: 'under_inspection' },
  restocked: { from: ['under_inspection'], to: 'in_stock' },
  sent_to_repair: { from: ['under_inspection', 'in_stock'], to: 'for_repair' },
  repaired: { from: ['for_repair'], to: 'in_stock' },
  retired: { from: ['in_stock', 'for_repair'], to: 'retired' },
};

export interface RegisterUnitInput {
  categoryCode: string;
  brand: string;
  model: string;
  serial: string;
  locationId: string;
  condition: ConditionGrade;
  accessories: string[];
  notes: string;
}

export interface RequestInput {
  brand: string;
  model: string;
  borrower: Borrower;
  purpose: string;
  startDate: string;
  dueDate: string;
}

export interface InspectionInput {
  grade: ConditionGrade;
  checklist: InspectionChecklist;
  notes: string;
  outcome: InspectionOutcome;
  /** Shelf to put the unit on. Required unless the outcome is `repair`. */
  locationId: string | null;
}

export interface UserInput {
  username: string;
  name: string;
  email: string;
  title: string;
  role: Role;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,23}$/;

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new WmsError(`${label} is required.`);
  return trimmed;
}

function normaliseCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * The demo system of record. Every screen reads state from here and every change goes through
 * one of these methods, each of which checks permission, checks the rule, and writes the audit
 * entry in the same step. Replacing this class with API calls is the slice 2 and 3 work.
 */
export class WmsStore {
  private state: WmsState;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): WmsState => this.state;

  /** Discards every change and returns to fresh demo data. */
  reset(): void {
    this.storage.removeItem(STORAGE_KEY);
    this.commit(buildSeed(this.now()));
  }

  // ── Units ────────────────────────────────────────────────────────────────

  registerUnit(actor: string, input: RegisterUnitInput): Unit {
    const draft = this.draftFor(actor, 'unit.register');
    const brand = required(input.brand, 'Brand');
    const model = required(input.model, 'Model');
    const serial = normaliseCode(required(input.serial, 'Serial number'));
    if (!draft.categories.some((category) => category.code === input.categoryCode)) {
      throw new WmsError('Choose a category.');
    }
    const location = draft.locations.find((item) => item.id === input.locationId);
    if (!location || location.kind === 'site') {
      throw new WmsError('Choose a shelf or warehouse area for the unit.');
    }
    const duplicate = draft.units.find((unit) => unit.serial === serial);
    if (duplicate) {
      throw new WmsError(`Serial number ${serial} is already registered as ${duplicate.code}.`);
    }

    const highest = draft.units
      .filter((unit) => unit.categoryCode === input.categoryCode)
      .reduce((max, unit) => Math.max(max, Number(unit.code.slice(-5))), 0);
    const unit: Unit = {
      code: formatAssetCode(input.categoryCode, highest + 1),
      categoryCode: input.categoryCode,
      brand,
      model,
      serial,
      status: 'in_stock',
      locationId: LOCATION_IDS.receiving,
      condition: input.condition,
      accessories: input.accessories.map((item) => item.trim()).filter(Boolean),
      registeredAt: this.now().toISOString(),
      reservedFor: null,
      notes: input.notes.trim(),
    };
    draft.units = [unit, ...draft.units];
    this.pushMovement(draft, unit.code, 'registered', actor, null, 'Unit registered');
    if (location.kind === 'shelf') {
      this.moveInDraft(draft, unit.code, 'stocked', actor, null, `Stocked on ${location.name}`, {
        locationId: location.id,
      });
    }
    this.audit(draft, actor, 'unit.registered', unit.code, `${brand} ${model}, serial ${serial}`);
    this.commit(draft);
    return this.unit(unit.code);
  }

  updateUnit(
    actor: string,
    code: string,
    patch: Pick<Unit, 'brand' | 'model' | 'serial' | 'accessories' | 'notes'>,
  ): void {
    const draft = this.draftFor(actor, 'unit.edit');
    const unit = this.unitIn(draft, code);
    const serial = normaliseCode(required(patch.serial, 'Serial number'));
    const duplicate = draft.units.find((other) => other.serial === serial && other.code !== code);
    if (duplicate) {
      throw new WmsError(`Serial number ${serial} already belongs to ${duplicate.code}.`);
    }
    this.replaceUnit(draft, {
      ...unit,
      brand: required(patch.brand, 'Brand'),
      model: required(patch.model, 'Model'),
      serial,
      accessories: patch.accessories.map((item) => item.trim()).filter(Boolean),
      notes: patch.notes.trim(),
    });
    this.audit(draft, actor, 'unit.edited', code, 'Details updated');
    this.commit(draft);
  }

  moveUnit(actor: string, code: string, locationId: string): void {
    const draft = this.draftFor(actor, 'unit.move');
    const location = this.shelfIn(draft, locationId);
    const unit = this.unitIn(draft, code);
    if (unit.locationId === locationId)
      throw new WmsError(`The unit is already on ${location.name}.`);
    this.moveInDraft(draft, code, 'moved', actor, null, `Moved to ${location.name}`, {
      locationId,
    });
    this.audit(draft, actor, 'unit.moved', code, `Moved to ${location.name}`);
    this.commit(draft);
  }

  sendToRepair(actor: string, code: string, reason: string): void {
    const draft = this.draftFor(actor, 'unit.repair');
    const note = required(reason, 'Reason');
    this.assertNotReserved(this.unitIn(draft, code));
    this.moveInDraft(draft, code, 'sent_to_repair', actor, null, note, {
      locationId: LOCATION_IDS.repair,
    });
    this.audit(draft, actor, 'unit.sent_to_repair', code, note);
    this.commit(draft);
  }

  completeRepair(actor: string, code: string, locationId: string, note: string): void {
    const draft = this.draftFor(actor, 'unit.repair');
    const location = this.shelfIn(draft, locationId);
    const detail = note.trim() || `Repaired and restocked on ${location.name}`;
    this.moveInDraft(draft, code, 'repaired', actor, null, detail, { locationId });
    this.audit(draft, actor, 'unit.repaired', code, detail);
    this.commit(draft);
  }

  retireUnit(actor: string, code: string, reason: string): void {
    const draft = this.draftFor(actor, 'unit.retire');
    const note = required(reason, 'Reason');
    this.assertNotReserved(this.unitIn(draft, code));
    this.moveInDraft(draft, code, 'retired', actor, null, note, {});
    this.audit(draft, actor, 'unit.retired', code, note);
    this.commit(draft);
  }

  // ── Borrowing ────────────────────────────────────────────────────────────

  createRequest(actor: string, input: RequestInput): Loan {
    const draft = this.draftFor(actor, 'loan.request');
    const sample = draft.units.find(
      (unit) =>
        unit.brand === input.brand && unit.model === input.model && unit.status !== 'retired',
    );
    if (!sample) throw new WmsError('Choose a model that exists in the inventory.');

    const borrower: Borrower = {
      name: required(input.borrower.name, 'Borrower name'),
      company: required(input.borrower.company, 'Company'),
      email: required(input.borrower.email, 'Email'),
      phone: required(input.borrower.phone, 'Contact number'),
    };
    if (!EMAIL_PATTERN.test(borrower.email)) throw new WmsError('Enter a valid email address.');

    const today = toDateKey(this.now());
    if (!input.startDate || !input.dueDate)
      throw new WmsError('Choose the release and return dates.');
    if (input.startDate < today) throw new WmsError('The release date cannot be in the past.');
    const length = daysBetween(input.startDate, input.dueDate);
    if (length < 1) throw new WmsError('The return date must be after the release date.');
    if (length > draft.settings.maxLoanDays) {
      throw new WmsError(`A loan can run for at most ${draft.settings.maxLoanDays} days.`);
    }

    draft.counters = { ...draft.counters, loan: draft.counters.loan + 1 };
    const loan: Loan = {
      number: formatLoanNumber(this.now().getFullYear(), draft.counters.loan),
      status: 'pending',
      categoryCode: sample.categoryCode,
      brand: sample.brand,
      model: sample.model,
      unitCode: null,
      borrower,
      purpose: required(input.purpose, 'Purpose'),
      requestedAt: this.now().toISOString(),
      filedBy: actor,
      startDate: input.startDate,
      dueDate: input.dueDate,
      decidedBy: null,
      decidedAt: null,
      rejectionReason: null,
      releasedBy: null,
      releasedAt: null,
      accessoriesOut: [],
      receivedBy: null,
      returnedAt: null,
      accessoriesBack: [],
      returnNote: '',
    };
    draft.loans = [...draft.loans, loan];
    const detail = `${loan.brand} ${loan.model} for ${borrower.company}`;
    this.audit(draft, actor, 'loan.requested', loan.number, detail);
    this.commit(draft);
    return loan;
  }

  approveRequest(actor: string, loanNumber: string, unitCode: string): void {
    const draft = this.draftFor(actor, 'loan.decide');
    const loan = this.loanIn(draft, loanNumber, ['pending']);
    this.assertNotOwnRequest(loan, actor);
    const unit = this.unitIn(draft, unitCode);
    if (unit.brand !== loan.brand || unit.model !== loan.model) {
      throw new WmsError(`${unit.code} is not a ${loan.brand} ${loan.model}.`);
    }
    this.assertNotReserved(unit);
    this.moveInDraft(
      draft,
      unit.code,
      'reserved',
      actor,
      loan.number,
      `Reserved for ${loan.borrower.company}`,
      { reservedFor: loan.number },
    );
    this.replaceLoan(draft, {
      ...loan,
      status: 'approved',
      unitCode: unit.code,
      decidedBy: actor,
      decidedAt: this.now().toISOString(),
    });
    this.audit(draft, actor, 'loan.approved', loan.number, `Assigned ${unit.code}`);
    this.commit(draft);
  }

  rejectRequest(actor: string, loanNumber: string, reason: string): void {
    const draft = this.draftFor(actor, 'loan.decide');
    const loan = this.loanIn(draft, loanNumber, ['pending']);
    this.assertNotOwnRequest(loan, actor);
    const rejectionReason = required(reason, 'Reason');
    this.replaceLoan(draft, {
      ...loan,
      status: 'rejected',
      rejectionReason,
      decidedBy: actor,
      decidedAt: this.now().toISOString(),
    });
    this.audit(draft, actor, 'loan.rejected', loan.number, rejectionReason);
    this.commit(draft);
  }

  cancelRequest(actor: string, loanNumber: string, reason: string): void {
    const draft = this.draftFor(actor, 'loan.cancel');
    const loan = this.loanIn(draft, loanNumber, ['pending', 'approved']);
    const note = required(reason, 'Reason');
    if (loan.unitCode) {
      this.moveInDraft(draft, loan.unitCode, 'reservation_cancelled', actor, loan.number, note, {
        reservedFor: null,
      });
    }
    this.replaceLoan(draft, { ...loan, status: 'cancelled', rejectionReason: note });
    this.audit(draft, actor, 'loan.cancelled', loan.number, note);
    this.commit(draft);
  }

  releaseLoan(
    actor: string,
    loanNumber: string,
    scannedCode: string,
    accessoriesOut: string[],
  ): void {
    const draft = this.draftFor(actor, 'loan.release');
    const loan = this.loanIn(draft, loanNumber, ['approved']);
    const unit = this.unitIn(draft, loan.unitCode ?? '');
    this.assertScanMatches(scannedCode, unit.code);
    const unknown = accessoriesOut.find((item) => !unit.accessories.includes(item));
    if (unknown) throw new WmsError(`"${unknown}" is not an accessory of ${unit.code}.`);

    this.moveInDraft(
      draft,
      unit.code,
      'released',
      actor,
      loan.number,
      `Released to ${loan.borrower.company}`,
      { locationId: LOCATION_IDS.clientSite, reservedFor: null },
    );
    this.replaceLoan(draft, {
      ...loan,
      status: 'released',
      releasedBy: actor,
      releasedAt: this.now().toISOString(),
      accessoriesOut: [...accessoriesOut],
    });
    this.audit(draft, actor, 'loan.released', loan.number, `${unit.code} scanned out`);
    this.commit(draft);
  }

  receiveReturn(
    actor: string,
    loanNumber: string,
    scannedCode: string,
    accessoriesBack: string[],
    note: string,
  ): void {
    const draft = this.draftFor(actor, 'loan.receive');
    const loan = this.loanIn(draft, loanNumber, ['released']);
    const unit = this.unitIn(draft, loan.unitCode ?? '');
    this.assertScanMatches(scannedCode, unit.code);
    const unknown = accessoriesBack.find((item) => !loan.accessoriesOut.includes(item));
    if (unknown) throw new WmsError(`"${unknown}" was not released with this unit.`);

    const missing = loan.accessoriesOut.filter((item) => !accessoriesBack.includes(item));
    const summary =
      missing.length > 0
        ? `Returned with missing ${missing.join(', ').toLowerCase()}`
        : 'Returned complete with accessories';
    const returnNote = note.trim() ? `${summary}. ${note.trim()}` : summary;
    this.moveInDraft(draft, unit.code, 'returned', actor, loan.number, returnNote, {
      locationId: LOCATION_IDS.receiving,
    });
    this.replaceLoan(draft, {
      ...loan,
      status: 'returned',
      receivedBy: actor,
      returnedAt: this.now().toISOString(),
      accessoriesBack: [...accessoriesBack],
      returnNote,
    });
    this.audit(draft, actor, 'loan.returned', loan.number, returnNote);
    this.commit(draft);
  }

  extendLoan(actor: string, loanNumber: string, newDueDate: string): void {
    const draft = this.draftFor(actor, 'loan.extend');
    const loan = this.loanIn(draft, loanNumber, ['released']);
    if (!newDueDate || newDueDate <= loan.dueDate) {
      throw new WmsError('The new return date must be later than the current one.');
    }
    const latest = addDays(loan.startDate, draft.settings.maxLoanDays);
    if (newDueDate > latest) {
      throw new WmsError(`A loan can run for at most ${draft.settings.maxLoanDays} days.`);
    }
    this.replaceLoan(draft, { ...loan, dueDate: newDueDate });
    this.audit(draft, actor, 'loan.extended', loan.number, `Return date moved to ${newDueDate}`);
    this.commit(draft);
  }

  // ── Inspection ───────────────────────────────────────────────────────────

  startInspection(actor: string, unitCode: string): void {
    const draft = this.draftFor(actor, 'inspection.perform');
    const loan = this.openReturnFor(draft, unitCode);
    this.moveInDraft(
      draft,
      unitCode,
      'inspection_started',
      actor,
      loan?.number ?? null,
      'Functional check and testing',
      { locationId: LOCATION_IDS.qa },
    );
    this.audit(draft, actor, 'inspection.started', unitCode, 'Moved to QA Area');
    this.commit(draft);
  }

  recordInspection(actor: string, unitCode: string, input: InspectionInput): void {
    const draft = this.draftFor(actor, 'inspection.perform');
    const loan = this.openReturnFor(draft, unitCode);
    const notes = input.notes.trim();
    if (input.outcome === 'repair' && !notes) {
      throw new WmsError('Describe the fault so the repair bench knows what to fix.');
    }

    if (input.outcome === 'repair') {
      this.moveInDraft(draft, unitCode, 'sent_to_repair', actor, loan?.number ?? null, notes, {
        locationId: LOCATION_IDS.repair,
        condition: input.grade,
      });
    } else {
      const location = this.shelfIn(draft, input.locationId ?? '');
      const verb = input.outcome === 'reassign' ? 'Reassigned to' : 'Restocked on';
      this.moveInDraft(
        draft,
        unitCode,
        'restocked',
        actor,
        loan?.number ?? null,
        `${verb} ${location.name}`,
        { locationId: location.id, condition: input.grade },
      );
    }

    draft.counters = { ...draft.counters, inspection: draft.counters.inspection + 1 };
    draft.inspections = [
      ...draft.inspections,
      {
        id: draft.counters.inspection,
        at: this.now().toISOString(),
        unitCode,
        loanNumber: loan?.number ?? null,
        inspector: actor,
        grade: input.grade,
        checklist: { ...input.checklist },
        notes,
        outcome: input.outcome,
      },
    ];
    if (loan) this.replaceLoan(draft, { ...loan, status: 'closed' });
    this.audit(
      draft,
      actor,
      'inspection.recorded',
      unitCode,
      `Grade ${input.grade}, ${input.outcome}`,
    );
    this.commit(draft);
  }

  // ── Users and settings ───────────────────────────────────────────────────

  addUser(actor: string, input: UserInput): void {
    const draft = this.draftFor(actor, 'users.manage');
    const username = input.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      throw new WmsError(
        'Username: 3 to 24 characters, starting with a letter; letters, digits, . _ -',
      );
    }
    if (draft.users.some((user) => user.username === username)) {
      throw new WmsError(`Username "${username}" is already taken.`);
    }
    const email = required(input.email, 'Email');
    if (!EMAIL_PATTERN.test(email)) throw new WmsError('Enter a valid email address.');
    const user: User = {
      username,
      name: required(input.name, 'Full name'),
      email,
      title: input.title.trim(),
      role: input.role,
      active: true,
      lastActiveAt: null,
    };
    draft.users = [...draft.users, user];
    this.audit(draft, actor, 'user.added', username, `Role ${input.role}`);
    this.commit(draft);
  }

  updateUser(actor: string, username: string, patch: Omit<UserInput, 'username'>): void {
    const draft = this.draftFor(actor, 'users.manage');
    const user = this.userIn(draft, username);
    const email = required(patch.email, 'Email');
    if (!EMAIL_PATTERN.test(email)) throw new WmsError('Enter a valid email address.');
    if (user.role === 'admin' && patch.role !== 'admin') this.assertAnotherAdmin(draft, username);
    draft.users = draft.users.map((item) =>
      item.username === username
        ? {
            ...item,
            name: required(patch.name, 'Full name'),
            email,
            title: patch.title.trim(),
            role: patch.role,
          }
        : item,
    );
    this.audit(draft, actor, 'user.updated', username, `Role ${patch.role}`);
    this.commit(draft);
  }

  setUserActive(actor: string, username: string, active: boolean): void {
    const draft = this.draftFor(actor, 'users.manage');
    const user = this.userIn(draft, username);
    if (!active && username === actor)
      throw new WmsError('You cannot deactivate your own account.');
    if (!active && user.role === 'admin') this.assertAnotherAdmin(draft, username);
    draft.users = draft.users.map((item) =>
      item.username === username ? { ...item, active } : item,
    );
    this.audit(draft, actor, active ? 'user.reactivated' : 'user.deactivated', username, '');
    this.commit(draft);
  }

  updateSettings(actor: string, patch: Partial<Settings>): void {
    const draft = this.draftFor(actor, 'settings.manage');
    const next = { ...draft.settings, ...patch };
    const wholeNumbers: (keyof Settings)[] = [
      'defaultLoanDays',
      'maxLoanDays',
      'turnaroundBufferDays',
      'pickupGraceDays',
      'overdueReminderDays',
      'sessionMinutes',
      'passwordMinLength',
      'lockAfterFailedAttempts',
    ];
    for (const key of wholeNumbers) {
      const value = next[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new WmsError('Enter whole numbers of zero or more.');
      }
    }
    if (next.defaultLoanDays < 1 || next.defaultLoanDays > next.maxLoanDays) {
      throw new WmsError('The default loan length must be between 1 day and the maximum.');
    }
    required(next.companyName, 'Company name');
    draft.settings = next;
    this.audit(draft, actor, 'settings.updated', 'settings', Object.keys(patch).join(', '));
    this.commit(draft);
  }

  addCategory(actor: string, code: string, name: string): void {
    const draft = this.draftFor(actor, 'settings.manage');
    const categoryCode = normaliseCode(required(code, 'Code'));
    if (!/^[A-Z]{2,4}$/.test(categoryCode)) throw new WmsError('The code is 2 to 4 letters.');
    if (draft.categories.some((category) => category.code === categoryCode)) {
      throw new WmsError(`Code ${categoryCode} is already in use.`);
    }
    draft.categories = [...draft.categories, { code: categoryCode, name: required(name, 'Name') }];
    this.audit(draft, actor, 'category.added', categoryCode, name.trim());
    this.commit(draft);
  }

  addLocation(actor: string, name: string, zone: string): void {
    const draft = this.draftFor(actor, 'settings.manage');
    const locationName = required(name, 'Name');
    const id = `shelf-${locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (draft.locations.some((location) => location.id === id || location.name === locationName)) {
      throw new WmsError(`A location named "${locationName}" already exists.`);
    }
    draft.locations = [
      ...draft.locations,
      { id, name: locationName, zone: required(zone, 'Zone'), kind: 'shelf' },
    ];
    this.audit(draft, actor, 'location.added', locationName, zone.trim());
    this.commit(draft);
  }

  /** Marking alerts read is personal housekeeping, so it is not permission-gated or audited. */
  markAlertsRead(alertIds: string[]): void {
    const merged = new Set([...this.state.readAlertIds, ...alertIds]);
    if (merged.size === this.state.readAlertIds.length) return;
    this.commit({ ...this.state, readAlertIds: [...merged] });
  }

  /** Records a sign-in so the Users screen shows a truthful "last active". */
  touchUser(username: string): void {
    const at = this.now().toISOString();
    const draft = { ...this.state };
    draft.users = draft.users.map((user) =>
      user.username === username ? { ...user, lastActiveAt: at } : user,
    );
    this.audit(draft, username, 'session.signed_in', username, '');
    this.commit(draft);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private load(): WmsState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<WmsState>;
        if (parsed.version === STATE_VERSION && Array.isArray(parsed.units)) {
          return parsed as WmsState;
        }
      } catch (error) {
        console.warn('Saved demo data could not be read and was replaced with fresh data.', error);
      }
    }
    return buildSeed(this.now());
  }

  private commit(next: WmsState): void {
    this.state = next;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // A full or blocked localStorage must not lose the change on screen; it only stops
      // the change surviving a reload, and the console says so.
      console.warn(
        'Demo data could not be saved to this browser; changes last until reload.',
        error,
      );
    }
    for (const listener of this.listeners) listener();
  }

  /** Checks the actor may perform `action`, then returns a shallow copy safe to modify. */
  private draftFor(actor: string, action: Action): WmsState {
    const user = this.state.users.find((item) => item.username === actor);
    if (!user || !user.active) throw new WmsError('Your account is not active. Sign in again.');
    if (!can(user.role, action)) throw new WmsError('Your role does not allow this action.');
    return { ...this.state };
  }

  private unit(code: string): Unit {
    return this.unitIn(this.state, code);
  }

  private unitIn(state: WmsState, code: string): Unit {
    const unit = state.units.find((item) => item.code === code);
    if (!unit) throw new WmsError(`No unit has the asset code ${code || '(empty)'}.`);
    return unit;
  }

  private loanIn(state: WmsState, number: string, allowed: Loan['status'][]): Loan {
    const loan = state.loans.find((item) => item.number === number);
    if (!loan) throw new WmsError(`Transaction ${number} was not found.`);
    if (!allowed.includes(loan.status)) {
      // The usual cause is a second click or a second person acting on the same request.
      throw new WmsError(`${number} is already ${loan.status}; refresh to see its current state.`);
    }
    return loan;
  }

  private userIn(state: WmsState, username: string): User {
    const user = state.users.find((item) => item.username === username);
    if (!user) throw new WmsError(`User "${username}" was not found.`);
    return user;
  }

  private shelfIn(state: WmsState, locationId: string) {
    const location = state.locations.find((item) => item.id === locationId);
    if (!location || location.kind !== 'shelf') throw new WmsError('Choose a shelf for the unit.');
    return location;
  }

  /** The loan whose return is still waiting for an inspection result, if any. */
  private openReturnFor(state: WmsState, unitCode: string): Loan | undefined {
    return state.loans.find((loan) => loan.unitCode === unitCode && loan.status === 'returned');
  }

  private assertNotReserved(unit: Unit): void {
    if (unit.reservedFor) {
      throw new WmsError(`${unit.code} is reserved for ${unit.reservedFor}.`);
    }
  }

  private assertNotOwnRequest(loan: Loan, actor: string): void {
    if (loan.filedBy === actor) {
      throw new WmsError('You filed this request, so another approver must decide it.');
    }
  }

  private assertScanMatches(scannedCode: string, expectedCode: string): void {
    const scanned = normaliseCode(scannedCode);
    if (!scanned) throw new WmsError('Scan or type the asset code on the unit label.');
    if (scanned !== expectedCode) {
      throw new WmsError(`Scanned ${scanned}, but this transaction is for ${expectedCode}.`);
    }
  }

  private assertAnotherAdmin(state: WmsState, username: string): void {
    const others = state.users.filter(
      (user) => user.role === 'admin' && user.active && user.username !== username,
    );
    if (others.length === 0) throw new WmsError('At least one active administrator must remain.');
  }

  private replaceUnit(draft: WmsState, unit: Unit): void {
    draft.units = draft.units.map((item) => (item.code === unit.code ? unit : item));
  }

  private replaceLoan(draft: WmsState, loan: Loan): void {
    draft.loans = draft.loans.map((item) => (item.number === loan.number ? loan : item));
  }

  /** Appends the movement row. Only `moveInDraft` and registration call this. */
  private pushMovement(
    draft: WmsState,
    unitCode: string,
    type: MovementType,
    actor: string,
    loanNumber: string | null,
    note: string,
  ): void {
    const unit = this.unitIn(draft, unitCode);
    draft.counters = { ...draft.counters, movement: draft.counters.movement + 1 };
    draft.movements = [
      ...draft.movements,
      {
        id: draft.counters.movement,
        at: this.now().toISOString(),
        unitCode,
        type,
        fromStatus: type === 'registered' ? null : unit.status,
        toStatus: TRANSITIONS[type].to,
        by: actor,
        loanNumber,
        note,
      },
    ];
  }

  /**
   * The one place a unit's status changes: validates the transition, writes the movement and
   * applies the new status together, so history and current state cannot disagree.
   */
  private moveInDraft(
    draft: WmsState,
    unitCode: string,
    type: MovementType,
    actor: string,
    loanNumber: string | null,
    note: string,
    patch: Partial<Pick<Unit, 'locationId' | 'reservedFor' | 'condition'>>,
  ): void {
    const unit = this.unitIn(draft, unitCode);
    const rule = TRANSITIONS[type];
    if (!rule.from.includes(unit.status)) {
      throw new WmsError(
        `${unit.code} is ${unit.status.replaceAll('_', ' ')}, so "${type.replaceAll('_', ' ')}" is not allowed.`,
      );
    }
    this.pushMovement(draft, unitCode, type, actor, loanNumber, note);
    this.replaceUnit(draft, { ...unit, ...patch, status: rule.to });
  }

  private audit(
    draft: WmsState,
    actor: string,
    action: string,
    target: string,
    detail: string,
  ): void {
    draft.counters = { ...draft.counters, audit: draft.counters.audit + 1 };
    draft.audit = [
      ...draft.audit,
      { id: draft.counters.audit, at: this.now().toISOString(), actor, action, target, detail },
    ];
  }
}
