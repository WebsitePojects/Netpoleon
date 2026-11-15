import { addDays, toDateKey } from '../lib/dates.js';
import type {
  AuditEntry,
  Borrower,
  Category,
  Inspection,
  Loan,
  Movement,
  MovementType,
  Settings,
  StorageLocation,
  Unit,
  UnitStatus,
  User,
  Partner,
  WmsState,
} from './types.js';

/**
 * Demo data only. Nothing here reaches a server: the whole system in slice 1 runs in the
 * browser. The password is a fixture for these fictional accounts and is removed, with the
 * rest of this file, when sign-in moves to the API.
 */
export const DEMO_PASSWORD = '123456';
export const DEMO_ADMIN_USERNAME = 'lara';

export const STATE_VERSION = 2;

interface ModelSpec {
  brand: string;
  model: string;
  accessories: string[];
}

interface CategorySpec extends Category {
  /** Units to generate. The six figures are the per-category counts on the proposal cover. */
  count: number;
  shelfZone: string;
  models: ModelSpec[];
}

const SWITCH_KIT = ['Power cord', 'Rack ears', 'Console cable'];
const AP_KIT = ['PoE injector', 'Mounting bracket'];
const FIREWALL_KIT = ['Power adapter', 'Console cable', 'Rack ears'];
const ROUTER_KIT = ['Power adapter', 'Ethernet cable'];
const SERVER_KIT = ['Power cords (2)', 'Rail kit', 'Bezel key'];
const LAPTOP_KIT = ['Charger', 'Carrying case'];

const CATEGORY_SPECS: CategorySpec[] = [
  {
    code: 'SW',
    name: 'Network Switch',
    count: 98,
    shelfZone: 'A',
    models: [
      { brand: 'Cisco', model: 'C9200L-24T', accessories: SWITCH_KIT },
      { brand: 'Aruba', model: 'CX 6200', accessories: SWITCH_KIT },
      { brand: 'MikroTik', model: 'CRS328', accessories: SWITCH_KIT },
      { brand: 'Ruijie', model: 'RG-S5300', accessories: SWITCH_KIT },
    ],
  },
  {
    code: 'AP',
    name: 'Access Point',
    count: 66,
    shelfZone: 'B',
    models: [
      { brand: 'Aruba', model: 'AP-515', accessories: AP_KIT },
      { brand: 'Ubiquiti', model: 'U6-Pro', accessories: AP_KIT },
      { brand: 'Cisco', model: 'Catalyst 9120', accessories: AP_KIT },
    ],
  },
  {
    code: 'FW',
    name: 'Firewall',
    count: 78,
    shelfZone: 'C',
    models: [
      { brand: 'Fortinet', model: 'FG-60F', accessories: FIREWALL_KIT },
      { brand: 'Palo Alto', model: 'PA-220', accessories: FIREWALL_KIT },
      { brand: 'Fortinet', model: 'FG-100F', accessories: FIREWALL_KIT },
      { brand: 'Sophos', model: 'XGS 136', accessories: FIREWALL_KIT },
    ],
  },
  {
    code: 'RT',
    name: 'Router',
    count: 120,
    shelfZone: 'D',
    models: [
      { brand: 'Cisco', model: 'ISR 1111', accessories: ROUTER_KIT },
      { brand: 'MikroTik', model: 'CCR2004', accessories: ROUTER_KIT },
      { brand: 'Ubiquiti', model: 'UDM-Pro', accessories: ROUTER_KIT },
    ],
  },
  {
    code: 'SRV',
    name: 'Server',
    count: 38,
    shelfZone: 'E',
    models: [
      { brand: 'HPE', model: 'DL360 Gen10', accessories: SERVER_KIT },
      { brand: 'Dell', model: 'PowerEdge R650', accessories: SERVER_KIT },
      { brand: 'Lenovo', model: 'SR630 V2', accessories: SERVER_KIT },
    ],
  },
  {
    code: 'LT',
    name: 'Laptop',
    count: 82,
    shelfZone: 'F',
    models: [
      { brand: 'Lenovo', model: 'ThinkPad T14', accessories: LAPTOP_KIT },
      { brand: 'Dell', model: 'Latitude 5440', accessories: LAPTOP_KIT },
      { brand: 'HP', model: 'EliteBook 840', accessories: LAPTOP_KIT },
    ],
  },
  { code: 'ST', name: 'Storage', count: 0, shelfZone: 'G', models: [] },
];

