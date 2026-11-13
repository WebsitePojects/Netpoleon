import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestDb, inRolledBackTransaction, sqlState } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const INVALID_PARAMETER_VALUE = '22023';

describe('model_availability', () => {
  let fixtures: Fixtures;
  let orgA: string;
  let userA: string;
  let modelId: string;
  let bookedAssetId: string;

  const asPartnerA = <T>(fn: (client: Client) => Promise<T>) =>
    inRolledBackTransaction(
      getTestDb().partnerUrl,
      { 'app.partner_org_id': orgA, 'app.user_id': userA },
      fn,
    );

  const unitsFree = async (model: string, from: string, until: string): Promise<number | null> => {
    const { rows } = await asPartnerA((client) =>
      client.query<{ product_model_id: string; units_free: number }>(
        'SELECT * FROM model_availability($1::date, $2::date)',
        [from, until],
      ),
    );
    return rows.find((row) => row.product_model_id === model)?.units_free ?? null;
  };

  beforeAll(async () => {
    fixtures = await Fixtures.open();
    orgA = await fixtures.partnerOrg();
    userA = await fixtures.partnerUser(orgA);
    const orgB = await fixtures.partnerOrg();
    const userB = await fixtures.partnerUser(orgB);
    const actorId = await fixtures.staffUser();
    modelId = await fixtures.productModel();

    // Three units on the shelf and one retired; company B reserves one of the three.
    bookedAssetId = await fixtures.asset(modelId, actorId);
    await fixtures.asset(modelId, actorId);
    await fixtures.asset(modelId, actorId);
    await fixtures.asset(modelId, actorId, 'retired');
    const requestB = await fixtures.loanRequest(orgB, userB);
    const itemB = await fixtures.loanRequestItem(requestB, orgB, modelId);
    await fixtures.reservation(bookedAssetId, itemB, '[2030-09-10,2030-09-15)');
  });

  afterAll(async () => {
    await fixtures.close();
  });

  it('counts free units across every company’s reservations: 3 on the shelf, 1 booked, 1 retired', async () => {
    expect(await unitsFree(modelId, '2030-09-12', '2030-09-13')).toBe(2);
  });

  it('counts all three units when the window misses the reservation', async () => {
    expect(await unitsFree(modelId, '2030-09-20', '2030-09-22')).toBe(3);
  });

  it('treats both ends of the window as inclusive', async () => {
    // The reservation is [10th,15th): the 14th is its last night, the 15th is free again.
    expect(await unitsFree(modelId, '2030-09-14', '2030-09-14')).toBe(2);
    expect(await unitsFree(modelId, '2030-09-15', '2030-09-15')).toBe(3);
    expect(await unitsFree(modelId, '2030-09-08', '2030-09-10')).toBe(2);
    expect(await unitsFree(modelId, '2030-09-08', '2030-09-09')).toBe(3);
  });

  it('does not count a cancelled reservation against availability', async () => {
    const actorId = await fixtures.staffUser();
    const model = await fixtures.productModel();
    const orgB = await fixtures.partnerOrg();
    const userB = await fixtures.partnerUser(orgB);
    const asset = await fixtures.asset(model, actorId);
    const request = await fixtures.loanRequest(orgB, userB);
    const item = await fixtures.loanRequestItem(request, orgB, model);
    await fixtures.reservation(asset, item, '[2030-09-10,2030-09-15)', 'cancelled');

    expect(await unitsFree(model, '2030-09-12', '2030-09-13')).toBe(1);
  });

  it('returns exactly the two documented columns and no other company’s data', async () => {
    const result = await asPartnerA((client) =>
      client.query('SELECT * FROM model_availability($1::date, $2::date)', [
        '2030-09-12',
        '2030-09-13',
      ]),
    );

    expect(result.fields.map((field) => field.name)).toEqual(['product_model_id', 'units_free']);
  });

  it('leaves out models that partners may not book', async () => {
    const model = await fixtures.productModel({ bookable: false });

    expect(await unitsFree(model, '2030-09-12', '2030-09-13')).toBeNull();
  });

  it('raises when the end date is before the start date', async () => {
    const state = await asPartnerA((client) =>
      sqlState(() =>
        client.query('SELECT * FROM model_availability($1::date, $2::date)', [
          '2030-09-13',
          '2030-09-12',
        ]),
      ),
    );

    expect(state).toBe(INVALID_PARAMETER_VALUE);
  });

  it('raises when the range spans more than 366 days', async () => {
    const state = await asPartnerA((client) =>
      sqlState(() =>
        client.query('SELECT * FROM model_availability($1::date, $2::date)', [
          '2030-01-01',
          '2031-01-03',
        ]),
      ),
    );

    expect(state).toBe(INVALID_PARAMETER_VALUE);
  });
});
