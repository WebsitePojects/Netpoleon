import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Browser,
  buildWorld,
  dayFromToday,
  ORIGIN,
  seedStaff,
  unique,
  type World,
} from './support.js';

let world: World;
beforeAll(async () => {
  world = await buildWorld();
});
afterAll(() => world.apps.closeAll());

async function registerUnit(): Promise<string> {
  const response = await world.warehouse.post('/api/v1/units', {
    modelId: world.modelId,
    serial: unique('SN').toUpperCase(),
    locationId: world.shelfId,
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ code: string }>().code;
}

async function fileRequest(from = 10, until = 14): Promise<string> {
  const response = await world.warehouse.post('/api/v1/transactions', {
    company: { name: `Co ${unique('c')}`, type: 'reseller' },
    contact: { name: 'Ben Cruz', email: 'ben@co.test', phone: '+63 917 111 2222' },
    modelId: world.modelId,
    neededFrom: dayFromToday(from),
    neededUntil: dayFromToday(until),
    purpose: 'Training',
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ number: string }>().number;
}

describe('sign-in and sessions', () => {
  it('gives one answer for a wrong password and an unknown account', async () => {
    const user = await seedStaff('warehouse');
    const anonymous = new Browser(world.app);
    const wrong = await anonymous.post('/api/v1/auth/login', {
      identifier: user.username,
      password: 'nope-nope-nope',
    });
    const unknown = await anonymous.post('/api/v1/auth/login', {
      identifier: 'nobody-here',
      password: 'nope-nope-nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    // Same status, code and title; only the per-request id differs.
    const shape = (body: { status: number; code: string; title: string }) => [
      body.status,
      body.code,
      body.title,
    ];
    expect(shape(wrong.json())).toEqual(shape(unknown.json()));
  });

  it('sets an HttpOnly, SameSite=Lax session cookie and never returns the token in the body', async () => {
    const user = await seedStaff('auditor');
    const response = await world.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN, 'x-wms-request': '1' },
      payload: { identifier: user.username, password: 'correct horse battery' },
    });
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name.endsWith('wms_session'));
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(response.body).not.toContain(cookie?.value);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects requests without a session, and a deactivated user on their very next request', async () => {
    expect((await new Browser(world.app).get('/api/v1/units')).statusCode).toBe(401);
    const victim = await seedStaff('warehouse');
    const browser = await Browser.signIn(world.app, victim.username);
    expect((await browser.get('/api/v1/units')).statusCode).toBe(200);
    expect((await world.admin.post(`/api/v1/users/${victim.id}/deactivate`)).statusCode).toBe(200);
    expect((await browser.get('/api/v1/units')).statusCode).toBe(401);
  });

  it('does not let an admin deactivate themselves', async () => {
    const admin = await seedStaff('admin');
    const browser = await Browser.signIn(world.app, admin.username);
    const response = await browser.post(`/api/v1/users/${admin.id}/deactivate`);
    expect(response.statusCode).toBe(409);
  });
});

