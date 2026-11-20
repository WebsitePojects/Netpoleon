import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, dayFromToday, unique, type World } from './support.js';

interface Detail {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'archived';
  contactCount: number;
  requestCount: number;
  openRequests: number;
  unitsOut: number;
  contacts: { id: string; name: string; email: string; phone: string; lastUsedAt: string | null }[];
}

let world: World;
beforeAll(async () => {
  world = await buildWorld();
});
afterAll(() => world.apps.closeAll());

const companyName = () => `Partner ${unique('p')}`;

async function createCompany(name = companyName()): Promise<Detail> {
  const response = await world.manager.post('/api/v1/partners', { name, type: 'reseller' });
  expect(response.statusCode).toBe(201);
  return response.json<Detail>();
}

async function fileFor(
  company: { id: string } | { name: string; type: string },
  phone = '+63 917 111 2222',
) {
  return world.warehouse.post('/api/v1/transactions', {
    company,
    contact: { name: 'Ben Cruz', email: 'ben@partner.test', phone },
    modelId: world.modelId,
    neededFrom: dayFromToday(30),
    neededUntil: dayFromToday(32),
    purpose: 'Training',
  });
}

const detailOf = async (id: string) =>
  (await world.warehouse.get(`/api/v1/partners/${id}`)).json<Detail>();

describe('partner directory', () => {
  it('remembers the contact a request was filed with, newest details winning', async () => {
    const company = await createCompany();
    expect((await fileFor({ id: company.id })).statusCode).toBe(201);
    expect((await fileFor({ id: company.id }, '+63 2 8555 0199')).statusCode).toBe(201);

    const detail = await detailOf(company.id);
    expect(detail).toMatchObject({
      requestCount: 2,
      openRequests: 2,
      unitsOut: 0,
      contactCount: 1,
    });
    expect(detail.contacts).toEqual([
      expect.objectContaining({ email: 'ben@partner.test', phone: '+63 2 8555 0199' }),
    ]);
    expect(detail.contacts[0]?.lastUsedAt).not.toBeNull();
  });

  it('lists, searches and pages the directory with a total', async () => {
    const tag = unique('dir');
    await createCompany(`Alpha ${tag}`);
    await createCompany(`Beta ${tag}`);
    const page = (
      await world.auditor.get(`/api/v1/partners/directory?q=${tag}&pageSize=1&sort=name`)
    ).json<{
      items: Detail[];
      total: number;
    }>();
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.name)).toEqual([`Alpha ${tag}`]);
  });

  it('rejects a filter value it does not know', async () => {
    expect((await world.manager.get('/api/v1/partners/directory?status=deleted')).statusCode).toBe(
      400,
    );
  });
});

