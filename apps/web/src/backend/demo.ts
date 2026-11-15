import type {
  AssetDetail,
  AuditEntry,
  BatchResult,
  Catalog,
  Location,
  Partner as PartnerView,
  SessionUser,
  TokenOwner,
  TokenPurpose,
  User as UserView,
} from '@wms/contracts';
import { daysOverdue } from '../data/selectors.js';
import { DEMO_ADMIN_USERNAME, DEMO_PASSWORD } from '../data/seed.js';
import { WmsError, type WmsStore } from '../data/store.js';
import type { ConditionGrade, Partner, Unit, User, WmsState } from '../data/types.js';
import { toDateKey } from '../lib/dates.js';
import type {
  Backend,
  Invitation,
  NewModel,
  PartnerLoan,
  UnitPage,
  UnitQuery,
  UnitView,
} from './types.js';

/**
 * DEMO BACKEND. Runs the whole system in the browser on the demo store and speaks the same
 * shapes as the API, so the screens cannot tell the two apart. Nothing here is security: the
 * session is a name in browser storage, and an empty sign-in enters as the demo admin
 * (project owner's instruction, 2026-11-14).
 */

const SESSION_KEY = 'wms-demo-session';
// A demo request takes a moment, like a real one, so loading states are seen and tested.
const LATENCY_MS = 420;

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

const toGrade = (grade: ConditionGrade): AssetDetail['asset']['condition'] =>
  grade.toLowerCase() as AssetDetail['asset']['condition'];
const fromGrade = (grade: string): ConditionGrade =>
  grade === 'a' ? 'A' : grade === 'b' ? 'B' : 'C';

/** A demo model has no table of its own: it is identified by category, brand and model. */
const modelId = (categoryCode: string, brand: string, model: string) =>
  `${categoryCode}|${brand}|${model}`;

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  } catch {
    return null; // storage blocked: the visitor simply starts signed out
  }
}

function writeSession(username: string | null, remember: boolean): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    if (username) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, username);
  } catch {
    // Storage blocked: the session lasts until the tab reloads.
  }
}

function sessionUserOf(user: User): SessionUser {
  return {
    id: user.username,
    email: user.email,
    fullName: user.name,
    kind: 'staff',
    role: user.role,
    partnerOrgId: null,
  };
}

function userView(user: User, seededOn: string): UserView {
  return {
    id: user.username,
    email: user.email,
    fullName: user.name,
    jobTitle: user.title || null,
    phone: null,
    role: user.role,
    status: user.invited ? 'invited' : user.active ? 'active' : 'deactivated',
    lastLoginAt: user.lastActiveAt,
    createdAt: new Date(`${seededOn}T00:00:00`).toISOString(),
  };
}