describe('request forgery', () => {
  it('rejects a mutation from another origin', async () => {
    const response = await world.warehouse.post(
      '/api/v1/units',
      { modelId: world.modelId, serial: 'X1', locationId: world.shelfId },
      { headers: { origin: 'https://evil.example' } },
    );
    expect(response.statusCode).toBe(403);
    expect(response.json<{ code: string }>().code).toBe('csrf_failed');
  });

  it('rejects a mutation without the custom header a plain form cannot send', async () => {
    const response = await world.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { identifier: 'x', password: 'y' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('requires an Idempotency-Key on signed-in mutations', async () => {
    const response = await world.warehouse.post(
      '/api/v1/units',
      { modelId: world.modelId, serial: 'X2', locationId: world.shelfId },
      { key: 'short' },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('idempotency_key_required');
  });
});

describe('permissions', () => {
  it('lets the auditor read but change nothing', async () => {
    expect((await world.auditor.get('/api/v1/units')).statusCode).toBe(200);
    const response = await world.auditor.post('/api/v1/units', {
      modelId: world.modelId,
      serial: unique('SN').toUpperCase(),
      locationId: world.shelfId,
    });
    expect(response.statusCode).toBe(403);
  });

  it('keeps user management and settings to administrators', async () => {
    expect((await world.manager.get('/api/v1/users')).statusCode).toBe(403);
    expect((await world.warehouse.patch('/api/v1/settings', { maxLoanDays: 40 })).statusCode).toBe(
      403,
    );
  });
});

describe('duplicate submissions', () => {
  it('replays the stored answer for a repeated Idempotency-Key, creating one unit', async () => {
    const key = randomUUID();
    const body = {
      modelId: world.modelId,
      serial: unique('SN').toUpperCase(),
      locationId: world.shelfId,
    };
    const first = await world.warehouse.post('/api/v1/units', body, { key });
    const second = await world.warehouse.post('/api/v1/units', body, { key });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
    const listed = (await world.warehouse.get(`/api/v1/units?q=${body.serial}`)).json<{
      total: number;
    }>();
    expect(listed.total).toBe(1);
  });

  it('gives two concurrent identical requests one effect and the same answer', async () => {
    const key = randomUUID();
    const body = {
      modelId: world.modelId,
      serial: unique('SN').toUpperCase(),
      locationId: world.shelfId,
    };
    const [a, b] = await Promise.all([
      world.warehouse.post('/api/v1/units', body, { key }),
      world.warehouse.post('/api/v1/units', body, { key }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json()).toEqual(b.json());
    const listed = (await world.warehouse.get(`/api/v1/units?q=${body.serial}`)).json<{
      total: number;
    }>();
    expect(listed.total).toBe(1);
  });

  it('rejects a reused key with a different body', async () => {
    const key = randomUUID();
    await world.warehouse.post(
      '/api/v1/units',
      { modelId: world.modelId, serial: unique('SN').toUpperCase(), locationId: world.shelfId },
      { key },
    );
    const reused = await world.warehouse.post(
      '/api/v1/units',
      { modelId: world.modelId, serial: unique('SN').toUpperCase(), locationId: world.shelfId },
      { key },
    );
    expect(reused.statusCode).toBe(422);
    expect(reused.json<{ code: string }>().code).toBe('idempotency_key_reused');
  });

  it('lets exactly one of two managers approve the same request', async () => {
    const code = await registerUnit();
    const number = await fileRequest();
    const otherManager = await Browser.signIn(world.app, (await seedStaff('manager')).username);
    const [a, b] = await Promise.all([
      world.manager.post(`/api/v1/transactions/${number}/approve`, { assetCodes: [code] }),
      otherManager.post(`/api/v1/transactions/${number}/approve`, { assetCodes: [code] }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  });
});

describe('no double booking', () => {
  it('refuses to promise one unit to two overlapping requests', async () => {
    const code = await registerUnit();
    const first = await fileRequest(20, 25);
    const second = await fileRequest(24, 28);
    expect(
      (await world.manager.post(`/api/v1/transactions/${first}/approve`, { assetCodes: [code] }))
        .statusCode,
    ).toBe(200);
    const clash = await world.manager.post(`/api/v1/transactions/${second}/approve`, {
      assetCodes: [code],
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json<{ code: string }>().code).toBe('unit_unavailable');
    // The failed approval left the second request untouched.
    const after = (await world.manager.get(`/api/v1/transactions/${second}`)).json<{
      stage: string;
    }>();
    expect(after.stage).toBe('pending');
  });

  it('keeps the turnaround buffer between back-to-back bookings', async () => {
    const code = await registerUnit();
    const first = await fileRequest(40, 44);
    // Starts the day after the first ends: inside the default 2-day inspection buffer.
    const second = await fileRequest(45, 47);
    expect(
      (await world.manager.post(`/api/v1/transactions/${first}/approve`, { assetCodes: [code] }))
        .statusCode,
    ).toBe(200);
    expect(
      (await world.manager.post(`/api/v1/transactions/${second}/approve`, { assetCodes: [code] }))
        .statusCode,
    ).toBe(409);
  });
});

describe('exports and input', () => {
  it('neutralises spreadsheet formulas in CSV exports', async () => {
    const response = await world.warehouse.post('/api/v1/transactions', {
      company: { name: `=HYPERLINK("x") ${unique('c')}`, type: 'partner' },
      contact: { name: '@SUM(A1)', email: 'f@x.test', phone: '+63 917 333 4444' },
      modelId: world.modelId,
      neededFrom: dayFromToday(60),
      neededUntil: dayFromToday(61),
      purpose: '+cmd',
    });
    expect(response.statusCode).toBe(201);
    const number = response.json<{ number: string }>().number;
    const csv = (await world.manager.get(`/api/v1/transactions/export.csv?q=${number}`)).body;
    expect(csv).toContain(`"'=HYPERLINK(""x"")`);
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'+cmd");
  });

  it('rejects unknown fields instead of ignoring them', async () => {
    const response = await world.warehouse.post('/api/v1/units', {
      modelId: world.modelId,
      serial: unique('SN').toUpperCase(),
      locationId: world.shelfId,
      status: 'on_demo',
    });
    expect(response.statusCode).toBe(400);
  });
});
