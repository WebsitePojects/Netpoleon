import { randomBytes } from 'node:crypto';
import { CLIENT_HEADER, SESSION_COOKIE } from '@wms/contracts';
import { Database, schema } from '@wms/db';
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
