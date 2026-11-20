import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestDb, withClient } from '../../../packages/db/test/helpers.js';
import { buildWorld, dayFromToday, unique, type World } from './support.js';

interface ImportResult {
  valid: boolean;
  errors: { row: number; field: string; message: string }[];
  created: { row: number; code: string }[];
}

interface Detail {
  number: string;
  stage: string;
  isOverdue: boolean;
  dueDate: string | null;
  units: { assetCode: string; releasedAt: string | null }[];
}

let world: World;
let modelLabel: string;
let shelfCode: string;

beforeAll(async () => {
  world = await buildWorld();
  const models = (await world.admin.get('/api/v1/models')).json<
    { id: string; brand: string; name: string }[]
  >();
  const model = models.find((item) => item.id === world.modelId);
  modelLabel = `${model?.brand} ${model?.name}`;
  const locations = (await world.admin.get('/api/v1/locations')).json<
    { id: string; code: string }[]
  >();
  shelfCode = locations.find((item) => item.id === world.shelfId)?.code ?? '';
});
afterAll(() => world.apps.closeAll());

const row = (serial = unique('IMP').toUpperCase(), extra: Record<string, string> = {}) => ({
  model: modelLabel,
  serial,
  shelf: shelfCode,
  condition: 'B',
  notes: '',
  ...extra,
});

const importRows = (rows: unknown[], dryRun = false, key?: string) =>
  world.warehouse.post('/api/v1/units/import', { dryRun, rows }, key ? { key } : {});

async function unitCount(serial: string): Promise<number> {
  return withClient(getTestDb().superuserUrl, async (client) => {
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM assets WHERE serial_number = $1',
      [serial],
    );
    return rows[0]?.n ?? 0;
  });
}

describe('bulk import of existing stock', () => {
  it('reports every problem in a file on a dry run and writes nothing', async () => {
    const good = unique('OK').toUpperCase();
    const response = await importRows(
      [
        row(good),
        row(good.toLowerCase()), // the same serial again, in another case
        row(undefined, { model: 'No Such Model' }),
        row(undefined, { shelf: 'NOWHERE' }),
        row(undefined, { condition: 'E' }),
        row(''),
      ],
      true,
    );
    expect(response.statusCode).toBe(200);
    const result = response.json<ImportResult>();
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => [error.row, error.field])).toEqual([
      [2, 'serial'],
      [3, 'model'],
      [4, 'shelf'],
      [5, 'condition'],
      [6, 'serial'],
    ]);
    expect(await unitCount(good)).toBe(0);
  });

  it('accepts a clean file on a dry run without registering it', async () => {
    const serial = unique('DRY').toUpperCase();
    const result = (await importRows([row(serial)], true)).json<ImportResult>();
    expect(result).toEqual({ valid: true, errors: [], created: [] });
    expect(await unitCount(serial)).toBe(0);
  });

  it('registers and stocks every row, each with its own history', async () => {
    const serials = [unique('A').toUpperCase(), unique('B').toUpperCase()];
    const response = await importRows(
      serials.map((serial) => row(serial, { condition: 'grade c' })),
    );
    expect(response.statusCode).toBe(201);
    const result = response.json<ImportResult>();
    expect(result.created.map((item) => item.row)).toEqual([1, 2]);
    for (const { code } of result.created) {
      const unit = (await world.warehouse.get(`/api/v1/units/${code}`)).json<{
        status: string;
        condition: string;
        movements: { type: string }[];
      }>();
      expect(unit.status).toBe('in_stock');
      expect(unit.condition).toBe('c');
      expect(unit.movements.map((movement) => movement.type).sort()).toEqual([
        'registered',
        'stocked',
      ]);
    }
  });

  it('imports nothing when one row is bad', async () => {
    const serial = unique('ALL').toUpperCase();
    const response = await importRows([row(serial), row(undefined, { shelf: 'NOWHERE' })]);
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('import_invalid');
    expect(await unitCount(serial)).toBe(0);
  });

  it('refuses a serial the warehouse already has for that model', async () => {
    const serial = unique('DUP').toUpperCase();
    expect((await importRows([row(serial)])).statusCode).toBe(201);
    const again = (await importRows([row(serial)], true)).json<ImportResult>();
    expect(again.errors).toEqual([expect.objectContaining({ row: 1, field: 'serial' })]);
  });

  it('is not open to the auditor', async () => {
    const response = await world.auditor.post('/api/v1/units/import', { rows: [row()] });
    expect(response.statusCode).toBe(403);
  });

  it('imports a file once for two sequential presses with one key', async () => {
    const serial = unique('SEQ').toUpperCase();
    const key = randomUUID();
    const first = await importRows([row(serial)], false, key);
    const second = await importRows([row(serial)], false, key);
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(second.json()).toEqual(first.json());
    expect(await unitCount(serial)).toBe(1);
  });

  it('imports a file once for two concurrent presses with one key', async () => {
    const serial = unique('CON').toUpperCase();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      importRows([row(serial)], false, key),
      importRows([row(serial)], false, key),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(await unitCount(serial)).toBe(1);
  });
});

