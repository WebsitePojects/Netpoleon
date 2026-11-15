import { randomBytes } from 'node:crypto';
import { CLIENT_HEADER, SESSION_COOKIE } from '@wms/contracts';
import { Database, schema } from '@wms/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { getTestDb } from '../../../packages/db/test/helpers.js';
import { hashPassword } from '../src/platform/crypto.js';
import { configFor } from './harness.js';

export const GOOD_PASSWORD = 'quiet-harbour-ninety-one';

/** A direct handle on the test database for arranging and checking rows. */
export function openDb(): Database {
  const { staffUrl, partnerUrl } = getTestDb();
  return new Database(configFor({ staffUrl, partnerUrl }).db, () => undefined);
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Creates a user with a unique email. Runs the real argon2id hash, as login will verify it. */
export async function createUser(
  db: Database,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
  password: string | null = GOOD_PASSWORD,
): Promise<TestUser> {
  const email = `user-${randomBytes(5).toString('hex')}@wms.test`;
  const passwordHash = password === null ? null : await hashPassword(password);
  const [row] = await db.transaction({ kind: 'system' }, (tx) =>
    tx
      .insert(schema.users)
      .values({
        email,
        fullName: 'Test Person',
        kind: 'staff',
        role: 'warehouse',
        status: password === null ? 'invited' : 'active',
        passwordHash,
        ...overrides,
      })
      .returning({ id: schema.users.id, email: schema.users.email }),
  );
  if (!row) throw new Error('user insert returned no row');
  return { id: row.id, email: row.email, password: password ?? '' };
}

interface Send {
  body?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
  /** Leave out the client header, to test the CSRF guard. */
  bare?: boolean;
}

/** Sends a request the way the web app does: JSON, with the client header on every call. */
export function send(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  { body, cookie, headers = {}, bare = false }: Send = {},
): Promise<LightMyRequestResponse> {
  const options: InjectOptions = {
    method,
    url,
    headers: {
      ...(bare ? {} : { [CLIENT_HEADER]: 'web' }),
      ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) options.payload = body as NonNullable<InjectOptions['payload']>;
  return app.inject(options);
}

/** The session cookie value from a response's Set-Cookie, or null. */
export function sessionFrom(response: LightMyRequestResponse): string | null {
  const header = response.headers['set-cookie'];
  const line = Array.isArray(header) ? header[0] : header;
  const match = line ? new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(line) : null;
  return match?.[1] ? match[1] : null;
}

export async function login(
  app: FastifyInstance,
  user: TestUser,
  remember = false,
): Promise<string> {
  const response = await send(app, 'POST', '/api/v1/auth/login', {
    body: { email: user.email, password: user.password, remember },
  });
  const cookie = sessionFrom(response);
  if (response.statusCode !== 200 || !cookie) {
    throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  }
  return cookie;
}

const suffix = () => randomBytes(4).toString('hex').toUpperCase();

/** A site, a room inside it and two shelves inside the room, with unique codes. */
export async function createShelves(db: Database) {
  return db.transaction({ kind: 'system' }, async (tx) => {
    const tag = suffix();
    const insert = async (values: typeof schema.locations.$inferInsert) => {
      const [row] = await tx
        .insert(schema.locations)
        .values(values)
        .returning({ id: schema.locations.id });
      if (!row) throw new Error('location insert returned no row');
      return row.id;
    };
    const site = await insert({ kind: 'site', code: `S-${tag}`, name: `Site ${tag}` });
    const room = await insert({
      kind: 'room',
      code: `R-${tag}`,
      name: `Room ${tag}`,
      parentId: site,
    });
    const shelfA = await insert({
      kind: 'shelf',
      code: `A-${tag}`,
      name: `Shelf A ${tag}`,
      parentId: room,
    });
    const shelfB = await insert({
      kind: 'shelf',
      code: `B-${tag}`,
      name: `Shelf B ${tag}`,
      parentId: room,
    });
    return { site, room, shelfA, shelfB };
  });
}

/** A product model in a seeded category (FW by default), with accessories. */
export async function createModel(db: Database, categoryCode = 'FW') {
  return db.transaction({ kind: 'system' }, async (tx) => {
    const [category] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.code, categoryCode));
    if (!category) throw new Error(`category ${categoryCode} is not seeded`);
    const [model] = await tx
      .insert(schema.productModels)
      .values({ categoryId: category.id, brand: 'Fortinet', modelName: `FG-${suffix()}` })
      .returning({ id: schema.productModels.id });
    if (!model) throw new Error('model insert returned no row');
    await tx.insert(schema.modelAccessories).values([
      { productModelId: model.id, name: 'Power adapter' },
      { productModelId: model.id, name: 'Console cable' },
    ]);
    return { categoryId: category.id, modelId: model.id };
  });
}

/** A fresh idempotency key: one per user intent. */
export const intent = () => ({ 'idempotency-key': `intent-${randomBytes(8).toString('hex')}` });
