import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, sqlState, waitUntilBlocked } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const EXCLUSION_VIOLATION = '23P01';

const INSERT_RESERVATION = `
  INSERT INTO reservations (asset_id, loan_request_item_id, period, status)
  VALUES ($1, $2, $3::daterange, $4)`;

describe('no double booking (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;
  let itemId: string;
  let actorId: string;
  let modelId: string;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
    const orgId = await fixtures.partnerOrg();
    const filerId = await fixtures.partnerUser(orgId);
    actorId = await fixtures.staffUser();
    modelId = await fixtures.productModel();
    const requestId = await fixtures.loanRequest(orgId, filerId);
    itemId = await fixtures.loanRequestItem(requestId, orgId, modelId);
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const newAsset = () => fixtures.asset(modelId, actorId);

  const reserve = (assetId: string, period: string, status = 'active') =>
    staff.query(INSERT_RESERVATION, [assetId, itemId, period, status]);

  it('(a) rejects an overlapping active reservation on one asset with 23P01', async () => {
    const assetId = await newAsset();
    await reserve(assetId, '[2030-03-01,2030-03-05)');

    const state = await sqlState(() => reserve(assetId, '[2030-03-04,2030-03-08)'));

    expect(state).toBe(EXCLUSION_VIOLATION);
  });

  it('(b) accepts adjacent half-open ranges [1st,5th) and [5th,9th)', async () => {
    const assetId = await newAsset();
    await reserve(assetId, '[2030-04-01,2030-04-05)');

    const state = await sqlState(() => reserve(assetId, '[2030-04-05,2030-04-09)'));

    expect(state).toBeNull();
  });

  it('(c) lets exactly one of two concurrent overlapping inserts commit', async () => {
    const assetId = await newAsset();
    const first = await connect(getTestDb().staffUrl, 'double-booking-first');
    const second = await connect(getTestDb().staffUrl, 'double-booking-second');
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      await first.query(INSERT_RESERVATION, [assetId, itemId, '[2030-05-01,2030-05-05)', 'active']);

      // The second insert must wait on the first transaction, not fail early: start it, prove
      // it is blocked on a lock, and only then let the first commit.
      const secondOutcome = sqlState(() =>
        second.query(INSERT_RESERVATION, [assetId, itemId, '[2030-05-03,2030-05-07)', 'active']),
      );
      await waitUntilBlocked('double-booking-second');
      await first.query('COMMIT');

      expect(await secondOutcome).toBe(EXCLUSION_VIOLATION);
    } finally {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
      await first.end();
      await second.end();
    }

    const { rows } = await staff.query<{ count: string }>(
      'SELECT count(*) FROM reservations WHERE asset_id = $1',
      [assetId],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('(d) accepts an overlap with a cancelled reservation', async () => {
    const assetId = await newAsset();
    await reserve(assetId, '[2030-06-01,2030-06-05)', 'cancelled');

    const state = await sqlState(() => reserve(assetId, '[2030-06-02,2030-06-04)'));

    expect(state).toBeNull();
  });

  it('(e) rejects reviving a cancelled row into an overlap with 23P01', async () => {
    const assetId = await newAsset();
    const cancelled = await staff.query<{ id: string }>(`${INSERT_RESERVATION} RETURNING id`, [
      assetId,
      itemId,
      '[2030-07-01,2030-07-05)',
      'cancelled',
    ]);
    await reserve(assetId, '[2030-07-02,2030-07-04)');

    const state = await sqlState(() =>
      staff.query("UPDATE reservations SET status = 'active' WHERE id = $1", [
        cancelled.rows[0]?.id,
      ]),
    );

    expect(state).toBe(EXCLUSION_VIOLATION);
  });
});
