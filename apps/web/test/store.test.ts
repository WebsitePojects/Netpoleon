import { beforeEach, describe, expect, it } from 'vitest';
import { buildAlerts, countByStatus } from '../src/data/selectors.js';
import {
  WmsError,
  WmsStore,
  type InspectionInput,
  type KeyValueStorage,
} from '../src/data/store.js';
import { addDays, toDateKey } from '../src/lib/dates.js';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const NOW = new Date(2026, 10, 14, 10, 0, 0);
const TODAY = toDateKey(NOW);

const PASSING_INSPECTION: InspectionInput = {
  grade: 'A',
  checklist: {
    powersOn: true,
    portsWork: true,
    noPhysicalDamage: true,
    factoryReset: true,
    accessoriesComplete: true,
  },
  notes: '',
  outcome: 'restock',
  locationId: 'shelf-c-1',
};

let storage: MemoryStorage;
let store: WmsStore;

beforeEach(() => {
  storage = new MemoryStorage();
  store = new WmsStore(storage, () => NOW);
});

function registerFirewall(serial = 'TEST-SERIAL-1') {
  return store.registerUnit('marco', {
    categoryCode: 'FW',
    brand: 'Fortinet',
    model: 'FG-TEST',
    serial,
    locationId: 'shelf-c-1',
    condition: 'A',
    accessories: ['Power adapter', 'Console cable'],
    notes: '',
  });
}

function fileRequest(by = 'marco') {
  return store.createRequest(by, {
    brand: 'Fortinet',
    model: 'FG-TEST',
    borrower: {
      name: 'Juan Dela Cruz',
      company: 'ABC Technologies Inc.',
      email: 'juan@abctech.example',
      phone: '0917 000 1234',
    },
    purpose: 'Customer proof of concept',
    startDate: TODAY,
    dueDate: addDays(TODAY, 14),
  });
}

const unitOf = (code: string) => store.getState().units.find((unit) => unit.code === code);
const loanOf = (number: string) => store.getState().loans.find((loan) => loan.number === number);

describe('seed data', () => {
  it('holds 482 units whose statuses match their last movement', () => {
    const state = store.getState();
    expect(state.units).toHaveLength(482);
    const last = new Map<string, string>();
    for (const movement of state.movements) last.set(movement.unitCode, movement.toStatus);
    for (const unit of state.units) expect(last.get(unit.code)).toBe(unit.status);
  });

  it('never records a movement from a status the unit was not in', () => {
    const current = new Map<string, string | null>();
    for (const movement of store.getState().movements) {
      expect(movement.fromStatus ?? null).toBe(current.get(movement.unitCode) ?? null);
      current.set(movement.unitCode, movement.toStatus);
    }
  });

  it('matches the proposal status mix', () => {
    const counts = countByStatus(store.getState().units);
    expect(counts).toMatchObject({
      total: 482,
      on_demo: 96,
      returned: 46,
      under_inspection: 28,
      for_repair: 6,
    });
  });

  it('raises each kind of alert', () => {
    const kinds = new Set(buildAlerts(store.getState(), NOW).map((alert) => alert.kind));
    expect([...kinds].sort()).toEqual(['for_inspection', 'missing_accessory', 'overdue', 'ready']);
  });
});

describe('the seven-step lifecycle', () => {
  it('runs register, request, approve, release, return, inspect, restock', () => {
    const unit = registerFirewall();
    expect(unit.code).toMatch(/^NTP-FW-\d{5}$/);
    expect(unit.locationId).toBe('shelf-c-1');

    const loan = fileRequest();
    store.approveRequest('tina', loan.number, unit.code);
    expect(unitOf(unit.code)?.reservedFor).toBe(loan.number);

    store.releaseLoan('marco', loan.number, unit.code.toLowerCase(), [
      'Power adapter',
      'Console cable',
    ]);
    expect(unitOf(unit.code)).toMatchObject({ status: 'on_demo', reservedFor: null });

    store.receiveReturn('marco', loan.number, unit.code, ['Console cable'], '');
    expect(unitOf(unit.code)?.status).toBe('returned');
    expect(loanOf(loan.number)?.returnNote).toBe('Returned with missing power adapter');
    const alerts = buildAlerts(store.getState(), NOW);
    expect(alerts.some((alert) => alert.id === `missing:${loan.number}`)).toBe(true);

    store.startInspection('marco', unit.code);
    store.recordInspection('marco', unit.code, PASSING_INSPECTION);
    expect(unitOf(unit.code)).toMatchObject({ status: 'in_stock', locationId: 'shelf-c-1' });
    expect(loanOf(loan.number)?.status).toBe('closed');

    const trail = store.getState().movements.filter((item) => item.unitCode === unit.code);
    expect(trail.map((item) => item.type)).toEqual([
      'registered',
      'stocked',
      'reserved',
      'released',
      'returned',
      'inspection_started',
      'restocked',
    ]);
  });

  it('routes a failed inspection to repair and back to the shelf', () => {
    const unit = registerFirewall();
    const loan = fileRequest();
    store.approveRequest('tina', loan.number, unit.code);
    store.releaseLoan('marco', loan.number, unit.code, []);
    store.receiveReturn('marco', loan.number, unit.code, [], '');
    store.startInspection('marco', unit.code);
    store.recordInspection('marco', unit.code, {
      ...PASSING_INSPECTION,
      grade: 'C',
      outcome: 'repair',
      notes: 'No power',
      locationId: null,
    });
    expect(unitOf(unit.code)).toMatchObject({ status: 'for_repair', locationId: 'repair-bench' });
    store.completeRepair('marco', unit.code, '');
    expect(unitOf(unit.code)).toMatchObject({ status: 'under_inspection', locationId: 'qa-area' });
    store.recordInspection('marco', unit.code, PASSING_INSPECTION);
    expect(unitOf(unit.code)).toMatchObject({ status: 'in_stock', locationId: 'shelf-c-1' });
  });
});

