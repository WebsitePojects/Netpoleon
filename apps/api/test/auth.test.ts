import { schema } from '@wms/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getTestDb } from '../../../packages/db/test/helpers.js';
import { sha256 } from '../src/platform/crypto.js';
import {
  createUser,
  GOOD_PASSWORD,
  login,
  openDb,
  send,
  sessionFrom,
  type TestUser,
} from './fixtures.js';
import { TestApps } from './harness.js';

const apps = new TestApps();
const db = openDb();
afterEach(() => apps.closeAll());
afterAll(() => db.close());

const urls = () => {
  const { staffUrl, partnerUrl } = getTestDb();
  return { staffUrl, partnerUrl };
};
const newApp = async (nodeEnv: 'test' | 'production' = 'test') =>
  (await apps.create({ urls: urls(), nodeEnv })).app;

/** The latest queued email for an address, with its link. */
async function latestEmail(to: string) {
  const rows = await db.transaction({ kind: 'system' }, (tx) =>
    tx
      .select({ topic: schema.outbox.topic, payload: schema.outbox.payload })
      .from(schema.outbox)
      .where(sql`${schema.outbox.payload} ->> 'to' = ${to}`)
      .orderBy(sql`${schema.outbox.createdAt} DESC`)
      .limit(1),
  );
  const row = rows[0];
  return row ? { topic: row.topic, link: String((row.payload as { link: string }).link) } : null;
}

const tokenOf = (link: string) => link.split('/').at(-1) ?? '';

