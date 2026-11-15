import type {
  Asset,
  AssetDetail,
  AssetStatus,
  AuditEntry,
  BatchResult,
  Catalog,
  EditAssetBody,
  EditUserBody,
  InviteUserBody,
  Partner,
  RegisterAssetBody,
  SessionUser,
  TokenOwner,
  TokenPurpose,
  User,
} from '@wms/contracts';

/**
 * The one door between the screens and the data. Two implementations stand behind it: the
 * demo store in the browser, and the API. Screens are written once, against these shapes,
 * which are the API's own contracts; the demo implementation adapts to them.
 */

/** A unit as the screens show it. `reservedFor` is known to the demo only until slice 3. */
export type UnitView = Asset & { reservedFor?: string | null };

export interface UnitDetailView extends AssetDetail {
  asset: UnitView;
}

export interface UnitQuery {
  q?: string | undefined;
  /** Exact asset codes; when given, retired units are included and other filters still apply. */
  codes?: string[] | undefined;
  status?: AssetStatus | undefined;
  categoryId?: string | undefined;
  locationId?: string | undefined;
  sort: 'code' | '-code' | 'newest';
  cursor?: string | undefined;
  limit: number;
}

export interface UnitPage {
  items: UnitView[];
  total: number;
  nextCursor: string | null;
}

/** A loan as the partner page lists it; the API serves these from slice 3. */
export interface PartnerLoan {
  number: string;
  brand: string;
  model: string;
  unitCode: string | null;
  contactName: string;
  dueDate: string;
  status: string;
  daysLate: number;
}

/** A loan as the unit page lists it; the API serves these from slice 3. */
export interface UnitLoan {
  number: string;
  company: string;
  purpose: string;
  startDate: string;
}

/**
 * Who a new account belongs to, and the link to give them. With the API the link goes out by
 * email and is never returned; the demo has no mail server, so it hands the link back.
 */
export interface Invitation {
  user: User;
  link: string | null;
}

export interface NewModel {
  categoryId: string;
  brand: string;
  modelName: string;
  accessories: string[];
}

export interface Backend {
  readonly mode: 'demo' | 'api';

  signIn(login: string, password: string, remember: boolean): Promise<SessionUser>;
  signOut(): Promise<void>;
  currentUser(): Promise<SessionUser | null>;
  forgotPassword(email: string): Promise<void>;
  linkOwner(purpose: TokenPurpose, token: string): Promise<TokenOwner | null>;
  completeLink(purpose: TokenPurpose, token: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;

  catalog(): Promise<Catalog>;
  addCategory(intent: string, input: { name: string; code: string }): Promise<void>;
  addShelf(intent: string, input: { name: string; code: string; parentId: string }): Promise<void>;
  addModel(intent: string, input: NewModel): Promise<{ id: string }>;

  units(query: UnitQuery): Promise<UnitPage>;
  unit(code: string): Promise<UnitDetailView>;
  registerUnit(intent: string, input: RegisterAssetBody): Promise<AssetDetail>;
  editUnit(intent: string, code: string, patch: EditAssetBody): Promise<AssetDetail>;
  moveUnit(intent: string, code: string, locationId: string): Promise<AssetDetail>;
  moveUnits(intent: string, codes: string[], locationId: string): Promise<BatchResult>;
  repairUnit(intent: string, code: string, reason: string): Promise<AssetDetail>;
  repairComplete(intent: string, code: string): Promise<AssetDetail>;
  retireUnit(intent: string, code: string, reason: string): Promise<AssetDetail>;
  unitLoans(code: string): Promise<UnitLoan[]>;

  users(): Promise<User[]>;
  inviteUser(intent: string, input: InviteUserBody): Promise<Invitation>;
  editUser(intent: string, id: string, patch: EditUserBody): Promise<User>;
  setUserActive(intent: string, id: string, active: boolean): Promise<User>;
  resendInvite(intent: string, id: string): Promise<Invitation>;

  partners(): Promise<Partner[]>;
  partner(id: string): Promise<Partner>;
  partnerLoans(id: string): Promise<PartnerLoan[]>;
  addPartner(intent: string, input: { name: string; type: Partner['type'] }): Promise<Partner>;
  editPartner(
    intent: string,
    id: string,
    input: { name: string; type: Partner['type'] },
  ): Promise<Partner>;
  setPartnerArchived(intent: string, id: string, archived: boolean): Promise<Partner>;
  addContact(
    intent: string,
    id: string,
    input: { fullName: string; email: string; phone: string },
  ): Promise<Partner>;
  removeContact(intent: string, id: string, contactId: string): Promise<Partner>;

  audit(query: {
    cursor?: string | undefined;
    limit: number;
    actorId?: string | undefined;
    action?: string | undefined;
  }): Promise<{
    items: AuditEntry[];
    nextCursor: string | null;
  }>;
}