const SHELVES_PER_ZONE = 4;

export const LOCATION_IDS = {
  receiving: 'receiving',
  qa: 'qa-area',
  repair: 'repair-bench',
  clientSite: 'client-site',
} as const;

const BORROWERS: Borrower[] = [
  borrower('Juan Dela Cruz', 'ABC Technologies Inc.', 'abctech.example'),
  borrower('Maria Santos', 'XYZ Technologies', 'xyztech.example'),
  borrower('Paolo Reyes', 'Techone Inc.', 'techone.example'),
  borrower('Angela Lim', 'GlobalTech Corp.', 'globaltech.example'),
  borrower('Ramon Villanueva', 'Northwind Systems', 'northwind.example'),
  borrower('Bianca Tan', 'Luzon Data Networks', 'luzondata.example'),
  borrower('Jerome Aquino', 'Visayas Integrators', 'visint.example'),
  borrower('Katrina Uy', 'Metro Cloud Partners', 'metrocloud.example'),
  borrower('Dennis Garcia', 'Netpoleon Presales Team', 'netpoleon.example'),
  borrower('Liza Mendoza', 'Netpoleon Cebu Branch', 'netpoleon.example'),
];

const PURPOSES = [
  'Customer proof of concept',
  'Product demo',
  'Partner training',
  'Customer evaluation',
  'Trade show booth',
  'Presales lab test',
];

function borrower(name: string, company: string, domain: string): Borrower {
  const local = name.toLowerCase().replace(/[^a-z]+/g, '.');
  // 0917 000 xxxx: an unassigned-looking block, so no demo row is a real person's number.
  const suffix = String(1000 + ((name.length * 733 + company.length * 97) % 9000));
  return { name, company, email: `${local}@${domain}`, phone: `0917 000 ${suffix}` };
}

/** Which borrowing companies are Netpoleon's own teams or branches rather than outside partners. */
const PARTNER_TYPES: Record<string, Partner['type']> = {
  'Netpoleon Presales Team': 'internal_team',
  'Netpoleon Cebu Branch': 'branch',
  'Metro Cloud Partners': 'reseller',
  'Visayas Integrators': 'reseller',
};

/** One partner record per company that appears on a loan, with its people as contacts. */
function buildPartners(now: Date): Partner[] {
  const byName = new Map<string, Partner>();
  BORROWERS.forEach((person, index) => {
    const partner = byName.get(person.company) ?? {
      id: `org-${String(index + 1).padStart(3, '0')}`,
      name: person.company,
      aliases: [],
      type: PARTNER_TYPES[person.company] ?? 'partner',
      archived: false,
      contacts: [],
      createdAt: new Date(now.getTime() - (400 - index * 17) * 86_400_000).toISOString(),
    };
    partner.contacts.push({
      id: `contact-${index + 1}`,
      name: person.name,
      email: person.email,
      phone: person.phone,
    });
    byName.set(person.company, partner);
  });
  // A company with no loans yet, so the list is not only borrowers.
  byName.set('Southern Edge Solutions', {
    id: 'org-099',
    name: 'Southern Edge Solutions',
    aliases: [],
    type: 'partner',
    archived: false,
    contacts: [],
    createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString(),
  });
  return [...byName.values()];
}

const DEFAULT_SETTINGS: Settings = {
  companyName: 'Netpoleon Solutions Philippines, Inc.',
  warehouseName: 'Main Warehouse',
  timezone: 'Asia/Manila',
  defaultLoanDays: 14,
  maxLoanDays: 30,
  turnaroundBufferDays: 2,
  pickupGraceDays: 3,
  notifyOverdue: true,
  notifyMissingAccessory: true,
  notifyForInspection: true,
  notifyReadyForRedeployment: true,
  overdueReminderDays: 2,
  labelSize: '50x25',
  labelShowsSerial: true,
  sessionMinutes: 30,
  passwordMinLength: 12,
  lockAfterFailedAttempts: 5,
};