describe('guards', () => {
  it('rejects a duplicate serial number', () => {
    registerFirewall('DUP-1');
    expect(() => registerFirewall('dup-1')).toThrow(/already registered/);
  });

  it('stops the person who filed a request from approving it', () => {
    const unit = registerFirewall();
    const loan = fileRequest('lara');
    expect(() => store.approveRequest('lara', loan.number, unit.code)).toThrow(/another approver/);
  });

  it('denies actions outside a role', () => {
    const unit = registerFirewall();
    const loan = fileRequest();
    expect(() => store.approveRequest('marco', loan.number, unit.code)).toThrow(
      /role does not allow/,
    );
    expect(() => store.moveUnit('audit', unit.code, 'shelf-c-2')).toThrow(WmsError);
    expect(() => store.updateSettings('tina', { defaultLoanDays: 7 })).toThrow(WmsError);
  });

  it('has one effect when approval is fired twice', () => {
    const unit = registerFirewall();
    const loan = fileRequest();
    store.approveRequest('tina', loan.number, unit.code);
    expect(() => store.approveRequest('tina', loan.number, unit.code)).toThrow(/already approved/);
    const reserved = store
      .getState()
      .movements.filter((item) => item.unitCode === unit.code && item.type === 'reserved');
    expect(reserved).toHaveLength(1);
  });

  it('has one effect when release and return are fired twice', () => {
    const unit = registerFirewall();
    const loan = fileRequest();
    store.approveRequest('tina', loan.number, unit.code);
    store.releaseLoan('marco', loan.number, unit.code, []);
    expect(() => store.releaseLoan('marco', loan.number, unit.code, [])).toThrow(
      /already released/,
    );
    store.receiveReturn('marco', loan.number, unit.code, [], '');
    expect(() => store.receiveReturn('marco', loan.number, unit.code, [], '')).toThrow(
      /already returned/,
    );
  });

  it('refuses a unit that is reserved for another request', () => {
    const unit = registerFirewall();
    const first = fileRequest();
    const second = fileRequest();
    store.approveRequest('tina', first.number, unit.code);
    expect(() => store.approveRequest('tina', second.number, unit.code)).toThrow(/reserved for/);
  });

  it('refuses a scan of the wrong unit', () => {
    const unit = registerFirewall();
    const loan = fileRequest();
    store.approveRequest('tina', loan.number, unit.code);
    expect(() => store.releaseLoan('marco', loan.number, 'NTP-SW-00001', [])).toThrow(/Scanned/);
    expect(() => store.releaseLoan('marco', loan.number, '  ', [])).toThrow(/Scan or type/);
  });

  it('refuses moves the lifecycle does not allow', () => {
    const unit = registerFirewall();
    expect(() => store.startInspection('marco', unit.code)).toThrow(/not allowed/);
    expect(() => store.recordInspection('marco', unit.code, PASSING_INSPECTION)).toThrow(
      /not allowed/,
    );
  });

  it('validates request dates', () => {
    registerFirewall();
    const base = {
      brand: 'Fortinet',
      model: 'FG-TEST',
      borrower: { name: 'A', company: 'B', email: 'a@b.example', phone: '1' },
      purpose: 'Demo',
    };
    const request = (startDate: string, dueDate: string) =>
      store.createRequest('marco', { ...base, startDate, dueDate });
    expect(() => request(addDays(TODAY, -1), TODAY)).toThrow(/past/);
    expect(() => request(TODAY, TODAY)).toThrow(/after the release date/);
    expect(() => request(TODAY, addDays(TODAY, 31))).toThrow(/at most 30 days/);
  });

  it('keeps one active administrator', () => {
    expect(() => store.setUserActive('lara', 'lara', false)).toThrow(/your own account/);
    expect(() =>
      store.updateUser('lara', 'lara', {
        name: 'Lara',
        email: 'lara@netpoleon.example',
        title: '',
        role: 'manager',
      }),
    ).toThrow(/At least one active administrator/);
  });
});

describe('persistence', () => {
  it('survives a reload and can be reset', () => {
    const unit = registerFirewall();
    const reloaded = new WmsStore(storage, () => NOW);
    expect(reloaded.getState().units.some((item) => item.code === unit.code)).toBe(true);
    reloaded.reset();
    expect(reloaded.getState().units).toHaveLength(482);
  });
});

