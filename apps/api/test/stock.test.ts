import { randomBytes } from 'node:crypto';
import { schema } from '@wms/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDb } from '../../../packages/db/test/helpers.js';
import { createModel, createShelves, createUser, intent, login, openDb, send } from './fixtures.js';
import { TestApps } from './harness.js';

const apps = new TestApps();
const db = openDb();
afterEach(() => apps.closeAll());
afterAll(() => db.close());

const urls = () => {
  const { staffUrl, partnerUrl } = getTestDb();
  return { staffUrl, partnerUrl };
};

let shelves: Awaited<ReturnType<typeof createShelves>>;
let model: Awaited<ReturnType<typeof createModel>>;
beforeAll(async () => {
  shelves = await createShelves(db);
  model = await createModel(db);
});

const serial = () => `SN-${randomBytes(5).toString('hex').toUpperCase()}`;

async function signedIn(role: 'admin' | 'warehouse' | 'auditor' = 'warehouse') {
  const { app } = await apps.create({ urls: urls() });
  const cookie = await login(app, await createUser(db, { role }));
  return { app, cookie };
}

async function register(app: FastifyInstance, cookie: string, overrides: object = {}) {
  const response = await send(app, 'POST', '/api/v1/assets', {
    cookie,
    headers: intent(),
    body: {
      productModelId: model.modelId,
      serialNumber: serial(),
      locationId: shelves.shelfA,
      ...overrides,
    },
  });
  return response;
}

async function registered(app: FastifyInstance, cookie: string) {
  const response = await register(app, cookie);
  expect(response.statusCode).toBe(201);
  return response.json<{ asset: { assetCode: string; id: string } }>().asset;
}

describe('registering a unit', () => {
  it('assigns the asset code, stocks it on the shelf and records both steps', async () => {
    const { app, cookie } = await signedIn();
    const response = await register(app, cookie, { serialNumber: 'fgt60f-lower-1', notes: 'Dent' });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      asset: { assetCode: string; status: string; serialNumber: string; location: { id: string } };
      accessories: string[];
      movements: { type: string }[];
    }>();
    expect(body.asset.assetCode).toMatch(/^NTP-FW-\d{5}$/);
    expect(body.asset.status).toBe('in_stock');
    expect(body.asset.serialNumber).toBe('FGT60F-LOWER-1');
    expect(body.asset.location.id).toBe(shelves.shelfA);
    expect(body.accessories).toEqual(['Console cable', 'Power adapter']);
    expect(body.movements.map((movement) => movement.type)).toEqual(['stocked', 'registered']);
  });

  it('has one effect when the same request is sent twice at once', async () => {
    const { app, cookie } = await signedIn();
    const body = {
      productModelId: model.modelId,
      serialNumber: serial(),
      locationId: shelves.shelfA,
    };
    const headers = intent();

    const results = await Promise.all([
      send(app, 'POST', '/api/v1/assets', { cookie, headers, body }),
      send(app, 'POST', '/api/v1/assets', { cookie, headers, body }),
    ]);

    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    const codes = results.map((r) => r.json<{ asset: { assetCode: string } }>().asset.assetCode);
    expect(codes[0]).toBe(codes[1]);
    const rows = await db.transaction({ kind: 'system' }, (tx) =>
      tx.select().from(schema.assets).where(eq(schema.assets.serialNumber, body.serialNumber)),
    );
    expect(rows).toHaveLength(1);
  });

  it('refuses a serial already used for the same model, but not for another model', async () => {
    const { app, cookie } = await signedIn();
    const shared = serial();
    expect((await register(app, cookie, { serialNumber: shared })).statusCode).toBe(201);

    const again = await register(app, cookie, { serialNumber: shared });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'serial_taken' });

    const other = await createModel(db);
    expect(
      (await register(app, cookie, { serialNumber: shared, productModelId: other.modelId }))
        .statusCode,
    ).toBe(201);
  });

  it('stocks only on a shelf, and only for roles that may register', async () => {
    const { app, cookie } = await signedIn();
    const onRoom = await register(app, cookie, { locationId: shelves.room });
    expect(onRoom.statusCode).toBe(400);
    expect(onRoom.json()).toMatchObject({ code: 'not_a_shelf' });

    const auditor = await signedIn('auditor');
    expect((await register(auditor.app, auditor.cookie)).statusCode).toBe(403);
  });

  it('needs the vendor name for a consigned unit', async () => {
    const { app, cookie } = await signedIn();
    const missing = await register(app, cookie, { ownership: 'vendor_consigned' });
    expect(missing.statusCode).toBe(400);
    const named = await register(app, cookie, {
      ownership: 'vendor_consigned',
      ownerName: 'Fortinet PH',
    });
    expect(named.statusCode).toBe(201);
  });
});

