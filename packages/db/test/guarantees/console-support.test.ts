import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

// Migration 0011: sign-in names, unit notes and the transaction read model the console uses.

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const INSUFFICIENT_PRIVILEGE = '42501';

describe('usernames (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  /** A username no other test has used, built from a running number so it stays valid. */
  const freshUsername = async (stem = 'user') => `${stem}${await fixtures.next()}`;

  const insertStaff = async (username: string | null, title: string | null = null) => {
    const n = await fixtures.next();
    return staff.query(
      `INSERT INTO users (email, full_name, kind, role, username, title)
       VALUES ($1, 'Test User', 'staff', 'warehouse', $2, $3)`,
      [`named-${n}@example.test`, username, title],
    );
  };

  it.each(['marco', 'j.cruz', 'a_b-c9', 'abc'])('accepts %s', async (stem) => {
    // A numeric suffix keeps each run unique and still matches the pattern.
    const username = `${stem}${await fixtures.next()}`.slice(0, 24);

    expect(await sqlState(() => insertStaff(username, 'Warehouse Lead'))).toBeNull();
  });

  it.each([
    ['upper case', 'Lara'],
    ['too short', 'ab'],
    ['too long', `a${'b'.repeat(24)}`],
    ['a leading digit', '1abc'],
    ['a leading dot', '.abc'],
    ['a space', 'ab cd'],
    ['an at sign', 'ab@cd'],
    ['a non-ASCII letter', 'josé'],
    ['the empty string', ''],
  ])('rejects a username with %s with 23514', async (_label, username) => {
    expect(await sqlState(() => insertStaff(username))).toBe(CHECK_VIOLATION);
  });

  it('rejects the same username twice with 23505', async () => {
    const username = await freshUsername('dup');
    await insertStaff(username);

    expect(await sqlState(() => insertStaff(username))).toBe(UNIQUE_VIOLATION);
  });

  it('finds a username whatever case the sign-in form sent', async () => {
    const username = await freshUsername('case');
    await insertStaff(username);

    const { rows } = await staff.query<{ username: string }>(
      'SELECT username FROM users WHERE username = $1',
      [username.toUpperCase()],
    );

    expect(rows).toEqual([{ username }]);
  });

  it('allows users without a username: partners sign in by email', async () => {
    const orgId = await fixtures.partnerOrg();
    const n = await fixtures.next();

    const state = await sqlState(() =>
      staff.query(
        `INSERT INTO users (email, full_name, kind, role, partner_org_id)
         VALUES ($1, 'Partner', 'partner', 'partner_member', $2)`,
        [`nameless-${n}@example.test`, orgId],
      ),
    );

    expect(state).toBeNull();
  });

  it('never lets a partner session read usernames or titles (42501)', async () => {
    const orgId = await fixtures.partnerOrg();
    const userId = await fixtures.partnerUser(orgId);

    // One transaction per probe: the first refusal aborts its transaction.
    const stateOf = (column: string) =>
      inRolledBackTransaction(
        getTestDb().partnerUrl,
        { 'app.partner_org_id': orgId, 'app.user_id': userId },
        (client) => sqlState(() => client.query(`SELECT ${column} FROM users`)),
      );

    expect(await stateOf('username')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await stateOf('title')).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe('unit notes (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;
  let actorId: string;
  let modelId: string;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
    actorId = await fixtures.staffUser();
    modelId = await fixtures.productModel();
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const notesOf = async (assetId: string) => {
    const { rows } = await staff.query<{ notes: string | null; status: string }>(
      'SELECT notes, status FROM assets WHERE id = $1',
      [assetId],
    );
    return rows[0];
  };

  it('lets staff write notes on a unit', async () => {
    const assetId = await fixtures.asset(modelId, actorId);

    await staff.query('UPDATE assets SET notes = $2 WHERE id = $1', [assetId, 'Scratched lid']);

    expect(await notesOf(assetId)).toEqual({ notes: 'Scratched lid', status: 'in_stock' });
  });

  it('lets staff register a unit with notes, naming only granted columns', async () => {
    const n = await fixtures.next();
    await staff.query('BEGIN');
    try {
      const { rows } = await staff.query<{ id: string }>(
        `INSERT INTO assets (asset_code, serial_number, product_model_id, notes)
         VALUES ($1, $2, $3, 'From the box') RETURNING id`,
        [`NTP-SW-${String(n).padStart(5, '0')}`, `SN-NOTES-${n}`, modelId],
      );
      const assetId = rows[0]?.id ?? '';
      await staff.query(
        `INSERT INTO asset_movements (asset_id, movement_type, from_status, to_status, actor_user_id)
         VALUES ($1, 'registered', 'registered', 'registered', $2)`,
        [assetId, actorId],
      );
      await staff.query('COMMIT');

      expect(await notesOf(assetId)).toEqual({ notes: 'From the box', status: 'registered' });
    } catch (error) {
      await staff.query('ROLLBACK');
      throw error;
    }
  });

  it('still refuses status, even when it rides along with a notes change (42501)', async () => {
    const assetId = await fixtures.asset(modelId, actorId);

    const state = await sqlState(() =>
      staff.query("UPDATE assets SET notes = 'x', status = 'retired' WHERE id = $1", [assetId]),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await notesOf(assetId)).toEqual({ notes: null, status: 'in_stock' });
  });

  it('still refuses current_location_id alongside notes (42501)', async () => {
    const assetId = await fixtures.asset(modelId, actorId);
    const locationId = await fixtures.location();

    const state = await sqlState(() =>
      staff.query("UPDATE assets SET notes = 'x', current_location_id = $2 WHERE id = $1", [
        assetId,
        locationId,
      ]),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

interface OverviewRow {
  request_no: string;
  stage: string;
  request_status: string;
  partner_org_name: string;
  brand: string;
  model_name: string;
  category_code: string;
  quantity_requested: number;
  quantity_assigned: number;
  model_count: number;
  filed_by_name: string | null;
  decided_by_name: string | null;
  loan_no: string | null;
  released_by_name: string | null;
  original_due_date: string | null;
  due_date: string | null;
  items_released: number;
  items_returned: number;
  is_overdue: boolean;
}

describe('transaction_overview computes one stage per request (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;
  let orgId: string;
  let filerId: string;
  let deciderId: string;
  let modelId: string;

  // A fresh unit per test, so reservations and open loans never collide across tests.
  const PERIOD = '[2030-03-01,2030-03-08)';

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
    orgId = await fixtures.partnerOrg();
    filerId = await fixtures.partnerUser(orgId);
    deciderId = await fixtures.staffUser('manager');
    modelId = await fixtures.productModel();
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const overviewOf = async (requestId: string): Promise<OverviewRow> => {
    const { rows } = await staff.query<OverviewRow>(
      // to_char keeps dates as plain text, independent of the driver's date parsing.
      `SELECT request_no, stage, request_status, partner_org_name, brand, model_name,
              category_code, quantity_requested, quantity_assigned, model_count, filed_by_name,
              decided_by_name, loan_no, released_by_name,
              to_char(original_due_date, 'YYYY-MM-DD') AS original_due_date,
              to_char(due_date, 'YYYY-MM-DD') AS due_date,
              items_released, items_returned, is_overdue
         FROM transaction_overview WHERE request_id = $1`,
      [requestId],
    );
    expect(rows).toHaveLength(1);
    return rows[0] as OverviewRow;
  };

  /** A request for one unit of the shared model, with its item. */
  const request = async (quantity = 1) => {
    const requestId = await fixtures.loanRequest(orgId, filerId);
    const itemId = await fixtures.loanRequestItem(requestId, orgId, modelId, quantity);
    return { requestId, itemId };
  };

  /** Approved, one unit reserved, released on a loan. */
  const released = async (dueDate?: string) => {
    const { requestId, itemId } = await request();
    await fixtures.decideRequest(requestId, 'approved', deciderId);
    const assetId = await fixtures.asset(modelId, deciderId);
    const reservationId = await fixtures.reservation(assetId, itemId, PERIOD);
    await fixtures.setReservationStatus(reservationId, 'released');
    const loanId = await fixtures.loan(requestId, orgId, deciderId, dueDate);
    const loanItemId = await fixtures.loanItem(loanId, orgId, assetId, reservationId);
    await fixtures.decideRequest(requestId, 'fulfilled', deciderId);
    return { requestId, reservationId, loanId, loanItemId };
  };

  it('pending: submitted and undecided', async () => {
    const { requestId } = await request();

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'pending',
      request_status: 'submitted',
      decided_by_name: null,
      loan_no: null,
      items_released: 0,
      items_returned: 0,
      is_overdue: false,
    });
  });

  it('rejected: decided against, with the decider named', async () => {
    const { requestId } = await request();
    await fixtures.decideRequest(requestId, 'rejected', deciderId);

    const row = await overviewOf(requestId);

    expect(row.stage).toBe('rejected');
    expect(row.decided_by_name).toMatch(/^Staff \d+$/);
  });

  it('cancelled: withdrawn, with no decider recorded', async () => {
    const { requestId } = await request();
    await fixtures.decideRequest(requestId, 'cancelled', null);

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'cancelled',
      decided_by_name: null,
    });
  });

  it('expired: approved but never collected', async () => {
    const { requestId, itemId } = await request();
    await fixtures.decideRequest(requestId, 'approved', deciderId);
    const assetId = await fixtures.asset(modelId, deciderId);
    const reservationId = await fixtures.reservation(assetId, itemId, PERIOD);
    await fixtures.setReservationStatus(reservationId, 'expired');
    await fixtures.decideRequest(requestId, 'expired', deciderId);

    expect((await overviewOf(requestId)).stage).toBe('expired');
  });

  it('approved: a unit is reserved and nothing has left the building', async () => {
    const { requestId, itemId } = await request();
    await fixtures.decideRequest(requestId, 'approved', deciderId);
    const assetId = await fixtures.asset(modelId, deciderId);
    await fixtures.reservation(assetId, itemId, PERIOD);

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'approved',
      request_status: 'approved',
      loan_no: null,
      due_date: null,
    });
  });

  it('released: the loan exists and a unit is still out', async () => {
    const { requestId } = await released();

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'released',
      request_status: 'fulfilled',
      items_released: 1,
      items_returned: 0,
      original_due_date: '2030-03-05',
      due_date: '2030-03-05',
      is_overdue: false,
    });
    expect((await overviewOf(requestId)).released_by_name).toMatch(/^Staff \d+$/);
  });

  it('returned: every unit is back and a reservation still waits for inspection', async () => {
    const { requestId, loanItemId } = await released();
    await fixtures.returnLoanItem(loanItemId);

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'returned',
      items_released: 1,
      items_returned: 1,
      is_overdue: false,
    });
  });

  it('closed: every reservation is completed after inspection', async () => {
    const { requestId, loanItemId, reservationId } = await released();
    await fixtures.returnLoanItem(loanItemId);
    await fixtures.setReservationStatus(reservationId, 'completed');

    expect((await overviewOf(requestId)).stage).toBe('closed');
  });

  it('a partly released request stays released while a unit waits for pickup', async () => {
    const { requestId, itemId } = await request(2);
    await fixtures.decideRequest(requestId, 'approved', deciderId);
    const outAsset = await fixtures.asset(modelId, deciderId);
    const waitingAsset = await fixtures.asset(modelId, deciderId);
    const outReservation = await fixtures.reservation(outAsset, itemId, PERIOD);
    await fixtures.reservation(waitingAsset, itemId, PERIOD);
    await fixtures.setReservationStatus(outReservation, 'released');
    const loanId = await fixtures.loan(requestId, orgId, deciderId);
    const loanItemId = await fixtures.loanItem(loanId, orgId, outAsset, outReservation);
    await fixtures.returnLoanItem(loanItemId);
    await fixtures.setReservationStatus(outReservation, 'completed');

    expect(await overviewOf(requestId)).toMatchObject({
      stage: 'released',
      quantity_requested: 2,
      items_released: 1,
      items_returned: 1,
    });
  });

  it('is overdue only while a unit is out past its due date in Manila', async () => {
    const { requestId, loanItemId } = await released('2020-01-15');

    const whileOut = await overviewOf(requestId);
    await fixtures.returnLoanItem(loanItemId);
    const afterReturn = await overviewOf(requestId);

    expect(whileOut.is_overdue).toBe(true);
    expect(afterReturn.is_overdue).toBe(false);
  });

  it('shows the due date after approved extensions, ignoring pending and rejected ones', async () => {
    const { requestId, loanId } = await released();
    await fixtures.loanExtension(loanId, orgId, filerId, '2030-03-20', 'approved');
    await fixtures.loanExtension(loanId, orgId, filerId, '2030-04-30', 'requested');
    await fixtures.loanExtension(loanId, orgId, filerId, '2030-05-30', 'rejected');

    expect(await overviewOf(requestId)).toMatchObject({
      original_due_date: '2030-03-05',
      due_date: '2030-03-20',
    });
  });

  it('carries the company, model, category and quantities of the request', async () => {
    const { requestId, itemId } = await request(3);
    await staff.query('UPDATE loan_request_items SET quantity_assigned = 2 WHERE id = $1', [
      itemId,
    ]);

    expect(await overviewOf(requestId)).toMatchObject({
      partner_org_name: expect.stringMatching(/^Org \d+$/) as unknown,
      brand: expect.stringMatching(/^Brand \d+$/) as unknown,
      model_name: expect.stringMatching(/^Model \d+$/) as unknown,
      category_code: 'SW',
      quantity_requested: 3,
      quantity_assigned: 2,
      model_count: 1,
    });
  });

  it('returns exactly one row per request', async () => {
    const { requestId } = await released();

    const { rows } = await staff.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM transaction_overview WHERE request_id = $1',
      [requestId],
    );

    expect(rows).toEqual([{ n: 1 }]);
  });

  it('refuses a second loan for one request (23505), so the view cannot fan out', async () => {
    const { requestId } = await released();

    expect(await sqlState(() => fixtures.loan(requestId, orgId, deciderId))).toBe(UNIQUE_VIOLATION);
  });
});

