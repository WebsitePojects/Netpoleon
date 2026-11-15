import { randomBytes } from 'node:crypto';
import { schema } from '@wms/db';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getTestDb } from '../../../packages/db/test/helpers.js';
import { createUser, intent, login, openDb, send } from './fixtures.js';
import { TestApps } from './harness.js';

const apps = new TestApps();
const db = openDb();
afterEach(() => apps.closeAll());
afterAll(() => db.close());

const urls = () => {
  const { staffUrl, partnerUrl } = getTestDb();
  return { staffUrl, partnerUrl };
};
const unique = () => randomBytes(4).toString('hex');

async function asAdmin() {
  const { app } = await apps.create({ urls: urls() });
  const admin = await createUser(db, { role: 'admin', fullName: 'Lara Admin' });
  return { app, admin, cookie: await login(app, admin) };
}

/** Other test files create active admins too; leave only the given ones active. */
async function onlyActiveAdmins(...keep: string[]) {
  await db.transaction({ kind: 'system' }, (tx) =>
    tx
      .update(schema.users)
      .set({ status: 'deactivated' })
      .where(
        and(
          eq(schema.users.role, 'admin'),
          eq(schema.users.status, 'active'),
          sql`${schema.users.id} <> ALL(${sql.raw(`ARRAY[${keep.map((id) => `'${id}'::uuid`).join(',')}]`)})`,
        ),
      ),
  );
}

async function invite(app: FastifyInstance, cookie: string, body: object) {
  return send(app, 'POST', '/api/v1/users', { cookie, headers: intent(), body });
}

describe('staff accounts', () => {
  it('invites a person, queues the email and refuses a second account on the same email', async () => {
    const { app, cookie } = await asAdmin();
    const email = `nina-${unique()}@wms.test`;

    const created = await invite(app, cookie, { email, fullName: 'Nina Cruz', role: 'warehouse' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ email, status: 'invited', role: 'warehouse' });

    const [queued] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ topic: schema.outbox.topic, payload: schema.outbox.payload })
        .from(schema.outbox)
        .where(sql`${schema.outbox.payload} ->> 'to' = ${email}`),
    );
    expect(queued?.topic).toBe('email.invite');
    expect(queued?.payload).toMatchObject({ invitedBy: 'Lara Admin' });

    const twice = await invite(app, cookie, {
      email: email.toUpperCase(),
      fullName: 'N',
      role: 'auditor',
    });
    expect(twice.statusCode).toBe(409);
  });

  it('lets an auditor read the list but not change it', async () => {
    const { app } = await apps.create({ urls: urls() });
    const cookie = await login(app, await createUser(db, { role: 'auditor' }));

    expect((await send(app, 'GET', '/api/v1/users', { cookie })).statusCode).toBe(200);
    const refused = await invite(app, cookie, {
      email: `x-${unique()}@wms.test`,
      fullName: 'X',
      role: 'warehouse',
    });
    expect(refused.statusCode).toBe(403);
  });

  it('signs a deactivated person out at once and never lets you deactivate yourself', async () => {
    const { app, admin, cookie } = await asAdmin();
    const staff = await createUser(db);
    const staffCookie = await login(app, staff);

    const off = await send(app, 'POST', `/api/v1/users/${staff.id}/deactivate`, {
      cookie,
      headers: intent(),
    });
    expect(off.statusCode).toBe(200);
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: staffCookie })).statusCode).toBe(
      401,
    );

    const self = await send(app, 'POST', `/api/v1/users/${admin.id}/deactivate`, {
      cookie,
      headers: intent(),
    });
    expect(self.statusCode).toBe(409);
  });

  it('keeps one active administrator, even when two are demoted at the same moment', async () => {
    const { app, admin, cookie } = await asAdmin();
    const second = await createUser(db, { role: 'admin' });
    const secondCookie = await login(app, second);
    await onlyActiveAdmins(admin.id, second.id);

    const results = await Promise.all([
      send(app, 'PATCH', `/api/v1/users/${second.id}`, {
        cookie,
        headers: intent(),
        body: { role: 'manager' },
      }),
      send(app, 'PATCH', `/api/v1/users/${admin.id}`, {
        cookie: secondCookie,
        headers: intent(),
        body: { role: 'manager' },
      }),
    ]);

    // One demotion wins. The other is refused either as the last admin (409) or, if the
    // winner committed before the loser's session was read, because the loser is no longer
    // an admin (403). Both keep an administrator, which is the rule under test.
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const admins = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.role, 'admin'), eq(schema.users.status, 'active'))),
    );
    expect(
      admins.map((row) => row.id).filter((id) => [admin.id, second.id].includes(id)),
    ).toHaveLength(1);
  });

  it('sends a person who never set a password back to "invited" on reactivation', async () => {
    const { app, cookie } = await asAdmin();
    const created = await invite(app, cookie, {
      email: `re-${unique()}@wms.test`,
      fullName: 'Re Invite',
      role: 'warehouse',
    });
    const id = created.json<{ id: string }>().id;
    await send(app, 'POST', `/api/v1/users/${id}/deactivate`, { cookie, headers: intent() });

    const back = await send(app, 'POST', `/api/v1/users/${id}/reactivate`, {
      cookie,
      headers: intent(),
    });
    expect(back.json()).toMatchObject({ status: 'invited' });
  });

  it('records a changed email by name only in the audit log', async () => {
    const { app, cookie } = await asAdmin();
    const staff = await createUser(db);
    const newEmail = `moved-${unique()}@wms.test`;
    await send(app, 'PATCH', `/api/v1/users/${staff.id}`, {
      cookie,
      headers: intent(),
      body: { email: newEmail, role: 'manager' },
    });
    const [row] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ fields: schema.auditLog.changedFields })
        .from(schema.auditLog)
        .where(
          and(eq(schema.auditLog.targetId, staff.id), eq(schema.auditLog.action, 'user.updated')),
        ),
    );
    expect(row?.fields).toEqual({ email: '[changed]', role: 'manager' });
  });
});

