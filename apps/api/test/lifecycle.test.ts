import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, dayFromToday, unique, type World } from './support.js';

/**
 * The seven-step lifecycle end to end through the HTTP API, as the console drives it:
 * register and shelve, request, approve with a unit, release with accessories, return one short,
 * inspect and restock. Each step is checked in the data, not only in the status code.
 */
describe('demo unit lifecycle', () => {
  let world: World;
  let code: string;
  let number: string;

  beforeAll(async () => {
    world = await buildWorld();
  });
  afterAll(() => world.apps.closeAll());

  it('registers a unit straight onto a shelf with a fresh asset code', async () => {
    const response = await world.warehouse.post('/api/v1/units', {
      modelId: world.modelId,
      serial: unique('SN').toUpperCase(),
      condition: 'a',
      locationId: world.shelfId,
    });
    expect(response.statusCode).toBe(201);
    const unit = response.json<{ code: string; status: string; location: { id: string } }>();
    expect(unit.code).toMatch(/^NTP-SW-\d{5}$/);
    expect(unit.status).toBe('in_stock');
    expect(unit.location.id).toBe(world.shelfId);
    code = unit.code;

    const detail = (await world.warehouse.get(`/api/v1/units/${code}`)).json<{
      movements: { type: string }[];
    }>();
    expect(detail.movements.map((m) => m.type)).toEqual(['stocked', 'registered']);
  });

  it('files a request that does not hold stock until approved', async () => {
    const response = await world.warehouse.post('/api/v1/transactions', {
      company: { name: `Acme ${unique('co')}`, type: 'partner' },
      contact: { name: 'Ana Reyes', email: 'ana@acme.test', phone: '+63 917 000 0000' },
      modelId: world.modelId,
      quantity: 1,
      neededFrom: dayFromToday(1),
      neededUntil: dayFromToday(5),
      purpose: 'Firewall proof of concept',
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<{ number: string; stage: string; unitCodes: string[] }>();
    expect(created.number).toMatch(/^BRR-\d{4}-\d{5}$/);
    expect(created.stage).toBe('pending');
    expect(created.unitCodes).toEqual([]);
    number = created.number;
  });

  it('refuses to let the filer approve their own request', async () => {
    const response = await world.warehouse.post(`/api/v1/transactions/${number}/approve`, {
      assetCodes: [code],
    });
    // The warehouse role cannot decide at all; the permission check answers first.
    expect(response.statusCode).toBe(403);
  });

  it('offers the unit as a candidate and approves it, reserving it', async () => {
    const candidates = (await world.manager.get(`/api/v1/transactions/${number}/candidates`)).json<{
      units: { code: string }[];
    }>();
    expect(candidates.units.map((u) => u.code)).toContain(code);

    const response = await world.manager.post(`/api/v1/transactions/${number}/approve`, {
      assetCodes: [code],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ stage: string; unitCodes: string[] }>()).toMatchObject({
      stage: 'approved',
      unitCodes: [code],
    });
    const unit = (await world.manager.get(`/api/v1/units/${code}`)).json<{ reservedFor: string }>();
    expect(unit.reservedFor).toBe(number);
  });

  it('refuses to release a unit that is not on the request', async () => {
    const response = await world.warehouse.post(`/api/v1/transactions/${number}/release`, {
      items: [{ scannedCode: 'NTP-SW-99999', accessoriesOut: [] }],
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('wrong_unit');
  });

  it('releases the scanned unit with its accessories', async () => {
    const response = await world.warehouse.post(`/api/v1/transactions/${number}/release`, {
      items: [{ scannedCode: code, accessoriesOut: world.accessories }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ stage: string }>().stage).toBe('released');
    const unit = (await world.warehouse.get(`/api/v1/units/${code}`)).json<{ status: string }>();
    expect(unit.status).toBe('on_demo');
  });

  it('receives the unit back short of an accessory and raises the alert', async () => {
    const response = await world.warehouse.post(`/api/v1/transactions/${number}/return`, {
      scannedCode: code,
      accessoriesBack: ['Power adapter'],
      note: 'Rack ears missing',
    });
    expect(response.statusCode).toBe(200);
    const detail = response.json<{ stage: string; units: { missingAccessories: string[] }[] }>();
    expect(detail.stage).toBe('returned');
    expect(detail.units[0]?.missingAccessories).toEqual(['Rack ears']);

    const alerts = (await world.manager.get('/api/v1/alerts')).json<{
      items: { kind: string; transactionNumber: string | null; assetCode: string | null }[];
    }>();
    expect(alerts.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing_accessory', transactionNumber: number }),
        expect.objectContaining({ kind: 'for_inspection', assetCode: code }),
      ]),
    );
  });

  it('inspects and restocks the unit, closing the transaction', async () => {
    const response = await world.warehouse.post(`/api/v1/units/${code}/inspection`, {
      outcome: 'restock',
      grade: 'b',
      checklist: {
        powersOn: true,
        portsWork: true,
        noPhysicalDamage: true,
        factoryReset: true,
        accessoriesComplete: false,
      },
      notes: 'Rack ears to be replaced',
      locationId: world.otherShelfId,
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ status: string; condition: string; location: { id: string } }>(),
    ).toMatchObject({
      status: 'in_stock',
      condition: 'b',
      location: { id: world.otherShelfId },
    });

    const transaction = (await world.manager.get(`/api/v1/transactions/${number}`)).json<{
      stage: string;
    }>();
    expect(transaction.stage).toBe('closed');

    const detail = (await world.manager.get(`/api/v1/units/${code}`)).json<{
      movements: { type: string }[];
    }>();
    expect(detail.movements.map((m) => m.type)).toEqual([
      'restocked',
      'inspection_started',
      'returned',
      'released',
      'stocked',
      'registered',
    ]);
  });

  it('lists the unit and the transaction with totals, and records an audit trail', async () => {
    const units = (await world.manager.get(`/api/v1/units?q=${code}`)).json<{
      total: number;
      items: { code: string }[];
    }>();
    expect(units.total).toBe(1);
    expect(units.items[0]?.code).toBe(code);

    const transactions = (await world.manager.get(`/api/v1/transactions?q=${number}`)).json<{
      total: number;
    }>();
    expect(transactions.total).toBe(1);

    const audit = (await world.warehouse.get('/api/v1/audit?actor=me')).json<{
      items: { action: string }[];
    }>();
    expect(audit.items.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'unit.register',
        'transaction.create',
        'transaction.release',
        'inspection.record',
      ]),
    );
  });

  it('serves the dashboard and every report', async () => {
    for (const url of [
      '/api/v1/dashboard',
      '/api/v1/reports/overview',
      `/api/v1/reports/tracking?from=${dayFromToday(-30)}&until=${dayFromToday(0)}`,
      `/api/v1/reports/borrowers?from=${dayFromToday(-30)}&until=${dayFromToday(0)}`,
      '/api/v1/reports/aging',
      '/api/v1/reports/utilization',
      '/api/v1/inspections?status=returned',
      '/api/v1/transactions/stage-counts',
      '/api/v1/bootstrap',
    ]) {
      const response = await world.auditor.get(url);
      expect(response.statusCode, `${url}: ${response.body.slice(0, 200)}`).toBe(200);
    }
  });
});