describe('transaction_overview and the partner wall', () => {
  let fixtures: Fixtures;
  let orgA: string;
  let orgB: string;
  let userA: string;
  let requestA: string;
  let requestB: string;

  const scopeOf = (partnerOrgId: string, userId: string) => ({
    'app.partner_org_id': partnerOrgId,
    'app.user_id': userId,
  });

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    orgA = await fixtures.partnerOrg();
    orgB = await fixtures.partnerOrg();
    userA = await fixtures.partnerUser(orgA);
    const userB = await fixtures.partnerUser(orgB);
    const deciderId = await fixtures.staffUser('manager');
    const modelId = await fixtures.productModel();
    requestA = await fixtures.loanRequest(orgA, userA);
    requestB = await fixtures.loanRequest(orgB, userB);
    await fixtures.loanRequestItem(requestA, orgA, modelId);
    await fixtures.loanRequestItem(requestB, orgB, modelId);
    await fixtures.decideRequest(requestA, 'rejected', deciderId);
  });

  afterAll(async () => {
    await fixtures.close();
  });

  it('is not granted to the partner role at all (42501)', async () => {
    const state = await inRolledBackTransaction(
      getTestDb().partnerUrl,
      scopeOf(orgA, userA),
      (client) => sqlState(() => client.query('SELECT * FROM transaction_overview')),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  /**
   * Proves security_invoker: grants the view (and the one table it needs that partners lack)
   * inside a transaction that is rolled back, then reads as wms_partner. Without
   * security_invoker the view would run as its owner and show every company's rows.
   */
  const readAsPartnerWithTemporaryGrant = (settings: Record<string, string>) =>
    inRolledBackTransaction(getTestDb().superuserUrl, {}, async (client) => {
      await client.query('GRANT SELECT ON transaction_overview, reservations TO wms_partner');
      await client.query('SET LOCAL ROLE wms_partner');
      for (const [name, value] of Object.entries(settings)) {
        await client.query('SELECT set_config($1, $2, true)', [name, value]);
      }
      const { rows } = await client.query<{ request_id: string; decided_by_name: string | null }>(
        'SELECT request_id, decided_by_name FROM transaction_overview',
      );
      return rows;
    });

  it('applies row-level security through the view: scope A sees only A’s rows', async () => {
    const rows = await readAsPartnerWithTemporaryGrant(scopeOf(orgA, userA));

    expect(rows.map((row) => row.request_id)).toEqual([requestA]);
    expect(rows.map((row) => row.request_id)).not.toContain(requestB);
    // Staff rows are outside the partner's users policy, so the decider's name stays hidden.
    expect(rows[0]?.decided_by_name).toBeNull();
  });

  it('returns no rows at all when no scope is set', async () => {
    expect(await readAsPartnerWithTemporaryGrant({})).toEqual([]);
  });
});