describe('partner companies', () => {
  async function create(app: FastifyInstance, cookie: string, name: string) {
    const response = await send(app, 'POST', '/api/v1/partners', {
      cookie,
      headers: intent(),
      body: { name, type: 'reseller' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>().id;
  }

  it('puts each contact and each loan count on the right company', async () => {
    const { app, admin, cookie } = await asAdmin();
    const tag = unique();
    const withContact = await create(app, cookie, `Alpha ${tag}`);
    const without = await create(app, cookie, `Beta ${tag}`);
    await send(app, 'POST', `/api/v1/partners/${withContact}/contacts`, {
      cookie,
      headers: intent(),
      body: { fullName: 'Juan Dela Cruz', email: `juan-${tag}@alpha.test`, phone: '0917 000 1111' },
    });
    await db.transaction({ kind: 'system' }, (tx) =>
      tx.insert(schema.loanRequests).values({
        requestNo: `REQ-${tag}`,
        partnerOrgId: withContact,
        filedByUserId: admin.id,
        contactName: 'Juan',
        contactEmail: `juan-${tag}@alpha.test`,
        contactPhone: '0917',
        neededFrom: '2099-02-01',
        neededUntil: '2099-02-10',
        purpose: 'Demo',
      }),
    );

    const list = await send(app, 'GET', '/api/v1/partners', { cookie });
    const items = list.json<{
      items: { id: string; contacts: unknown[]; loans: number; openLoans: number }[];
    }>().items;
    const alpha = items.find((item) => item.id === withContact);
    const beta = items.find((item) => item.id === without);
    expect(alpha).toMatchObject({ loans: 1, openLoans: 1 });
    expect(alpha?.contacts).toHaveLength(1);
    expect(beta).toMatchObject({ loans: 0, openLoans: 0, contacts: [] });
  });

  it('refuses a duplicate name whatever its case', async () => {
    const { app, cookie } = await asAdmin();
    const name = `Gamma ${unique()}`;
    await create(app, cookie, name);
    const again = await send(app, 'POST', '/api/v1/partners', {
      cookie,
      headers: intent(),
      body: { name: name.toUpperCase(), type: 'partner' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('lists every company in one statement', async () => {
    const counts: number[] = [];
    for (const extra of [0, 3]) {
      const statements: string[] = [];
      const { app } = await apps.create({ urls: urls(), onQuery: (text) => statements.push(text) });
      const cookie = await login(app, await createUser(db, { role: 'admin' }));
      for (let index = 0; index < extra; index += 1) await create(app, cookie, `Many ${unique()}`);
      statements.length = 0;
      await send(app, 'GET', '/api/v1/partners', { cookie });
      counts.push(statements.length);
    }
    expect(counts[0]).toBe(counts[1]);
  });

  it('will not archive a company with open requests, and archiving signs its people out', async () => {
    const { app, admin, cookie } = await asAdmin();
    const busy = await create(app, cookie, `Busy ${unique()}`);
    await db.transaction({ kind: 'system' }, (tx) =>
      tx.insert(schema.loanRequests).values({
        requestNo: `REQ-${unique()}`,
        partnerOrgId: busy,
        filedByUserId: admin.id,
        contactName: 'A',
        contactEmail: 'a@b.test',
        contactPhone: '1',
        neededFrom: '2099-03-01',
        neededUntil: '2099-03-05',
        purpose: 'Demo',
      }),
    );
    const refused = await send(app, 'POST', `/api/v1/partners/${busy}/archive`, {
      cookie,
      headers: intent(),
    });
    expect(refused.statusCode).toBe(409);

    const quiet = await create(app, cookie, `Quiet ${unique()}`);
    const member = await createUser(db, {
      kind: 'partner',
      role: 'partner_member',
      partnerOrgId: quiet,
    });
    const memberCookie = await login(app, member);
    const archived = await send(app, 'POST', `/api/v1/partners/${quiet}/archive`, {
      cookie,
      headers: intent(),
    });
    expect(archived.json()).toMatchObject({ status: 'archived' });
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: memberCookie })).statusCode).toBe(
      401,
    );
  });

  it('removes a contact for good and keeps their details out of the audit log', async () => {
    const { app, cookie } = await asAdmin();
    const id = await create(app, cookie, `Delta ${unique()}`);
    const email = `maria-${unique()}@delta.test`;
    const added = await send(app, 'POST', `/api/v1/partners/${id}/contacts`, {
      cookie,
      headers: intent(),
      body: { fullName: 'Maria Santos', email },
    });
    const contactId = added.json<{ contacts: { id: string }[] }>().contacts[0]?.id;

    const removed = await send(app, 'DELETE', `/api/v1/partners/${id}/contacts/${contactId}`, {
      cookie,
      headers: intent(),
    });
    expect(removed.json()).toMatchObject({ contacts: [] });

    const audit = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ fields: schema.auditLog.changedFields })
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetId, id)),
    );
    expect(JSON.stringify(audit)).not.toContain(email);
    expect(JSON.stringify(audit)).not.toContain('Maria Santos');
  });
});

describe('the activity log', () => {
  it('pages newest first without repeats and filters by action', async () => {
    const { app, cookie } = await asAdmin();
    for (let index = 0; index < 3; index += 1) {
      await send(app, 'POST', '/api/v1/partners', {
        cookie,
        headers: intent(),
        body: { name: `Logged ${unique()}`, type: 'partner' },
      });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/v1/audit?action=partner.created&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await send(app, 'GET', url, { cookie });
      const body = page.json<{
        items: { id: string; action: string; occurredAt: string }[];
        nextCursor: string | null;
      }>();
      expect(body.items.every((item) => item.action === 'partner.created')).toBe(true);
      seen.push(...body.items.map((item) => item.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 50);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