/** Small seeded generator (mulberry32): the same demo data on every machine. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function formatAssetCode(categoryCode: string, sequence: number): string {
  return `NTP-${categoryCode}-${String(sequence).padStart(5, '0')}`;
}

export function formatLoanNumber(year: number, sequence: number): string {
  return `BRR-${year}-${String(sequence).padStart(5, '0')}`;
}

function buildLocations(): StorageLocation[] {
  const shelves = CATEGORY_SPECS.flatMap((category) =>
    Array.from({ length: SHELVES_PER_ZONE }, (_, index) => ({
      id: `shelf-${category.shelfZone.toLowerCase()}-${index + 1}`,
      name: `Shelf ${category.shelfZone}-${String(index + 1).padStart(2, '0')}`,
      zone: `${category.name} aisle`,
      kind: 'shelf' as const,
    })),
  );
  return [
    ...shelves,
    { id: LOCATION_IDS.receiving, name: 'Receiving', zone: 'Warehouse floor', kind: 'area' },
    { id: LOCATION_IDS.qa, name: 'QA Area', zone: 'Warehouse floor', kind: 'area' },
    { id: LOCATION_IDS.repair, name: 'Repair Bench', zone: 'Warehouse floor', kind: 'area' },
    { id: LOCATION_IDS.clientSite, name: 'Client Site', zone: 'Outside', kind: 'site' },
  ];
}

function buildUsers(now: Date): User[] {
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  return [
    user('lara', 'Lara', 'System Administrator', 'admin', hoursAgo(0)),
    user('tina', 'Cristina Imperial', 'Operations and Logistics Assistant', 'manager', hoursAgo(2)),
    user('marco', 'Marco Bautista', 'Warehouse Lead', 'warehouse', hoursAgo(1)),
    user('jen', 'Jennifer Cruz', 'Warehouse Staff', 'warehouse', hoursAgo(5)),
    user('audit', 'Grace Lim', 'Internal Auditor', 'auditor', hoursAgo(26)),
    { ...user('noel', 'Noel Ramos', 'Warehouse Staff', 'warehouse', null), active: false },
  ];
}

function user(
  username: string,
  name: string,
  title: string,
  role: User['role'],
  lastActiveAt: string | null,
): User {
  return {
    username,
    name,
    title,
    role,
    active: true,
    invited: false,
    lastActiveAt,
    email: `${username}@netpoleon.example`,
  };
}

/** Where a unit physically sits for each status when the demo starts. */
const LOCATION_FOR_STATUS: Partial<Record<UnitStatus, string>> = {
  on_demo: LOCATION_IDS.clientSite,
  returned: LOCATION_IDS.receiving,
  under_inspection: LOCATION_IDS.qa,
  for_repair: LOCATION_IDS.repair,
};

const WAREHOUSE_STAFF = ['marco', 'jen'];
const APPROVERS = ['tina', 'lara'];

/**
 * Builds a full, internally consistent demo dataset dated relative to `now`: every unit's
 * status is the result of the movements recorded for it, exactly as the real system requires.
 */
