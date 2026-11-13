import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, getTestDb, sqlState, waitUntilBlocked } from '../helpers.js';
import { Fixtures } from './fixtures.js';

const INSUFFICIENT_PRIVILEGE = '42501';
const STATUS_MISMATCH = 'WM001';
const ASSET_WITHOUT_MOVEMENT = 'WM002';
const FOREIGN_KEY_VIOLATION = '23503';

const INSERT_MOVEMENT = `
  INSERT INTO asset_movements
    (asset_id, movement_type, from_status, to_status, to_location_id, actor_user_id)
  VALUES ($1, $2, $3, $4, $5, $6)`;

describe('asset status changes only through a recorded movement (staff role)', () => {
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

  const readAsset = async (assetId: string) => {
    const { rows } = await staff.query<{ status: string; current_location_id: string | null }>(
      'SELECT status, current_location_id FROM assets WHERE id = $1',
      [assetId],
    );
    return rows[0];
  };

  it('(a) refuses a direct UPDATE of status with 42501', async () => {
    const assetId = await fixtures.asset(modelId, actorId, 'registered');

    const state = await sqlState(() =>
      staff.query("UPDATE assets SET status = 'in_stock' WHERE id = $1", [assetId]),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
    expect((await readAsset(assetId))?.status).toBe('registered');
  });

  it('(b) refuses a direct UPDATE of current_location_id with 42501', async () => {
    const assetId = await fixtures.asset(modelId, actorId);
    const locationId = await fixtures.location();

    const state = await sqlState(() =>
      staff.query('UPDATE assets SET current_location_id = $2 WHERE id = $1', [
        assetId,
        locationId,
      ]),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('(c) rejects a movement whose from_status is not the unit’s status with WM001', async () => {
    const assetId = await fixtures.asset(modelId, actorId, 'registered');

    const state = await sqlState(() =>
      staff.query(INSERT_MOVEMENT, [assetId, 'relocated', 'in_stock', 'in_stock', null, actorId]),
    );

    expect(state).toBe(STATUS_MISMATCH);
  });

  it('(d) rejects a transition missing from the whitelist with 23503', async () => {
    const assetId = await fixtures.asset(modelId, actorId, 'registered');

    const state = await sqlState(() =>
      staff.query(INSERT_MOVEMENT, [assetId, 'released', 'registered', 'on_demo', null, actorId]),
    );

    expect(state).toBe(FOREIGN_KEY_VIOLATION);
    expect((await readAsset(assetId))?.status).toBe('registered');
  });

  it('(e) applies a valid stocked movement to the status and the location', async () => {
    const assetId = await fixtures.asset(modelId, actorId, 'registered');
    const locationId = await fixtures.location();

    await staff.query(INSERT_MOVEMENT, [
      assetId,
      'stocked',
      'registered',
      'in_stock',
      locationId,
      actorId,
    ]);

    expect(await readAsset(assetId)).toEqual({
      status: 'in_stock',
      current_location_id: locationId,
    });
  });

  it('(e2) records the unit’s previous location on the movement', async () => {
    const assetId = await fixtures.asset(modelId, actorId, 'registered');
    const shelf = await fixtures.location();
    const bench = await fixtures.location();
    await staff.query(INSERT_MOVEMENT, [
      assetId,
      'stocked',
      'registered',
      'in_stock',
      shelf,
      actorId,
    ]);

    await staff.query(INSERT_MOVEMENT, [
      assetId,
      'relocated',
      'in_stock',
      'in_stock',
      bench,
      actorId,
    ]);

    const { rows } = await staff.query<{ from_location_id: string | null }>(
      `SELECT from_location_id FROM asset_movements
        WHERE asset_id = $1 AND movement_type = 'relocated'`,
      [assetId],
    );
    expect(rows[0]?.from_location_id).toBe(shelf);
    expect((await readAsset(assetId))?.current_location_id).toBe(bench);
  });

  it('(f) lets one of two concurrent released movements commit and fails the other with WM001', async () => {
    const assetId = await fixtures.asset(modelId, actorId);
    const first = await connect(getTestDb().staffUrl, 'status-ledger-first');
    const second = await connect(getTestDb().staffUrl, 'status-ledger-second');
    const release = [assetId, 'released', 'in_stock', 'on_demo', null, actorId];
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      await first.query(INSERT_MOVEMENT, release);

      // The second movement waits on the row lock the first one holds, then re-reads the new
      // status and must fail the check rather than overwrite it.
      const secondOutcome = sqlState(() => second.query(INSERT_MOVEMENT, release));
      await waitUntilBlocked('status-ledger-second');
      await first.query('COMMIT');

      expect(await secondOutcome).toBe(STATUS_MISMATCH);
    } finally {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
      await first.end();
      await second.end();
    }

    expect((await readAsset(assetId))?.status).toBe('on_demo');
    const { rows } = await staff.query<{ count: string }>(
      "SELECT count(*) FROM asset_movements WHERE asset_id = $1 AND movement_type = 'released'",
      [assetId],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('(g) fails the commit of an asset inserted with no movement with WM002', async () => {
    const n = await fixtures.next();
    const state = await sqlState(async () => {
      await staff.query('BEGIN');
      await staff.query(
        'INSERT INTO assets (asset_code, serial_number, product_model_id) VALUES ($1, $2, $3)',
        [`NTP-SW-${String(n).padStart(5, '0')}`, `SN-${n}`, modelId],
      );
      await staff.query('COMMIT');
    });

    expect(state).toBe(ASSET_WITHOUT_MOVEMENT);
    const { rows } = await staff.query('SELECT 1 FROM assets WHERE serial_number = $1', [
      `SN-${n}`,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('(g2) commits an asset inserted together with its registered movement', async () => {
    const n = await fixtures.next();
    await staff.query('BEGIN');
    const { rows } = await staff.query<{ id: string }>(
      `INSERT INTO assets (asset_code, serial_number, product_model_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [`NTP-SW-${String(n).padStart(5, '0')}`, `SN-${n}`, modelId],
    );
    await staff.query(INSERT_MOVEMENT, [
      rows[0]?.id,
      'registered',
      'registered',
      'registered',
      null,
      actorId,
    ]);

    expect(await sqlState(() => staff.query('COMMIT'))).toBeNull();
  });

  it('(h) refuses an INSERT that names the status column with 42501', async () => {
    const n = await fixtures.next();

    const state = await sqlState(() =>
      staff.query(
        `INSERT INTO assets (asset_code, serial_number, product_model_id, status)
         VALUES ($1, $2, $3, 'in_stock')`,
        [`NTP-SW-${String(n).padStart(5, '0')}`, `SN-${n}`, modelId],
      ),
    );

    expect(state).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
