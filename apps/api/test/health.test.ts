import { problemSchema } from '@wms/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { getTestDb } from '../../../packages/db/test/helpers.js';
import { CLOSED_PORT_URL, TestApps } from './harness.js';

const apps = new TestApps();
afterEach(() => apps.closeAll());

const unreachable = { staffUrl: CLOSED_PORT_URL, partnerUrl: CLOSED_PORT_URL };

describe('health routes', () => {
  it('healthz returns 200 without touching the database', async () => {
    const { app } = await apps.create({ urls: unreachable });

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('readyz returns 200 when the database is migrated', async () => {
    const { staffUrl, partnerUrl } = getTestDb();
    const { app } = await apps.create({ urls: { staffUrl, partnerUrl } });

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('readyz returns 503 problem within 1500 ms when the database is unreachable', async () => {
    const { app } = await apps.create({ urls: unreachable });

    const startedAt = Date.now();
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1500);
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(problemSchema.parse(response.json())).toMatchObject({ code: 'not_ready', status: 503 });

    const liveness = await app.inject({ method: 'GET', url: '/healthz' });
    expect(liveness.statusCode).toBe(200);
  });
});