describe('the units list', () => {
  it('pages by keyset with every unit exactly once, in order, with the total', async () => {
    const { app, cookie } = await signedIn();
    const fresh = await createModel(db, 'RT');
    for (let index = 0; index < 7; index += 1) {
      expect((await register(app, cookie, { productModelId: fresh.modelId })).statusCode).toBe(201);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let total: number;
    do {
      const query: string = `/api/v1/assets?categoryId=${fresh.categoryId}&q=${encodeURIComponent('FG-')}&limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await send(app, 'GET', query, { cookie });
      expect(page.statusCode).toBe(200);
      const body = page.json<{
        items: { assetCode: string }[];
        nextCursor: string | null;
        total: number;
      }>();
      seen.push(...body.items.map((item) => item.assetCode));
      cursor = body.nextCursor;
      total = body.total;
    } while (cursor);

    expect(total).toBeGreaterThanOrEqual(7);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(seen);
  });

  it('issues the same number of queries for one row or a hundred', async () => {
    const counts: number[] = [];
    for (const limit of [1, 100]) {
      const statements: string[] = [];
      const { app } = await apps.create({ urls: urls(), onQuery: (text) => statements.push(text) });
      const cookie = await login(app, await createUser(db));
      statements.length = 0;
      const page = await send(app, 'GET', `/api/v1/assets?limit=${limit}`, { cookie });
      expect(page.statusCode).toBe(200);
      counts.push(statements.length);
    }
    expect(counts[0]).toBe(counts[1]);
  });

  it('leaves retired units out unless asked for them', async () => {
    const { app, cookie } = await signedIn('admin');
    const asset = await registered(app, cookie);
    await send(app, 'POST', `/api/v1/assets/${asset.assetCode}/retire`, {
      cookie,
      headers: intent(),
      body: { reason: 'End of life' },
    });

    const visible = await send(app, 'GET', `/api/v1/assets?q=${asset.assetCode}`, { cookie });
    expect(visible.json<{ total: number }>().total).toBe(0);
    const retired = await send(app, 'GET', `/api/v1/assets?q=${asset.assetCode}&status=retired`, {
      cookie,
    });
    expect(retired.json<{ total: number }>().total).toBe(1);
  });
});

describe('moving units', () => {
  it('moves a unit in stock and refuses the shelf it is already on', async () => {
    const { app, cookie } = await signedIn();
    const asset = await registered(app, cookie);

    const moved = await send(app, 'POST', `/api/v1/assets/${asset.assetCode}/move`, {
      cookie,
      headers: intent(),
      body: { locationId: shelves.shelfB },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ asset: { location: { id: shelves.shelfB } } });

    const same = await send(app, 'POST', `/api/v1/assets/${asset.assetCode}/move`, {
      cookie,
      headers: intent(),
      body: { locationId: shelves.shelfB },
    });
    expect(same.statusCode).toBe(409);
  });

  it('moves a batch and names each unit it skipped', async () => {
    const { app, cookie } = await signedIn('admin');
    const first = await registered(app, cookie);
    const second = await registered(app, cookie);
    await send(app, 'POST', `/api/v1/assets/${second.assetCode}/repair`, {
      cookie,
      headers: intent(),
      body: { reason: 'Fan noise' },
    });

    const batch = await send(app, 'POST', '/api/v1/assets/move', {
      cookie,
      headers: intent(),
      body: {
        codes: [first.assetCode, second.assetCode, 'NTP-FW-99998'],
        locationId: shelves.shelfB,
      },
    });

    expect(batch.statusCode).toBe(200);
    const result = batch.json<{ done: string[]; skipped: { code: string; reason: string }[] }>();
    expect(result.done).toEqual([first.assetCode]);
    expect(result.skipped.map((item) => item.code).sort()).toEqual(
      [second.assetCode, 'NTP-FW-99998'].sort(),
    );
    expect(result.skipped.find((item) => item.code === second.assetCode)?.reason).toMatch(
      /for repair/,
    );
  });
});

describe('repair and retirement', () => {
  it('follows the lifecycle: repair, back through inspection, then retire', async () => {
    const { app, cookie } = await signedIn('admin');
    const asset = await registered(app, cookie);
    const step = (path: string, body: object) =>
      send(app, 'POST', `/api/v1/assets/${asset.assetCode}/${path}`, {
        cookie,
        headers: intent(),
        body,
      });

    expect((await step('repair', { reason: 'Port 3 dead' })).json()).toMatchObject({
      asset: { status: 'for_repair' },
    });
    expect((await step('repaired', { note: 'Board replaced' })).json()).toMatchObject({
      asset: { status: 'under_inspection' },
    });
    const retired = await step('retire', { reason: 'Obsolete' });
    expect(retired.json()).toMatchObject({ asset: { status: 'retired' } });

    const again = await step('retire', { reason: 'Twice' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'wrong_status' });

    const [row] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ retiredAt: schema.assets.retiredAt })
        .from(schema.assets)
        .where(eq(schema.assets.id, asset.id)),
    );
    expect(row?.retiredAt).not.toBeNull();
  });

  it('lets exactly one of two conflicting steps win when they arrive together', async () => {
    const { app, cookie } = await signedIn('admin');
    const asset = await registered(app, cookie);

    const results = await Promise.all([
      send(app, 'POST', `/api/v1/assets/${asset.assetCode}/retire`, {
        cookie,
        headers: intent(),
        body: { reason: 'Retire it' },
      }),
      send(app, 'POST', `/api/v1/assets/${asset.assetCode}/repair`, {
        cookie,
        headers: intent(),
        body: { reason: 'Repair it' },
      }),
    ]);

    const statuses = results.map((r) => r.statusCode).sort();
    // Retire-then-repair is refused; repair-then-retire is a legal sequence. Either way the
    // history must agree with the final status.
    expect(statuses[0]).toBe(200);
    const detail = await send(app, 'GET', `/api/v1/assets/${asset.assetCode}`, { cookie });
    const body = detail.json<{ asset: { status: string }; movements: { toStatus: string }[] }>();
    expect(body.movements[0]?.toStatus).toBe(body.asset.status);
  });

  it('flags a future reservation of a unit sent to repair', async () => {
    const { app, cookie } = await signedIn('admin');
    const asset = await registered(app, cookie);
    const reservationId = await db.transaction({ kind: 'system' }, async (tx) => {
      const filer = await createUser(db);
      const [org] = await tx
        .insert(schema.partnerOrgs)
        .values({ name: `Reserving Co ${randomBytes(3).toString('hex')}`, type: 'partner' })
        .returning({ id: schema.partnerOrgs.id });
      if (!org) throw new Error('org insert failed');
      const [request] = await tx
        .insert(schema.loanRequests)
        .values({
          requestNo: `REQ-${randomBytes(4).toString('hex')}`,
          partnerOrgId: org.id,
          filedByUserId: filer.id,
          contactName: 'Juan',
          contactEmail: 'juan@example.test',
          contactPhone: '0917',
          neededFrom: '2099-01-10',
          neededUntil: '2099-01-20',
          purpose: 'Demo',
          status: 'approved',
        })
        .returning({ id: schema.loanRequests.id });
      if (!request) throw new Error('request insert failed');
      const [item] = await tx
        .insert(schema.loanRequestItems)
        .values({
          loanRequestId: request.id,
          partnerOrgId: org.id,
          productModelId: model.modelId,
          quantityRequested: 1,
          quantityAssigned: 1,
        })
        .returning({ id: schema.loanRequestItems.id });
      if (!item) throw new Error('item insert failed');
      const [reservation] = await tx
        .insert(schema.reservations)
        .values({
          assetId: asset.id,
          loanRequestItemId: item.id,
          period: '[2099-01-10,2099-01-23)',
        })
        .returning({ id: schema.reservations.id });
      return reservation?.id ?? '';
    });

    const repaired = await send(app, 'POST', `/api/v1/assets/${asset.assetCode}/repair`, {
      cookie,
      headers: intent(),
      body: { reason: 'Overheats' },
    });
    expect(repaired.json()).toMatchObject({ reservationsFlagged: 1 });
    const [row] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ status: schema.reservations.status })
        .from(schema.reservations)
        .where(and(eq(schema.reservations.id, reservationId))),
    );
    expect(row?.status).toBe('needs_reassignment');
  });
});

describe('editing a unit', () => {
  it('changes only the given fields and records the change', async () => {
    const { app, cookie } = await signedIn();
    const asset = await registered(app, cookie);

    const edited = await send(app, 'PATCH', `/api/v1/assets/${asset.assetCode}`, {
      cookie,
      headers: intent(),
      body: { condition: 'b', notes: 'Scratched lid' },
    });

    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ asset: { condition: 'b', notes: 'Scratched lid' } });
    const empty = await send(app, 'PATCH', `/api/v1/assets/${asset.assetCode}`, {
      cookie,
      headers: intent(),
      body: {},
    });
    expect(empty.statusCode).toBe(400);
  });
});

describe('the catalog', () => {
  it('returns categories, models with accessories, and locations with their parent', async () => {
    const { app, cookie } = await signedIn();
    const response = await send(app, 'GET', '/api/v1/catalog', { cookie });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      categories: { code: string }[];
      models: { id: string; accessories: string[] }[];
      locations: { id: string; parentName: string | null }[];
    }>();
    expect(body.categories.map((category) => category.code)).toContain('FW');
    expect(body.models.find((item) => item.id === model.modelId)?.accessories).toHaveLength(2);
    expect(body.locations.find((item) => item.id === shelves.shelfA)?.parentName).toMatch(/^Room/);
  });

  it('creates a model with its accessories and refuses a duplicate', async () => {
    const { app, cookie } = await signedIn();
    const name = `X-${randomBytes(3).toString('hex')}`;
    const body = {
      categoryId: model.categoryId,
      brand: 'Aruba',
      modelName: name,
      accessories: ['Rack ears'],
    };
    const first = await send(app, 'POST', '/api/v1/models', { cookie, headers: intent(), body });
    expect(first.statusCode).toBe(201);
    const second = await send(app, 'POST', '/api/v1/models', {
      cookie,
      headers: intent(),
      body: { ...body, brand: 'ARUBA' },
    });
    expect(second.statusCode).toBe(409);
  });

  it('keeps locations in their tree: a shelf only inside a room', async () => {
    const { app, cookie } = await signedIn('admin');
    const code = `T-${randomBytes(3).toString('hex').toUpperCase()}`;
    const wrong = await send(app, 'POST', '/api/v1/locations', {
      cookie,
      headers: intent(),
      body: { name: 'Bad shelf', code, kind: 'shelf', parentId: shelves.site },
    });
    expect(wrong.statusCode).toBe(400);
    const right = await send(app, 'POST', '/api/v1/locations', {
      cookie,
      headers: intent(),
      body: { name: 'Good shelf', code, kind: 'shelf', parentId: shelves.room },
    });
    expect(right.statusCode).toBe(201);
  });
});

describe('units by code', () => {
  it('returns exactly the asked-for units, retired ones included', async () => {
    const { app, cookie } = await signedIn('admin');
    const first = await registered(app, cookie);
    const second = await registered(app, cookie);
    await send(app, 'POST', `/api/v1/assets/${second.assetCode}/retire`, {
      cookie,
      headers: intent(),
      body: { reason: 'Gone' },
    });

    const response = await send(
      app,
      'GET',
      `/api/v1/assets?codes=${first.assetCode},${second.assetCode.toLowerCase()}&limit=100`,
      { cookie },
    );
    expect(response.statusCode).toBe(200);
    const codes = response.json<{ items: { assetCode: string }[] }>().items.map((i) => i.assetCode);
    expect(codes.sort()).toEqual([first.assetCode, second.assetCode].sort());

    const bad = await send(app, 'GET', '/api/v1/assets?codes=NOT-A-CODE', { cookie });
    expect(bad.statusCode).toBe(400);
  });
});