describe('partner changes', () => {
  it('refuses a second company with the same name in any case', async () => {
    const name = companyName();
    await createCompany(name);
    const again = await world.manager.post('/api/v1/partners', {
      name: name.toUpperCase(),
      type: 'partner',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ code: string }>().code).toBe('name_taken');
  });

  it('lets only roles with partners.manage change the directory', async () => {
    const body = { name: companyName(), type: 'branch' };
    expect((await world.warehouse.post('/api/v1/partners', body)).statusCode).toBe(403);
    expect((await world.auditor.post('/api/v1/partners', body)).statusCode).toBe(403);
    expect((await world.admin.post('/api/v1/partners', body)).statusCode).toBe(201);
  });

  it('renames a company and keeps its history attached', async () => {
    const company = await createCompany();
    await fileFor({ id: company.id });
    const renamed = await world.manager.patch(`/api/v1/partners/${company.id}`, {
      name: `${company.name} Inc`,
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<Detail>()).toMatchObject({ name: `${company.name} Inc`, requestCount: 1 });
  });

  it('refuses to archive a company with open work, then archives it once that is closed', async () => {
    const company = await createCompany();
    const filed = await fileFor({ id: company.id });
    const number = filed.json<{ number: string }>().number;

    const busy = await world.manager.post(`/api/v1/partners/${company.id}/archive`);
    expect(busy.statusCode).toBe(409);
    expect(busy.json<{ code: string }>().code).toBe('partner_busy');

    expect(
      (await world.manager.post(`/api/v1/transactions/${number}/cancel`, { reason: 'Not needed' }))
        .statusCode,
    ).toBe(200);
    const archived = await world.manager.post(`/api/v1/partners/${company.id}/archive`);
    expect(archived.statusCode).toBe(200);
    expect(archived.json<Detail>().status).toBe('archived');
  });

  it('keeps an archived company out of suggestions and refuses new requests for it', async () => {
    const company = await createCompany();
    expect((await world.manager.post(`/api/v1/partners/${company.id}/archive`)).statusCode).toBe(
      200,
    );

    const suggestions = (
      await world.warehouse.get(`/api/v1/partners?q=${encodeURIComponent(company.name)}`)
    ).json<{ id: string }[]>();
    expect(suggestions).toEqual([]);

    for (const choice of [
      { id: company.id },
      { name: company.name.toLowerCase(), type: 'reseller' },
    ]) {
      const refused = await fileFor(choice);
      expect(refused.statusCode).toBe(422);
      expect(refused.json<{ code: string }>().code).toBe('company_archived');
    }

    const restored = await world.manager.post(`/api/v1/partners/${company.id}/restore`);
    expect(restored.json<Detail>().status).toBe('active');
    expect((await fileFor({ id: company.id })).statusCode).toBe(201);
  });

  it('answers 404 for a company that does not exist', async () => {
    expect((await world.manager.get(`/api/v1/partners/${randomUUID()}`)).statusCode).toBe(404);
    expect((await world.manager.post(`/api/v1/partners/${randomUUID()}/archive`)).statusCode).toBe(
      404,
    );
  });
});

describe('partner contacts', () => {
  const contact = { name: 'Ana Reyes', email: 'ana@partner.test', phone: '+63 917 333 4444' };

  it('adds a contact, refuses the same email twice, and erases it', async () => {
    const company = await createCompany();
    const added = await world.manager.post(`/api/v1/partners/${company.id}/contacts`, contact);
    expect(added.statusCode).toBe(201);
    const contactId = added.json<Detail>().contacts[0]?.id;

    const twice = await world.manager.post(`/api/v1/partners/${company.id}/contacts`, {
      ...contact,
      email: 'ANA@partner.test',
    });
    expect(twice.statusCode).toBe(409);
    expect(twice.json<{ code: string }>().code).toBe('contact_exists');

    const removed = await world.manager.post(
      `/api/v1/partners/${company.id}/contacts/${contactId}/remove`,
    );
    expect(removed.statusCode).toBe(200);
    expect(removed.json<Detail>().contacts).toEqual([]);
    const again = await world.manager.post(
      `/api/v1/partners/${company.id}/contacts/${contactId}/remove`,
    );
    expect(again.statusCode).toBe(404);
  });

  it('keeps the audit log free of contact details', async () => {
    const company = await createCompany();
    await world.manager.post(`/api/v1/partners/${company.id}/contacts`, contact);
    const log = await world.admin.get('/api/v1/audit?limit=50');
    expect(log.body).not.toContain(contact.email);
    expect(log.body).not.toContain(contact.phone);
  });
});

describe('partner double-fire', () => {
  it('creates one company for two sequential presses with one key', async () => {
    const key = randomUUID();
    const body = { name: companyName(), type: 'partner' };
    const first = await world.manager.post('/api/v1/partners', body, { key });
    const second = await world.manager.post('/api/v1/partners', body, { key });
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(second.json<Detail>().id).toBe(first.json<Detail>().id);
  });

  it('creates one company for two concurrent presses with one key', async () => {
    const key = randomUUID();
    const body = { name: companyName(), type: 'partner' };
    const [a, b] = await Promise.all([
      world.manager.post('/api/v1/partners', body, { key }),
      world.manager.post('/api/v1/partners', body, { key }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json()).toEqual(b.json());
    const found = (
      await world.manager.get(`/api/v1/partners/directory?q=${encodeURIComponent(body.name)}`)
    ).json<{
      total: number;
    }>();
    expect(found.total).toBe(1);
  });

  it('adds one contact for two concurrent presses with one key', async () => {
    const company = await createCompany();
    const key = randomUUID();
    const body = { name: 'Cara Lim', email: 'cara@partner.test', phone: '+63 917 555 6666' };
    const [a, b] = await Promise.all([
      world.manager.post(`/api/v1/partners/${company.id}/contacts`, body, { key }),
      world.manager.post(`/api/v1/partners/${company.id}/contacts`, body, { key }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect((await detailOf(company.id)).contactCount).toBe(1);
  });

  it('archives once when two managers press at the same moment', async () => {
    const company = await createCompany();
    const [a, b] = await Promise.all([
      world.manager.post(`/api/v1/partners/${company.id}/archive`),
      world.admin.post(`/api/v1/partners/${company.id}/archive`),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const log = (await world.admin.get('/api/v1/audit?limit=100')).json<{
      items: { action: string; targetId: string | null }[];
    }>();
    const archives = log.items.filter(
      (entry) => entry.action === 'partner.archive' && entry.targetId === company.id,
    );
    expect(archives).toHaveLength(1);
  });
});