describe('sign-in', () => {
  it('sets an HttpOnly, SameSite=Lax session cookie and /me returns the user', async () => {
    const app = await newApp();
    const user = await createUser(db, { fullName: 'Lara Admin', role: 'admin' });

    const response = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email.toUpperCase(), password: GOOD_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Max-Age');
    expect(response.json()).toMatchObject({ user: { email: user.email, role: 'admin' } });

    const me = await send(app, 'GET', '/api/v1/auth/me', { cookie: sessionFrom(response) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: user.id, fullName: 'Lara Admin' } });
  });

  it('marks the cookie Secure in production and keeps it for the remember-me length', async () => {
    const app = await newApp('production');
    const user = await createUser(db);

    const response = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: GOOD_PASSWORD, remember: true },
    });

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${7 * 86_400}`);
  });

  it('stores only a hash of the session token', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const token = await login(app, user);

    const rows = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ hash: schema.sessions.tokenHash })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash.equals(sha256(token))).toBe(true);
    expect(rows[0]?.hash.toString('utf8')).not.toContain(token);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const app = await newApp();
    const user = await createUser(db);

    const wrong = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'not-the-password-at-all' },
    });
    const unknown = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: 'nobody-here@wms.test', password: 'not-the-password-at-all' },
    });

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
    expect(strip(wrong.json())).toEqual(strip(unknown.json()));
  });

  it('refuses invited and deactivated accounts with the same message', async () => {
    const app = await newApp();
    const deactivated = await createUser(db, { status: 'deactivated' });
    const invited = await createUser(db, { status: 'invited', passwordHash: null }, null);

    for (const user of [deactivated, { ...invited, password: GOOD_PASSWORD }]) {
      const response = await send(app, 'POST', '/api/v1/auth/login', {
        body: { email: user.email, password: GOOD_PASSWORD },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'invalid_credentials' });
    }
  });

  it('locks the account after five failures, even against the right password', async () => {
    const app = await newApp();
    const user = await createUser(db);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await send(app, 'POST', '/api/v1/auth/login', {
        body: { email: user.email, password: 'wrong-password-123' },
      });
    }
    const locked = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: GOOD_PASSWORD },
    });
    expect(locked.statusCode).toBe(401);

    await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.users)
        .set({ lockedUntil: sql`now() - interval '1 second'` })
        .where(eq(schema.users.id, user.id)),
    );
    const afterLock = await send(app, 'POST', '/api/v1/auth/login', {
      body: { email: user.email, password: GOOD_PASSWORD },
    });
    expect(afterLock.statusCode).toBe(200);
  });

  it('rate-limits repeated attempts on one email with a Retry-After', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await send(app, 'POST', '/api/v1/auth/login', {
        body: { email: user.email, password: 'wrong-password-123' },
      });
      statuses.push(response.statusCode);
      if (response.statusCode === 429) {
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      }
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('sessions', () => {
  it('ends on logout and the cookie stops working', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const token = await login(app, user);

    const out = await send(app, 'POST', '/api/v1/auth/logout', { cookie: token });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');

    const me = await send(app, 'GET', '/api/v1/auth/me', { cookie: token });
    expect(me.statusCode).toBe(401);
  });

  it('expires after the idle limit and ends for a deactivated user at once', async () => {
    const app = await newApp();
    const idle = await createUser(db);
    const idleToken = await login(app, idle);
    await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.sessions)
        .set({ idleExpiresAt: sql`now() - interval '1 second'` })
        .where(eq(schema.sessions.userId, idle.id)),
    );
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: idleToken })).statusCode).toBe(401);

    const turnedOff = await createUser(db);
    const token = await login(app, turnedOff);
    await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .update(schema.users)
        .set({ status: 'deactivated' })
        .where(eq(schema.users.id, turnedOff.id)),
    );
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: token })).statusCode).toBe(401);
  });

  it('keeps the remember-me idle window on the session row', async () => {
    const app = await newApp();
    const user = await createUser(db);
    await login(app, user, true);
    const [row] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ idle: schema.sessions.idleSeconds })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id)),
    );
    expect(row?.idle).toBe(7 * 86_400);
  });

  it('looks the session up in one query per request', async () => {
    const statements: string[] = [];
    const { app } = await apps.create({ urls: urls(), onQuery: (text) => statements.push(text) });
    const user = await createUser(db);
    const token = await login(app, user);

    statements.length = 0;
    await send(app, 'GET', '/api/v1/auth/me', { cookie: token });
    expect(statements).toHaveLength(1);
  });
});

describe('cross-site request forgery', () => {
  it('refuses a state change without the client header or from another origin', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const body = { email: user.email, password: GOOD_PASSWORD };

    const bare = await send(app, 'POST', '/api/v1/auth/login', { body, bare: true });
    const foreign = await send(app, 'POST', '/api/v1/auth/login', {
      body,
      headers: { origin: 'https://evil.example' },
    });
    const crossSite = await send(app, 'POST', '/api/v1/auth/login', {
      body,
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    const own = await send(app, 'POST', '/api/v1/auth/login', {
      body,
      headers: { origin: 'http://localhost:5173' },
    });

    expect(bare.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(403);
    expect(crossSite.statusCode).toBe(403);
    expect(bare.json()).toMatchObject({ code: 'csrf_rejected' });
    expect(own.statusCode).toBe(200);
  });
});

describe('password reset links', () => {
  async function requestReset(app: Awaited<ReturnType<typeof newApp>>, user: TestUser) {
    const response = await send(app, 'POST', '/api/v1/auth/password/forgot', {
      body: { email: user.email },
    });
    expect(response.statusCode).toBe(202);
    const email = await latestEmail(user.email);
    if (!email) throw new Error('no reset email was queued');
    return tokenOf(email.link);
  }

  it('answers 202 for any address and queues an email only for a real account', async () => {
    const app = await newApp();
    const unknown = await send(app, 'POST', '/api/v1/auth/password/forgot', {
      body: { email: 'no-such-person@wms.test' },
    });
    expect(unknown.statusCode).toBe(202);
    expect(await latestEmail('no-such-person@wms.test')).toBeNull();

    const user = await createUser(db);
    await requestReset(app, user);
    expect((await latestEmail(user.email))?.topic).toBe('email.password_reset');
  });

  it('stores the token hashed, works once, signs the account out and sets the password', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const oldSession = await login(app, user);
    const token = await requestReset(app, user);

    const stored = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ hash: schema.authTokens.tokenHash })
        .from(schema.authTokens)
        .where(eq(schema.authTokens.userId, user.id)),
    );
    expect(stored.some((row) => row.hash.equals(sha256(token)))).toBe(true);

    const owner = await send(app, 'GET', `/api/v1/auth/links/password_reset/${token}`);
    expect(owner.json()).toEqual({ fullName: 'Test Person', email: user.email });

    const weak = await send(app, 'POST', '/api/v1/auth/links/password_reset', {
      body: { token, password: 'password1234' },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ code: 'weak_password' });

    const done = await send(app, 'POST', '/api/v1/auth/links/password_reset', {
      body: { token, password: 'new-shelf-label-seven' },
    });
    expect(done.statusCode).toBe(204);
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: oldSession })).statusCode).toBe(
      401,
    );
    await login(app, { ...user, password: 'new-shelf-label-seven' });

    const again = await send(app, 'POST', '/api/v1/auth/links/password_reset', {
      body: { token, password: 'another-shelf-label' },
    });
    expect(again.statusCode).toBe(410);
  });

  it('has one effect when the same link is submitted twice at once', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const token = await requestReset(app, user);

    const results = await Promise.all(
      ['first-concurrent-pass', 'second-concurrent-pass'].map((password) =>
        send(app, 'POST', '/api/v1/auth/links/password_reset', { body: { token, password } }),
      ),
    );

    expect(results.map((response) => response.statusCode).sort()).toEqual([204, 410]);
  });

  it('voids the previous link when a new one is requested', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const first = await requestReset(app, user);
    const second = await requestReset(app, user);

    expect((await send(app, 'GET', `/api/v1/auth/links/password_reset/${first}`)).statusCode).toBe(
      410,
    );
    expect((await send(app, 'GET', `/api/v1/auth/links/password_reset/${second}`)).statusCode).toBe(
      200,
    );
  });
});

describe('invitations', () => {
  it('activates an invited account with its own password, and only through an invite link', async () => {
    const app = await newApp();
    const invited = await createUser(db, {}, null);
    const link = await db.transaction({ kind: 'system' }, async (tx) => {
      const { AuthTokens } = await import('../src/modules/auth/auth-tokens.js');
      const { AuthRepository } = await import('../src/modules/auth/auth.repository.js');
      const { Outbox } = await import('../src/platform/outbox.js');
      const { AuditWriter, SYSTEM_CONTEXT } = await import('../src/platform/audit.js');
      const tokens = new AuthTokens(
        new AuthRepository(),
        new Outbox(),
        new AuditWriter(),
        'http://localhost:5173',
      );
      return tokens.issue(
        tx,
        SYSTEM_CONTEXT,
        { id: invited.id, email: invited.email, fullName: 'Test Person' },
        'invite',
      );
    });
    const token = tokenOf(link);

    const wrongPurpose = await send(app, 'POST', '/api/v1/auth/links/password_reset', {
      body: { token, password: 'my-first-real-password' },
    });
    expect(wrongPurpose.statusCode).toBe(410);

    const accepted = await send(app, 'POST', '/api/v1/auth/links/invite', {
      body: { token, password: 'my-first-real-password' },
    });
    expect(accepted.statusCode).toBe(204);
    await login(app, { ...invited, password: 'my-first-real-password' });

    const [row] = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, invited.id)),
    );
    expect(row?.status).toBe('active');
  });
});

describe('changing a password', () => {
  it('needs the current password and signs out every other session', async () => {
    const app = await newApp();
    const user = await createUser(db);
    const here = await login(app, user);
    const elsewhere = await login(app, user);

    const wrong = await send(app, 'POST', '/api/v1/auth/password/change', {
      cookie: here,
      body: { currentPassword: 'not-my-password', newPassword: 'brand-new-label-nine' },
    });
    expect(wrong.statusCode).toBe(400);

    const changed = await send(app, 'POST', '/api/v1/auth/password/change', {
      cookie: here,
      body: { currentPassword: GOOD_PASSWORD, newPassword: 'brand-new-label-nine' },
    });
    expect(changed.statusCode).toBe(204);
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: here })).statusCode).toBe(200);
    expect((await send(app, 'GET', '/api/v1/auth/me', { cookie: elsewhere })).statusCode).toBe(401);

    const audit = await db.transaction({ kind: 'system' }, (tx) =>
      tx
        .select({ fields: schema.auditLog.changedFields })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.targetId, user.id),
            eq(schema.auditLog.action, 'user.password_changed'),
          ),
        ),
    );
    // Recorded by name only: the audit log never holds a hash.
    expect(audit[0]?.fields).toEqual({ passwordHash: '[changed]' });
  });
});
