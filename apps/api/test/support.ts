import { randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { getTestDb, withClient } from '../../../packages/db/test/helpers.js';
import { hashPassword } from '../src/platform/password.js';
import { TestApps } from './harness.js';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct horse battery';

let sequence = 0;
/** Unique per call across parallel test files: they share one database and never clean up. */
export function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}${Date.now().toString(36)}${sequence}${randomUUID().slice(0, 4)}`.toLowerCase();
}

export type StaffRole = 'admin' | 'manager' | 'warehouse' | 'auditor';

/** Inserts an active staff user straight into the database, as the first-admin command would. */
export async function seedStaff(
  role: StaffRole,
  password = PASSWORD,
): Promise<{ id: string; username: string }> {
  const username = unique(role.slice(0, 3));
  const hash = await hashPassword(password);
  return withClient(getTestDb().superuserUrl, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (username, email, full_name, password_hash, kind, role, status)
       VALUES ($1, $2, $3, $4, 'staff', $5, 'active') RETURNING id`,
      [username, `${username}@example.test`, `Test ${role}`, hash, role],
    );
    return { id: rows[0]?.id as string, username };
  });
}

/**
 * A signed-in browser: carries the session cookie, the CSRF header and our Origin, and a fresh
 * Idempotency-Key per mutating call unless one is given.
 */
export class Browser {
  constructor(
    private readonly app: FastifyInstance,
    private cookie: string | null = null,
  ) {}

  static async signIn(
    app: FastifyInstance,
    identifier: string,
    password = PASSWORD,
  ): Promise<Browser> {
    const browser = new Browser(app);
    const response = await browser.post('/api/v1/auth/login', {
      identifier,
      password,
      remember: false,
    });
    if (response.statusCode !== 200) {
      throw new Error(`sign-in failed: ${response.statusCode} ${response.body}`);
    }
    return browser;
  }

  get(url: string, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    return this.app.inject({ method: 'GET', url, headers: { ...this.cookieHeader(), ...headers } });
  }

  async send(
    method: 'POST' | 'PATCH',
    url: string,
    body: unknown,
    options: { key?: string; headers?: Record<string, string> } = {},
  ): Promise<LightMyRequestResponse> {
    const response = await this.app.inject({
      method,
      url,
      payload: body as object,
      headers: {
        origin: ORIGIN,
        'x-wms-request': '1',
        'idempotency-key': options.key ?? randomUUID(),
        ...this.cookieHeader(),
        ...options.headers,
      },
    });
    const setCookie = response.cookies.find((c) => c.name.endsWith('wms_session'));
    if (setCookie) this.cookie = setCookie.value ? `${setCookie.name}=${setCookie.value}` : null;
    return response;
  }

  post(
    url: string,
    body: unknown = {},
    options: { key?: string; headers?: Record<string, string> } = {},
  ) {
    return this.send('POST', url, body, options);
  }

  patch(url: string, body: unknown, options: { key?: string } = {}) {
    return this.send('PATCH', url, body, options);
  }

  private cookieHeader(): Record<string, string> {
    return this.cookie ? { cookie: this.cookie } : {};
  }
}

export interface World {
  apps: TestApps;
  app: FastifyInstance;
  admin: Browser;
  manager: Browser;
  warehouse: Browser;
  auditor: Browser;
  shelfId: string;
  otherShelfId: string;
  modelId: string;
  accessories: string[];
}

/** An app, one signed-in user per role, a site/room/two shelves and a bookable model. */
export async function buildWorld(): Promise<World> {
  const apps = new TestApps();
  const { staffUrl, partnerUrl } = getTestDb();
  const { app, logLines } = await apps.create({ urls: { staffUrl, partnerUrl } });
  const [a, m, w, au] = await Promise.all([
    seedStaff('admin'),
    seedStaff('manager'),
    seedStaff('warehouse'),
    seedStaff('auditor'),
  ]);
  const admin = await Browser.signIn(app, a.username);
  const manager = await Browser.signIn(app, m.username);
  const warehouse = await Browser.signIn(app, w.username);
  const auditor = await Browser.signIn(app, au.username);

  const id = (response: LightMyRequestResponse): string => {
    if (response.statusCode !== 201) {
      // The 500 body is opaque by design; the cause is in the app's own log.
      const cause = logLines.filter((line) => line.includes('"err"')).slice(-1)[0] ?? '';
      throw new Error(`setup failed: ${response.statusCode} ${response.body}
${cause.slice(0, 2000)}`);
    }
    return response.json<{ id: string }>().id;
  };
  const tag = unique('L').toUpperCase().slice(0, 12);
  const site = id(
    await admin.post('/api/v1/locations', { kind: 'site', code: `S${tag}`, name: `Site ${tag}` }),
  );
  const room = id(
    await admin.post('/api/v1/locations', {
      kind: 'room',
      code: `R${tag}`,
      name: `Room ${tag}`,
      parentId: site,
    }),
  );
  const shelfId = id(
    await admin.post('/api/v1/locations', {
      kind: 'shelf',
      code: `A${tag}`,
      name: `Shelf A ${tag}`,
      parentId: room,
    }),
  );
  const otherShelfId = id(
    await admin.post('/api/v1/locations', {
      kind: 'shelf',
      code: `B${tag}`,
      name: `Shelf B ${tag}`,
      parentId: room,
    }),
  );
  const categories = (await admin.get('/api/v1/categories')).json<{ id: string; code: string }[]>();
  const switchCategory = categories.find((c) => c.code === 'SW');
  const accessories = ['Power adapter', 'Rack ears'];
  const modelId = id(
    await admin.post('/api/v1/models', {
      categoryId: switchCategory?.id,
      brand: 'Testco',
      name: `Model ${tag}`,
      accessories,
    }),
  );
  return {
    apps,
    app,
    admin,
    manager,
    warehouse,
    auditor,
    shelfId,
    otherShelfId,
    modelId,
    accessories,
  };
}

/** Manila "today" plus `days`, as a date key. */
export function dayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