export function buildSeed(now: Date): WmsState {
  const random = createRandom(20261114);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const today = toDateKey(now);
  /** A timestamp `days` before today at a working hour. */
  const stamp = (days: number): string => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
    date.setHours(between(8, 17), between(0, 59), 0, 0);
    // Never in the future: an event "today" must not sort after the present moment.
    return new Date(Math.min(date.getTime(), now.getTime() - 60_000)).toISOString();
  };

  const locations = buildLocations();
  const units: Unit[] = [];
  const loans: Loan[] = [];
  const movements: Movement[] = [];
  const inspections: Inspection[] = [];
  const audit: AuditEntry[] = [];
  const usedSerials = new Set<string>();

  const serial = (brand: string): string => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
    for (;;) {
      let body = '';
      for (let index = 0; index < 9; index += 1) body += pick(alphabet.split(''));
      const value = `${brand.slice(0, 2).toUpperCase()}${body}`;
      if (!usedSerials.has(value)) {
        usedSerials.add(value);
        return value;
      }
    }
  };

  const move = (
    at: string,
    unit: Unit,
    type: MovementType,
    toStatus: UnitStatus,
    by: string,
    loanNumber: string | null,
    note: string,
  ): void => {
    movements.push({
      id: 0, // numbered after sorting by time
      at,
      unitCode: unit.code,
      type,
      fromStatus: type === 'registered' ? null : unit.status,
      toStatus,
      by,
      loanNumber,
      note,
    });
    unit.status = toStatus;
  };

  // 1. Register and stock every unit.
  for (const category of CATEGORY_SPECS) {
    for (let index = 0; index < category.count; index += 1) {
      const spec = pick(category.models);
      const registeredDaysAgo = between(215, 520);
      const shelf = `shelf-${category.shelfZone.toLowerCase()}-${between(1, SHELVES_PER_ZONE)}`;
      const unit: Unit = {
        code: formatAssetCode(category.code, index + 1),
        categoryCode: category.code,
        brand: spec.brand,
        model: spec.model,
        serial: serial(spec.brand),
        status: 'in_stock',
        locationId: shelf,
        condition: random() < 0.82 ? 'A' : 'B',
        accessories: [...spec.accessories],
        registeredAt: stamp(registeredDaysAgo),
        reservedFor: null,
        notes: '',
      };
      const staff = pick(WAREHOUSE_STAFF);
      move(unit.registeredAt, unit, 'registered', 'in_stock', staff, null, 'Unit registered');
      units.push(unit);
    }
  }

  const draftLoan = (unit: Unit, startDaysAgo: number, lengthDays: number): Loan => {
    const startDate = addDays(today, -startDaysAgo);
    return {
      number: '', // numbered after sorting by request time
      status: 'pending',
      categoryCode: unit.categoryCode,
      brand: unit.brand,
      model: unit.model,
      unitCode: unit.code,
      borrower: pick(BORROWERS),
      purpose: pick(PURPOSES),
      requestedAt: stamp(startDaysAgo + between(2, 5)),
      filedBy: pick(WAREHOUSE_STAFF),
      startDate,
      dueDate: addDays(startDate, lengthDays),
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
  };

  const approve = (loan: Loan, startDaysAgo: number): void => {
    loan.status = 'approved';
    loan.decidedBy = pick(APPROVERS);
    loan.decidedAt = stamp(startDaysAgo + 1);
  };

  const release = (loan: Loan, unit: Unit, startDaysAgo: number): void => {
    approve(loan, startDaysAgo);
    loan.status = 'released';
    loan.releasedBy = pick(WAREHOUSE_STAFF);
    loan.releasedAt = stamp(startDaysAgo);
    loan.accessoriesOut = [...unit.accessories];
    const note = `Released to ${loan.borrower.company}`;
    move(loan.releasedAt, unit, 'released', 'on_demo', loan.releasedBy, null, note);
  };

  const receive = (loan: Loan, unit: Unit, returnDaysAgo: number, missing: boolean): void => {
    loan.status = 'returned';
    loan.receivedBy = pick(WAREHOUSE_STAFF);
    loan.returnedAt = stamp(returnDaysAgo);
    loan.accessoriesBack = missing ? unit.accessories.slice(1) : [...unit.accessories];
    loan.returnNote = missing
      ? `Returned with missing ${(unit.accessories[0] ?? 'accessory').toLowerCase()}`
      : 'Returned complete with accessories';
    move(loan.returnedAt, unit, 'returned', 'returned', loan.receivedBy, null, loan.returnNote);
  };

  const inspect = (
    loan: Loan,
    unit: Unit,
    daysAgo: number,
    outcome: Inspection['outcome'],
  ): void => {
    const inspector = pick(WAREHOUSE_STAFF);
    const at = stamp(daysAgo);
    const complete = loan.accessoriesBack.length === unit.accessories.length;
    inspections.push({
      id: 0,
      at,
      unitCode: unit.code,
      loanNumber: null, // filled once loans are numbered
      inspector,
      grade: outcome === 'repair' ? 'C' : unit.condition,
      checklist: {
        powersOn: outcome !== 'repair',
        portsWork: outcome !== 'repair',
        noPhysicalDamage: true,
        factoryReset: true,
        accessoriesComplete: complete,
      },
      notes:
        outcome === 'repair' ? 'Fails power-on test. Tagged for repair.' : 'Passed all checks.',
      outcome,
    });
    loan.status = 'closed';
    if (outcome === 'repair') {
      move(at, unit, 'sent_to_repair', 'for_repair', inspector, null, 'Tagged for repair');
    } else {
      move(at, unit, 'restocked', 'in_stock', inspector, null, 'Restocked after inspection');
    }
  };

  const startInspection = (unit: Unit, daysAgo: number): void => {
    move(
      stamp(daysAgo),
      unit,
      'inspection_started',
      'under_inspection',
      pick(WAREHOUSE_STAFF),
      null,
      'Functional check and testing',
    );
  };

  // Loans and their movements are linked by object until numbers exist.
  const loanOfMovement = new Map<Movement, Loan>();
  const loanOfInspection = new Map<Inspection, Loan>();
  const track = (loan: Loan, movementsBefore: number, inspectionsBefore: number): void => {
    for (const movement of movements.slice(movementsBefore)) loanOfMovement.set(movement, loan);
    for (const item of inspections.slice(inspectionsBefore)) loanOfInspection.set(item, loan);
    loans.push(loan);
  };

  // 2. Completed loans across the last seven months, so the movement report has a shape.
  //    Each unit's loans run one after another, never overlapping, and all end at least
  //    six weeks ago so they cannot collide with the current loans dealt out below.
  const HISTORY_ENDS_BEFORE_DAYS_AGO = 44;
  for (const unit of units) {
    let startDaysAgo = between(120, 205);
    while (random() < 0.5) {
      const length = pick([5, 7, 10, 14, 14, 21]);
      const returnDaysAgo = startDaysAgo - length + between(-1, 2);
      if (returnDaysAgo < HISTORY_ENDS_BEFORE_DAYS_AGO) break;
      const before = [movements.length, inspections.length] as const;
      const loan = draftLoan(unit, startDaysAgo, length);
      release(loan, unit, startDaysAgo);
      receive(loan, unit, returnDaysAgo, random() < 0.06);
      startInspection(unit, returnDaysAgo - 1);
      inspect(loan, unit, returnDaysAgo - 2, 'restock');
      track(loan, ...before);
      startDaysAgo = returnDaysAgo - between(6, 40);
    }
  }

  // 3. Units currently in each non-stock state. Shuffle once, then deal units to states.
  const shuffled = [...units].sort(() => random() - 0.5);
  const deal = (count: number): Unit[] => shuffled.splice(0, count);

  const OVERDUE_LOANS = 9;
  deal(96).forEach((unit, index) => {
    const overdue = index < OVERDUE_LOANS;
    const length = overdue ? 14 : pick([14, 21, 30]);
    const startDaysAgo = overdue ? length + between(1, 12) : between(1, Math.min(length - 1, 13));
    const before = [movements.length, inspections.length] as const;
    const loan = draftLoan(unit, startDaysAgo, length);
    release(loan, unit, startDaysAgo);
    track(loan, ...before);
  });

  deal(46).forEach((unit, index) => {
    const before = [movements.length, inspections.length] as const;
    const returnDaysAgo = between(0, 4);
    const loan = draftLoan(unit, returnDaysAgo + 14, 14);
    release(loan, unit, returnDaysAgo + 14);
    receive(loan, unit, returnDaysAgo, index < 5);
    track(loan, ...before);
  });

  deal(28).forEach((unit) => {
    const before = [movements.length, inspections.length] as const;
    const returnDaysAgo = between(2, 7);
    const loan = draftLoan(unit, returnDaysAgo + 10, 10);
    release(loan, unit, returnDaysAgo + 10);
    receive(loan, unit, returnDaysAgo, false);
    startInspection(unit, returnDaysAgo - 1);
    track(loan, ...before);
  });

  deal(6).forEach((unit) => {
    const before = [movements.length, inspections.length] as const;
    const returnDaysAgo = between(8, 20);
    const loan = draftLoan(unit, returnDaysAgo + 14, 14);
    release(loan, unit, returnDaysAgo + 14);
    receive(loan, unit, returnDaysAgo, false);
    startInspection(unit, returnDaysAgo - 1);
    inspect(loan, unit, returnDaysAgo - 2, 'repair');
    track(loan, ...before);
  });

  // 4. Recently restocked units, so "ready for redeployment" alerts have something to show.
  deal(7).forEach((unit) => {
    const before = [movements.length, inspections.length] as const;
    const returnDaysAgo = between(3, 6);
    const loan = draftLoan(unit, returnDaysAgo + 7, 7);
    release(loan, unit, returnDaysAgo + 7);
    receive(loan, unit, returnDaysAgo, false);
    startInspection(unit, returnDaysAgo - 1);
    inspect(loan, unit, returnDaysAgo - 2, 'restock');
    track(loan, ...before);
  });

  // 5. Approved and waiting for pickup, then open requests waiting for a decision.
  const reservedLoans: Loan[] = [];
  deal(5).forEach((unit) => {
    const loan = draftLoan(unit, -between(0, 2), 14);
    loan.requestedAt = stamp(between(1, 3));
    approve(loan, 0);
    loan.decidedAt = stamp(0);
    reservedLoans.push(loan);
    loans.push(loan);
  });

  deal(9).forEach((unit) => {
    const loan = draftLoan(unit, -between(1, 6), pick([7, 14, 21]));
    loan.requestedAt = stamp(between(0, 2));
    loan.unitCode = null; // a request names a model; staff choose the unit when approving
    loans.push(loan);
  });

  // 6. Number everything in time order.
  movements.sort((a, b) => a.at.localeCompare(b.at));
  loans.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const year = now.getFullYear();
  loans.forEach((loan, index) => {
    loan.number = formatLoanNumber(year, index + 1);
  });
  movements.forEach((movement, index) => {
    movement.id = index + 1;
    movement.loanNumber = loanOfMovement.get(movement)?.number ?? null;
  });
  inspections.sort((a, b) => a.at.localeCompare(b.at));
  inspections.forEach((item, index) => {
    item.id = index + 1;
    item.loanNumber = loanOfInspection.get(item)?.number ?? null;
  });

  const unitByCode = new Map(units.map((unit) => [unit.code, unit]));
  for (const loan of reservedLoans) {
    const unit = unitByCode.get(loan.unitCode ?? '');
    if (unit) unit.reservedFor = loan.number;
  }
  for (const unit of units) {
    unit.locationId = LOCATION_FOR_STATUS[unit.status] ?? unit.locationId;
  }

  // 7. The audit trail starts with the last 45 days of movements.
  const auditFrom = new Date(now.getTime() - 45 * 86_400_000).toISOString();
  for (const movement of movements) {
    if (movement.at < auditFrom) continue;
    audit.push({
      id: audit.length + 1,
      at: movement.at,
      actor: movement.by,
      action: `unit.${movement.type}`,
      target: movement.unitCode,
      detail: movement.note,
    });
  }

  return {
    version: STATE_VERSION,
    seededOn: today,
    categories: CATEGORY_SPECS.map(({ code, name }) => ({ code, name })),
    locations,
    units,
    loans,
    movements,
    inspections,
    users: buildUsers(now),
    partners: buildPartners(now),
    authTokens: [],
    passwordHashes: {},
    mailbox: [],
    audit,
    settings: { ...DEFAULT_SETTINGS },
    readAlertIds: [],
    counters: {
      loan: loans.length,
      movement: movements.length,
      inspection: inspections.length,
      audit: audit.length,
      mail: 0,
    },
  };
}