async function stockedUnit(): Promise<string> {
  const response = await world.warehouse.post('/api/v1/units', {
    modelId: world.modelId,
    serial: unique('EX').toUpperCase(),
    locationId: world.shelfId,
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ code: string }>().code;
}

const existing = (codes: string[], releasedOn: string, dueDate: string) => ({
  company: { name: `Go-live ${unique('g')}`, type: 'reseller' },
  contact: { name: 'Lia Santos', email: 'lia@golive.test', phone: '+63 917 222 3333' },
  purpose: 'Customer evaluation',
  releasedOn,
  dueDate,
  items: codes.map((code) => ({ scannedCode: code, accessoriesOut: [world.accessories[0]] })),
});

describe('recording loans that were out before go-live', () => {
  it('files, reserves and releases in one step, back-dated', async () => {
    const code = await stockedUnit();
    const response = await world.admin.post(
      '/api/v1/transactions/existing',
      existing([code], dayFromToday(-20), dayFromToday(10)),
    );
    expect(response.statusCode).toBe(201);
    const detail = response.json<Detail>();
    expect(detail.stage).toBe('released');
    expect(detail.isOverdue).toBe(false);
    expect(detail.units.map((unit) => unit.assetCode)).toEqual([code]);
    expect(detail.units[0]?.releasedAt).not.toBeNull();

    const unit = (await world.admin.get(`/api/v1/units/${code}`)).json<{ status: string }>();
    expect(unit.status).toBe('on_demo');
    const flags = await withClient(getTestDb().superuserUrl, async (client) => {
      const { rows } = await client.query<{ backdated: boolean; released: string }>(
        `SELECT lo.is_backdated AS backdated,
                (lo.released_at AT TIME ZONE 'Asia/Manila')::date::text AS released
           FROM loans lo WHERE lo.loan_no = $1`,
        [detail.number],
      );
      return rows[0];
    });
    expect(flags).toEqual({ backdated: true, released: dayFromToday(-20) });
  });

  it('shows a loan already past its due date as overdue, and takes it back normally', async () => {
    const code = await stockedUnit();
    const detail = (
      await world.admin.post(
        '/api/v1/transactions/existing',
        existing([code], dayFromToday(-30), dayFromToday(-2)),
      )
    ).json<Detail>();
    expect(detail.isOverdue).toBe(true);

    const back = await world.warehouse.post(`/api/v1/transactions/${detail.number}/return`, {
      scannedCode: code,
      accessoriesBack: [world.accessories[0]],
    });
    expect(back.statusCode).toBe(200);
    expect(back.json<Detail>().stage).toBe('returned');
  });

  it('is for administrators only', async () => {
    const code = await stockedUnit();
    const body = existing([code], dayFromToday(-5), dayFromToday(5));
    expect((await world.manager.post('/api/v1/transactions/existing', body)).statusCode).toBe(403);
    expect((await world.warehouse.post('/api/v1/transactions/existing', body)).statusCode).toBe(
      403,
    );
  });

  it('refuses a release date in the future and a unit not on the shelf', async () => {
    const code = await stockedUnit();
    const future = await world.admin.post(
      '/api/v1/transactions/existing',
      existing([code], dayFromToday(1), dayFromToday(5)),
    );
    expect(future.statusCode).toBe(422);

    await world.admin.post(
      '/api/v1/transactions/existing',
      existing([code], dayFromToday(-3), dayFromToday(3)),
    );
    const twice = await world.admin.post(
      '/api/v1/transactions/existing',
      existing([code], dayFromToday(-3), dayFromToday(3)),
    );
    expect(twice.statusCode).toBe(409);
    expect(twice.json<{ code: string }>().code).toBe('unit_not_ready');
  });

  it('refuses a unit already promised to another request for those dates', async () => {
    const code = await stockedUnit();
    const filed = await world.warehouse.post('/api/v1/transactions', {
      company: { name: `Future ${unique('f')}`, type: 'partner' },
      contact: { name: 'Mia Tan', email: 'mia@future.test', phone: '+63 917 444 5555' },
      modelId: world.modelId,
      neededFrom: dayFromToday(3),
      neededUntil: dayFromToday(6),
      purpose: 'Training',
    });
    const number = filed.json<{ number: string }>().number;
    expect(
      (await world.manager.post(`/api/v1/transactions/${number}/approve`, { assetCodes: [code] }))
        .statusCode,
    ).toBe(200);

    const overlap = await world.admin.post(
      '/api/v1/transactions/existing',
      existing([code], dayFromToday(-2), dayFromToday(4)),
    );
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json<{ code: string }>().code).toBe('unit_unavailable');
    const unit = (await world.admin.get(`/api/v1/units/${code}`)).json<{ status: string }>();
    expect(unit.status).toBe('in_stock');
  });

  it('records once for two concurrent presses with one key', async () => {
    const code = await stockedUnit();
    const key = randomUUID();
    const body = existing([code], dayFromToday(-4), dayFromToday(4));
    const [a, b] = await Promise.all([
      world.admin.post('/api/v1/transactions/existing', body, { key }),
      world.admin.post('/api/v1/transactions/existing', body, { key }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json<Detail>().number).toBe(b.json<Detail>().number);
    const again = await world.admin.post('/api/v1/transactions/existing', body, { key });
    expect(again.json<Detail>().number).toBe(a.json<Detail>().number);
  });
});