export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  private username: string | null = readSession();
  /** Models added in this tab before any unit uses them. */
  private readonly extraModels = new Map<string, NewModel>();

  constructor(private readonly store: WmsStore) {}

  /** The signed-in demo account, read synchronously: the store actions need a name. */
  get actor(): string {
    if (!this.username) throw new WmsError('Your session has ended. Sign in again.');
    return this.username;
  }

  /** Demo convenience: change account without the sign-in screen, to try each role. */
  switchTo(username: string): void {
    this.username = username;
    writeSession(username, false);
    this.store.touchUser(username);
  }

  private get state(): WmsState {
    return this.store.getState();
  }

  // ── Session ──────────────────────────────────────────────────────────────

  async signIn(login: string, password: string, remember: boolean): Promise<SessionUser> {
    await delay();
    const name = login.trim().toLowerCase();
    const bypass = name === '' && password === '';
    const account = this.state.users.find((user) =>
      bypass
        ? user.username === DEMO_ADMIN_USERNAME
        : user.username === name || user.email.toLowerCase() === name,
    );
    // An account that set its own password (invite or reset) must use it; the rest still
    // share the demo password.
    const own = account ? this.store.checkOwnPassword(account.username, password) : null;
    const accepted = bypass || own === true || (own === null && password === DEMO_PASSWORD);
    // One message for every failure, so the form never reveals which accounts exist.
    if (!account || !account.active || account.invited || !accepted) {
      throw new WmsError('Incorrect username or password.');
    }
    this.username = account.username;
    writeSession(account.username, remember);
    this.store.touchUser(account.username);
    return sessionUserOf(account);
  }

  async signOut(): Promise<void> {
    this.username = null;
    writeSession(null, false);
    return Promise.resolve();
  }

  currentUser(): Promise<SessionUser | null> {
    // Looked up every time, so a deactivated account is signed out everywhere at once.
    const user = this.state.users.find(
      (item) => item.username === this.username && item.active && !item.invited,
    );
    return Promise.resolve(user ? sessionUserOf(user) : null);
  }

  async forgotPassword(email: string): Promise<void> {
    await delay();
    this.store.requestPasswordReset(email);
  }

  linkOwner(purpose: TokenPurpose, token: string): Promise<TokenOwner | null> {
    const user = this.store.inspectToken(token, purpose);
    return Promise.resolve(user ? { fullName: user.name, email: user.email } : null);
  }

  async completeLink(purpose: TokenPurpose, token: string, password: string): Promise<void> {
    await delay();
    this.store.completeToken(token, purpose, password);
  }

  async changePassword(current: string, next: string): Promise<void> {
    await delay();
    this.store.changePassword(this.actor, current, next, DEMO_PASSWORD);
  }

  // ── Catalog ──────────────────────────────────────────────────────────────

  catalog(): Promise<Catalog> {
    const { categories, units, locations } = this.state;
    const models = new Map<string, Catalog['models'][number]>();
    for (const unit of units) {
      const id = modelId(unit.categoryCode, unit.brand, unit.model);
      if (!models.has(id)) {
        models.set(id, {
          id,
          categoryId: unit.categoryCode,
          brand: unit.brand,
          modelName: unit.model,
          isBookable: true,
          accessories: unit.accessories,
        });
      }
    }
    for (const [id, model] of this.extraModels) {
      if (!models.has(id)) {
        models.set(id, { id, ...model, isBookable: true });
      }
    }
    const live = units.filter((unit) => unit.status !== 'retired');
    // The demo keeps shelves in a flat list with a zone label; each zone stands in for a room.
    const zones = [
      ...new Set(locations.filter((item) => item.kind === 'shelf').map((item) => item.zone)),
    ];
    return Promise.resolve({
      categories: categories.map((category) => ({
        id: category.code,
        code: category.code,
        name: category.name,
        unitCount: live.filter((unit) => unit.categoryCode === category.code).length,
      })),
      models: [...models.values()].sort((a, b) =>
        `${a.brand} ${a.modelName}`.localeCompare(`${b.brand} ${b.modelName}`),
      ),
      locations: [
        ...zones.map((zone): Location => ({
          id: `zone:${zone}`,
          code: zone.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
          name: zone,
          kind: 'room',
          parentId: null,
          parentName: null,
          unitCount: 0,
        })),
        ...locations.map((location): Location => ({
          id: location.id,
          code: location.id.toUpperCase(),
          name: location.name,
          kind: location.kind === 'area' ? 'room' : location.kind,
          parentId: location.kind === 'shelf' ? `zone:${location.zone}` : null,
          parentName: location.zone,
          unitCount: live.filter((unit) => unit.locationId === location.id).length,
        })),
      ],
    });
  }

  async addCategory(_intent: string, input: { name: string; code: string }): Promise<void> {
    await delay();
    this.store.addCategory(this.actor, input.code, input.name);
  }

  async addShelf(_intent: string, input: { name: string; parentId: string }): Promise<void> {
    await delay();
    // The demo keeps a flat list with a zone label, so the chosen room becomes the zone.
    const zone = input.parentId.startsWith('zone:')
      ? input.parentId.slice('zone:'.length)
      : (this.state.locations.find((item) => item.id === input.parentId)?.name ?? input.parentId);
    this.store.addLocation(this.actor, input.name, zone);
  }

  async addModel(_intent: string, input: NewModel): Promise<{ id: string }> {
    await delay();
    const brand = input.brand.trim();
    const name = input.modelName.trim();
    if (!brand || !name) throw new WmsError('Brand and model are required.');
    const id = modelId(input.categoryId, brand, name);
    this.extraModels.set(id, { ...input, brand, modelName: name });
    return { id };
  }

  // ── Units ────────────────────────────────────────────────────────────────

  private unitView(unit: Unit): UnitView {
    const { categories, locations } = this.state;
    const category = categories.find((item) => item.code === unit.categoryCode);
    const location = locations.find((item) => item.id === unit.locationId);
    return {
      id: unit.code,
      assetCode: unit.code,
      serialNumber: unit.serial,
      status: unit.status,
      condition: toGrade(unit.condition),
      ownership: 'owned',
      ownerName: null,
      notes: unit.notes || null,
      registeredAt: unit.registeredAt,
      model: {
        id: modelId(unit.categoryCode, unit.brand, unit.model),
        brand: unit.brand,
        modelName: unit.model,
        categoryId: unit.categoryCode,
        categoryCode: unit.categoryCode,
        categoryName: category?.name ?? unit.categoryCode,
      },
      location: location
        ? { id: location.id, code: location.id.toUpperCase(), name: location.name }
        : null,
      reservedFor: unit.reservedFor,
    };
  }

  private unitOf(code: string): Unit {
    const unit = this.state.units.find((item) => item.code === code.toUpperCase());
    if (!unit) throw new WmsError(`No unit has the asset code ${code}.`);
    return unit;
  }

  async units(query: UnitQuery): Promise<UnitPage> {
    await delay();
    const terms = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const wanted = query.codes ? new Set(query.codes) : null;
    const matching = this.state.units.filter((unit) => {
      if (wanted) {
        if (!wanted.has(unit.code)) return false;
      } else if (query.status ? unit.status !== query.status : unit.status === 'retired') {
        return false;
      }
      if (query.categoryId && unit.categoryCode !== query.categoryId) return false;
      if (query.locationId && unit.locationId !== query.locationId) return false;
      const text = `${unit.code} ${unit.serial} ${unit.brand} ${unit.model}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    matching.sort((a, b) =>
      query.sort === 'newest'
        ? b.registeredAt.localeCompare(a.registeredAt)
        : query.sort === '-code'
          ? b.code.localeCompare(a.code)
          : a.code.localeCompare(b.code),
    );
    const start = Number(query.cursor ?? 0) || 0;
    const page = matching.slice(start, start + query.limit);
    const next = start + query.limit;
    return {
      items: page.map((unit) => this.unitView(unit)),
      total: matching.length,
      nextCursor: next < matching.length ? String(next) : null,
    };
  }

  async unit(code: string): Promise<AssetDetail> {
    await delay();
    return this.detail(code);
  }

  private detail(code: string): AssetDetail {
    const unit = this.unitOf(code);
    const { movements, users } = this.state;
    const nameOf = new Map(users.map((user) => [user.username, user.name]));
    return {
      asset: this.unitView(unit),
      accessories: unit.accessories,
      movements: movements
        .filter((movement) => movement.unitCode === unit.code)
        .reverse()
        .map((movement) => ({
          id: String(movement.id),
          type: movement.type,
          fromStatus: movement.fromStatus ?? movement.toStatus,
          toStatus: movement.toStatus,
          // The demo ledger records the note, not the shelves; the note names the shelf.
          fromLocation: null,
          toLocation: null,
          actorName: nameOf.get(movement.by) ?? movement.by,
          note: movement.note || null,
          loanNumber: movement.loanNumber,
          occurredAt: movement.at,
        })),
    };
  }

  async registerUnit(
    _intent: string,
    input: Parameters<Backend['registerUnit']>[1],
  ): Promise<AssetDetail> {
    await delay();
    const [categoryCode = '', brand = '', model = ''] = input.productModelId.split('|');
    const known = (await this.catalog()).models.find((item) => item.id === input.productModelId);
    const unit = this.store.registerUnit(this.actor, {
      categoryCode,
      brand,
      model,
      serial: input.serialNumber,
      locationId: input.locationId,
      condition: fromGrade(input.condition),
      accessories: known?.accessories ?? [],
      notes: input.notes ?? '',
    });
    return this.detail(unit.code);
  }

  async editUnit(
    _intent: string,
    code: string,
    patch: Parameters<Backend['editUnit']>[2],
  ): Promise<AssetDetail> {
    await delay();
    this.store.updateUnit(this.actor, code, {
      ...(patch.serialNumber !== undefined ? { serial: patch.serialNumber } : {}),
      ...(patch.condition !== undefined ? { condition: fromGrade(patch.condition) } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? '' } : {}),
    });
    return this.detail(code);
  }

  async moveUnit(_intent: string, code: string, locationId: string): Promise<AssetDetail> {
    await delay();
    const unit = this.unitOf(code);
    if (unit.status !== 'in_stock') {
      throw new WmsError(`${unit.code} is not in stock; only units in stock change shelf.`);
    }
    this.store.moveUnit(this.actor, unit.code, locationId);
    return this.detail(unit.code);
  }

  async moveUnits(_intent: string, codes: string[], locationId: string): Promise<BatchResult> {
    await delay();
    const result: BatchResult = { done: [], skipped: [] };
    for (const code of codes) {
      try {
        const unit = this.unitOf(code);
        if (unit.status !== 'in_stock') {
          throw new WmsError(
            `It is ${unit.status.replace(/_/g, ' ')}; only units in stock change shelf`,
          );
        }
        this.store.moveUnit(this.actor, unit.code, locationId);
        result.done.push(unit.code);
      } catch (error) {
        if (!(error instanceof WmsError)) throw error;
        result.skipped.push({ code, reason: error.message });
      }
    }
    return result;
  }

  async repairUnit(_intent: string, code: string, reason: string): Promise<AssetDetail> {
    await delay();
    this.store.sendToRepair(this.actor, code, reason);
    return this.detail(code);
  }

  async repairComplete(_intent: string, code: string): Promise<AssetDetail> {
    await delay();
    this.store.completeRepair(this.actor, code, '');
    return this.detail(code);
  }

  async retireUnit(_intent: string, code: string, reason: string): Promise<AssetDetail> {
    await delay();
    this.store.retireUnit(this.actor, code, reason);
    return this.detail(code);
  }

  unitLoans(code: string) {
    return Promise.resolve(
      this.state.loans
        .filter((loan) => loan.unitCode === code.toUpperCase())
        .reverse()
        .map((loan) => ({
          number: loan.number,
          company: loan.borrower.company,
          purpose: loan.purpose,
          startDate: loan.startDate,
        })),
    );
  }

  // ── People ───────────────────────────────────────────────────────────────

  async users(): Promise<UserView[]> {
    await delay();
    return this.state.users.map((user) => userView(user, this.state.seededOn));
  }

  private userView(username: string): UserView {
    const user = this.state.users.find((item) => item.username === username);
    if (!user) throw new WmsError('That person no longer exists.');
    return userView(user, this.state.seededOn);
  }

  /** The demo signs in by username, so a new account gets one made from the email. */
  private usernameFor(email: string): string {
    const base =
      email
        .split('@')[0]
        ?.toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .replace(/^[^a-z]+/, '')
        .slice(0, 20) || 'user';
    const taken = new Set(this.state.users.map((user) => user.username));
    let name = base.length >= 3 ? base : `${base}user`;
    for (let index = 2; taken.has(name); index += 1) name = `${base}${index}`;
    return name;
  }

  async inviteUser(
    _intent: string,
    input: Parameters<Backend['inviteUser']>[1],
  ): Promise<Invitation> {
    await delay();
    const username = this.usernameFor(input.email);
    const token = this.store.addUser(this.actor, {
      username,
      name: input.fullName,
      email: input.email,
      title: input.jobTitle ?? '',
      role: input.role,
    });
    return { user: this.userView(username), link: `/accept-invite/${token}` };
  }

  async editUser(_intent: string, id: string, patch: Parameters<Backend['editUser']>[2]) {
    await delay();
    const user = this.userView(id);
    this.store.updateUser(this.actor, id, {
      name: patch.fullName ?? user.fullName,
      email: patch.email ?? user.email,
      title: patch.jobTitle === undefined ? (user.jobTitle ?? '') : (patch.jobTitle ?? ''),
      role: patch.role ?? user.role,
    });
    return this.userView(id);
  }

  async setUserActive(_intent: string, id: string, active: boolean) {
    await delay();
    this.store.setUserActive(this.actor, id, active);
    return this.userView(id);
  }

  async resendInvite(_intent: string, id: string): Promise<Invitation> {
    await delay();
    const token = this.store.resendInvite(this.actor, id);
    return { user: this.userView(id), link: `/accept-invite/${token}` };
  }

  // ── Partners ─────────────────────────────────────────────────────────────

  private partnerView(partner: Partner): PartnerView {
    const own = this.state.loans.filter((loan) =>
      this.store.partnerOwnsLoan(partner, loan.borrower.company),
    );
    return {
      id: partner.id,
      name: partner.name,
      type: partner.type,
      status: partner.archived ? 'archived' : 'active',
      createdAt: partner.createdAt,
      contacts: partner.contacts.map((contact) => ({
        id: contact.id,
        fullName: contact.name,
        email: contact.email,
        phone: contact.phone,
      })),
      loans: own.length,
      openLoans: own.filter((loan) => ['pending', 'approved', 'released'].includes(loan.status))
        .length,
    };
  }

  private partnerOf(id: string): Partner {
    const partner = this.state.partners.find((item) => item.id === id);
    if (!partner) throw new WmsError('That partner company does not exist.');
    return partner;
  }

  async partners(): Promise<PartnerView[]> {
    await delay();
    return this.state.partners.map((partner) => this.partnerView(partner));
  }

  async partner(id: string): Promise<PartnerView> {
    await delay();
    return this.partnerView(this.partnerOf(id));
  }

  async partnerLoans(id: string): Promise<PartnerLoan[]> {
    const partner = this.partnerOf(id);
    const today = toDateKey(new Date());
    return Promise.resolve(
      this.state.loans
        .filter((loan) => this.store.partnerOwnsLoan(partner, loan.borrower.company))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        .map((loan) => ({
          number: loan.number,
          brand: loan.brand,
          model: loan.model,
          unitCode: loan.unitCode,
          contactName: loan.borrower.name,
          dueDate: loan.dueDate,
          status: loan.status,
          daysLate: daysOverdue(loan, today),
        })),
    );
  }

  async addPartner(_intent: string, input: { name: string; type: Partner['type'] }) {
    await delay();
    return this.partnerView(this.store.addPartner(this.actor, input));
  }

  async editPartner(_intent: string, id: string, input: { name: string; type: Partner['type'] }) {
    await delay();
    this.store.updatePartner(this.actor, id, input);
    return this.partnerView(this.partnerOf(id));
  }

  async setPartnerArchived(_intent: string, id: string, archived: boolean) {
    await delay();
    this.store.setPartnerArchived(this.actor, id, archived);
    return this.partnerView(this.partnerOf(id));
  }

  async addContact(
    _intent: string,
    id: string,
    input: { fullName: string; email: string; phone: string },
  ) {
    await delay();
    this.store.addPartnerContact(this.actor, id, {
      name: input.fullName,
      email: input.email,
      phone: input.phone,
    });
    return this.partnerView(this.partnerOf(id));
  }

  async removeContact(_intent: string, id: string, contactId: string) {
    await delay();
    this.store.removePartnerContact(this.actor, id, contactId);
    return this.partnerView(this.partnerOf(id));
  }

  async audit(query: Parameters<Backend['audit']>[0]) {
    await delay();
    const { audit, users } = this.state;
    const nameOf = new Map(users.map((user) => [user.username, user.name]));
    const newestFirst = [...audit]
      .reverse()
      .filter((entry) => !query.actorId || entry.actor === query.actorId)
      .filter((entry) => !query.action || entry.action.startsWith(query.action));
    const start = Number(query.cursor ?? 0) || 0;
    const items: AuditEntry[] = newestFirst.slice(start, start + query.limit).map((entry) => ({
      id: String(entry.id),
      occurredAt: entry.at,
      actorId: entry.actor,
      actorName: nameOf.get(entry.actor) ?? entry.actor,
      action: entry.action,
      targetType: 'record',
      targetId: null,
      changedFields: { record: entry.target, ...(entry.detail ? { detail: entry.detail } : {}) },
    }));
    const next = start + query.limit;
    return { items, nextCursor: next < newestFirst.length ? String(next) : null };
  }
}
