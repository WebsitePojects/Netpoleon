import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const UNIQUE_VIOLATION = '23505';

describe('a unit is on at most one open loan (staff role)', () => {
  let fixtures: Fixtures;
  let staff: Client;
  let orgId: string;
  let loanId: string;
  let modelId: string;
  let actorId: string;

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    staff = await connect(getTestDb().staffUrl);
    orgId = await fixtures.partnerOrg();
    const filerId = await fixtures.partnerUser(orgId);
    actorId = await fixtures.staffUser();
    modelId = await fixtures.productModel();
    const requestId = await fixtures.loanRequest(orgId, filerId);
    loanId = await fixtures.loan(requestId, orgId, actorId);
  });

  afterAll(async () => {
    await staff.end();
    await fixtures.close();
  });

  const insertLoanItem = (assetId: string) =>
    staff.query(
      'INSERT INTO loan_items (loan_id, partner_org_id, asset_id, released_at) VALUES ($1, $2, $3, now())',
      [loanId, orgId, assetId],
    );

  it('rejects a second open loan item for the same asset with 23505', async () => {
    const assetId = await fixtures.asset(modelId, actorId);
    await insertLoanItem(assetId);

    expect(await sqlState(() => insertLoanItem(assetId))).toBe(UNIQUE_VIOLATION);
  });

  it('accepts a new loan item once the first has been returned', async () => {
    const assetId = await fixtures.asset(modelId, actorId);
    await insertLoanItem(assetId);
    await staff.query('UPDATE loan_items SET returned_at = now() WHERE asset_id = $1', [assetId]);

    expect(await sqlState(() => insertLoanItem(assetId))).toBeNull();
  });

  it('lets two different assets be open on the same loan', async () => {
    const first = await fixtures.asset(modelId, actorId);
    const second = await fixtures.asset(modelId, actorId);
    await insertLoanItem(first);

    expect(await sqlState(() => insertLoanItem(second))).toBeNull();
  });
});