describe('invitations and password resets', () => {
  const tokenFrom = (link: string) => link.split('/').at(-1) ?? '';

  it('lets an invited user in only after they accept, and the link works once', () => {
    const token = store.addUser('lara', {
      username: 'nina',
      name: 'Nina Cruz',
      email: 'nina@netpoleon.example',
      title: '',
      role: 'warehouse',
    });
    expect(store.getState().users.find((user) => user.username === 'nina')?.invited).toBe(true);
    expect(store.inspectToken(token, 'invite')?.username).toBe('nina');
    expect(store.inspectToken(token, 'password_reset')).toBeNull();

    expect(() => store.completeToken(token, 'invite', 'short')).toThrow(WmsError);
    expect(() => store.completeToken(token, 'invite', 'Password1234!')).toThrow(/too common/);
    store.completeToken(token, 'invite', 'blue-shelf-forty-two');

    expect(store.getState().users.find((user) => user.username === 'nina')?.invited).toBe(false);
    expect(store.checkOwnPassword('nina', 'blue-shelf-forty-two')).toBe(true);
    expect(store.checkOwnPassword('nina', 'wrong-password-here')).toBe(false);
    expect(() => store.completeToken(token, 'invite', 'another-long-phrase')).toThrow(
      /expired or was already used/,
    );
  });

  it('keeps only the hash of a token and voids the old link on resend', () => {
    const first = store.addUser('lara', {
      username: 'nina',
      name: 'Nina Cruz',
      email: 'nina@netpoleon.example',
      title: '',
      role: 'warehouse',
    });
    // The mailbox stands in for the email, which carries the link; the token records must not.
    expect(JSON.stringify(store.getState().authTokens)).not.toContain(first);
    const second = store.resendInvite('lara', 'nina');
    expect(store.inspectToken(first, 'invite')).toBeNull();
    expect(store.inspectToken(second, 'invite')?.username).toBe('nina');
  });

  it('expires a reset link after an hour and says nothing about unknown addresses', () => {
    let now = NOW;
    const clocked = new WmsStore(new MemoryStorage(), () => now);
    clocked.requestPasswordReset('nobody@nowhere.example');
    expect(clocked.getState().mailbox).toHaveLength(0);

    clocked.requestPasswordReset('MARCO@netpoleon.example');
    const mail = clocked.getState().mailbox[0];
    expect(mail?.to).toBe('marco@netpoleon.example');
    const token = tokenFrom(mail?.link ?? '');
    expect(clocked.inspectToken(token, 'password_reset')?.username).toBe('marco');

    now = new Date(NOW.getTime() + 61 * 60_000);
    expect(clocked.inspectToken(token, 'password_reset')).toBeNull();
  });

  it('refuses a wrong current password when changing it', () => {
    expect(() =>
      store.changePassword('marco', 'not-the-password', 'blue-shelf-forty-two', '123456'),
    ).toThrow(/current password/);
    store.changePassword('marco', '123456', 'blue-shelf-forty-two', '123456');
    expect(store.checkOwnPassword('marco', 'blue-shelf-forty-two')).toBe(true);
  });
});

describe('partner companies', () => {
  it('seeds one partner per borrowing company', () => {
    const { partners, loans } = store.getState();
    for (const loan of loans) {
      expect(partners.some((partner) => partner.name === loan.borrower.company)).toBe(true);
    }
  });

  it('keeps loan history after a rename and refuses a duplicate name', () => {
    const abc = store.getState().partners.find((p) => p.name === 'ABC Technologies Inc.');
    if (!abc) throw new Error('seed is missing ABC Technologies Inc.');
    store.updatePartner('lara', abc.id, { name: 'ABC Tech Holdings', type: 'partner' });
    const renamed = store.getState().partners.find((p) => p.id === abc.id);
    if (!renamed) throw new Error('partner vanished');
    expect(store.partnerOwnsLoan(renamed, 'ABC Technologies Inc.')).toBe(true);
    expect(() =>
      store.addPartner('lara', { name: 'abc technologies inc.', type: 'partner' }),
    ).toThrow(/already exists/);
  });

  it('will not archive a company with units out, and only admins manage partners', () => {
    const partner = store.addPartner('lara', { name: 'Archive Test Co', type: 'partner' });
    expect(() => store.addPartner('marco', { name: 'Not Allowed Co', type: 'partner' })).toThrow(
      /role does not allow/,
    );
    store.setPartnerArchived('lara', partner.id, true);
    expect(store.getState().partners.find((p) => p.id === partner.id)?.archived).toBe(true);

    const busy = store
      .getState()
      .partners.find((p) =>
        store
          .getState()
          .loans.some(
            (loan) => loan.status === 'released' && store.partnerOwnsLoan(p, loan.borrower.company),
          ),
      );
    if (!busy) throw new Error('seed has no partner with a unit out');
    expect(() => store.setPartnerArchived('lara', busy.id, true)).toThrow(/still has open/);
  });
});
